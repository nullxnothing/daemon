import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>()
  const projects: Array<Record<string, any>> = []
  const watchers: Array<{
    callback: (eventType: string, filename: string | Buffer | null) => void
    close: ReturnType<typeof vi.fn>
    error: ((error: Error) => void) | null
  }> = []

  return {
    handlers,
    projects,
    watchers,
    dialogResult: { canceled: true, filePaths: [] as string[] },
    watch: vi.fn((_root: string, _options: object, callback: (eventType: string, filename: string | Buffer | null) => void) => {
      const watcher = {
        callback,
        close: vi.fn(),
        error: null as ((error: Error) => void) | null,
        on: vi.fn((event: string, handler: (error: Error) => void) => {
          if (event === 'error') watcher.error = handler
          return watcher
        }),
      }
      watchers.push(watcher)
      return watcher
    }),
  }
})

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn(async () => mocks.dialogResult) },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => Promise<unknown>) => mocks.handlers.set(channel, handler),
  },
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, default: { ...actual, watch: mocks.watch } }
})

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      all: () => sql.includes('SELECT path FROM projects')
        ? mocks.projects.map(({ path: projectPath }) => ({ path: projectPath }))
        : [...mocks.projects],
      get: (value: string) => sql.includes('WHERE path = ?')
        ? mocks.projects.find((project) => project.path === value)
        : mocks.projects.find((project) => project.id === value),
      run: (id: string, name: string, projectPath: string, lastActive: number) => {
        mocks.projects.push({
          id,
          name,
          path: projectPath,
          git_remote: null,
          default_agent_id: null,
          status: 'active',
          session_summary: null,
          infra: '{}',
          aliases: '[]',
          wallet_id: null,
          created_at: lastActive,
          last_active: lastActive,
          pinned: 0,
          branch: null,
        })
      },
    }),
  }),
}))

vi.mock('../../electron/services/VoightService', () => ({ trackError: vi.fn() }))

import { setTrustedIpcOrigin } from '../../electron/security/ipcSender'
import { clearLiteProjectPickCapability, registerLiteProjectHandlers } from '../../electron/ipc/projects.lite'
import { registerLiteFilesystemHandlers, stopLiteFilesystemWatcher } from '../../electron/ipc/filesystem.lite'

interface TestEvent {
  sender: {
    id: number
    send: ReturnType<typeof vi.fn>
    isDestroyed: () => boolean
  }
  senderFrame: { url: string; parent: null }
}

let tempRoots: string[] = []

function makeEvent(senderId = 7, url = 'file:///C:/daemon-lite/lite.html'): TestEvent {
  return {
    sender: { id: senderId, send: vi.fn(), isDestroyed: () => false },
    senderFrame: { url, parent: null },
  }
}

async function invoke(channel: string, event: TestEvent, ...args: unknown[]) {
  return mocks.handlers.get(channel)!(event, ...args) as Promise<{ ok: boolean; data?: any; error?: string }>
}

async function makeTempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `daemon-lite-${label}-`))
  tempRoots.push(root)
  return root
}

describe('Lite workspace IPC boundary', () => {
  beforeAll(() => {
    setTrustedIpcOrigin('file://')
    registerLiteProjectHandlers()
    registerLiteFilesystemHandlers()
  })

  beforeEach(() => {
    mocks.projects.length = 0
    mocks.watchers.length = 0
    mocks.watch.mockClear()
    mocks.dialogResult = { canceled: true, filePaths: [] }
    clearLiteProjectPickCapability()
    stopLiteFilesystemWatcher()
  })

  afterAll(async () => {
    stopLiteFilesystemWatcher()
    const roots = tempRoots
    tempRoots = []
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
  })

  it('registers only the renderer-required Lite workspace channels', () => {
    expect([...mocks.handlers.keys()].sort()).toEqual([
      'fs:readDir',
      'fs:readFile',
      'fs:unwatch',
      'fs:watch',
      'fs:writeFile',
      'projects:create',
      'projects:list',
      'projects:openDialog',
    ])
    expect(mocks.handlers.has('fs:delete')).toBe(false)
    expect(mocks.handlers.has('fs:importPaths')).toBe(false)
    expect(mocks.handlers.has('projects:delete')).toBe(false)
  })

  it('requires a one-use, sender-bound native picker capability for project creation', async () => {
    const selected = await makeTempRoot('selected')
    const other = await makeTempRoot('other')
    const owner = makeEvent(7)

    expect(await invoke('projects:create', owner, { name: 'Bypass', path: selected })).toMatchObject({
      ok: false,
      error: 'Choose the project folder again before importing it',
    })

    mocks.dialogResult = { canceled: false, filePaths: [selected] }
    const picked = await invoke('projects:openDialog', owner)
    expect(picked).toMatchObject({ ok: true, data: await import('node:fs/promises').then(({ realpath }) => realpath(selected)) })

    const wrongSender = await invoke('projects:create', makeEvent(8), { name: 'Wrong sender', path: selected })
    expect(wrongSender).toMatchObject({ ok: false, error: 'Project folder selection belongs to another window' })

    mocks.dialogResult = { canceled: false, filePaths: [selected] }
    await invoke('projects:openDialog', owner)
    expect(await invoke('projects:create', owner, { name: 'Wrong path', path: other })).toMatchObject({
      ok: false,
      error: 'Project path does not match the selected folder',
    })
    expect(await invoke('projects:create', owner, { name: 'Replay', path: selected })).toMatchObject({ ok: false })

    await invoke('projects:openDialog', owner)
    const created = await invoke('projects:create', owner, { name: 'Selected project', path: selected })
    expect(created.ok).toBe(true)
    expect(created.data).toMatchObject({ name: 'Selected project', path: picked.data })
    expect(await invoke('projects:create', owner, { name: 'Replay', path: selected })).toMatchObject({ ok: false })
  })

  it('issues the same capability for the packaged-smoke picker override only in smoke mode', async () => {
    const selected = await makeTempRoot('smoke-selected')
    const owner = makeEvent()
    const previousSmokeTest = process.env.DAEMON_SMOKE_TEST
    const previousSmokePath = process.env.DAEMON_SMOKE_PROJECT_DIALOG_PATH
    process.env.DAEMON_SMOKE_TEST = '1'
    process.env.DAEMON_SMOKE_PROJECT_DIALOG_PATH = selected
    try {
      const picked = await invoke('projects:openDialog', owner)
      expect(picked).toMatchObject({ ok: true })
      expect(await invoke('projects:create', owner, { name: 'Smoke project', path: picked.data })).toMatchObject({
        ok: true,
        data: { name: 'Smoke project', path: picked.data },
      })
      expect(await invoke('projects:create', owner, { name: 'Replay', path: picked.data })).toMatchObject({ ok: false })
    } finally {
      if (previousSmokeTest === undefined) delete process.env.DAEMON_SMOKE_TEST
      else process.env.DAEMON_SMOKE_TEST = previousSmokeTest
      if (previousSmokePath === undefined) delete process.env.DAEMON_SMOKE_PROJECT_DIALOG_PATH
      else process.env.DAEMON_SMOKE_PROJECT_DIALOG_PATH = previousSmokePath
    }
  })

  it('rejects untrusted senders before accessing projects or files', async () => {
    const remote = makeEvent(7, 'https://attacker.example/')
    expect(await invoke('projects:list', remote)).toEqual({ ok: false, error: 'IPC request rejected: untrusted sender frame' })
    expect(await invoke('fs:readFile', remote, 'C:\\outside.txt')).toEqual({ ok: false, error: 'IPC request rejected: untrusted sender frame' })
  })

  it('enforces registered realpath containment and blocks symlink escapes', async () => {
    const root = await makeTempRoot('root')
    const outside = await makeTempRoot('outside')
    const insideFile = path.join(root, 'inside.txt')
    const outsideFile = path.join(outside, 'outside.txt')
    await writeFile(insideFile, 'inside', 'utf8')
    await writeFile(outsideFile, 'outside', 'utf8')
    mocks.projects.push({ path: root })

    expect(await invoke('fs:readFile', makeEvent(), insideFile)).toMatchObject({ ok: true, data: { content: 'inside' } })
    expect(await invoke('fs:readFile', makeEvent(), outsideFile)).toMatchObject({ ok: false, error: 'Path outside registered project boundaries' })

    const link = path.join(root, 'escape')
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    expect(await invoke('fs:readFile', makeEvent(), path.join(link, 'outside.txt'))).toMatchObject({
      ok: false,
      error: 'Path outside registered project boundaries',
    })
  })

  it('limits edits to small UTF-8 text and refuses secret or keypair files', async () => {
    const root = await makeTempRoot('text')
    const source = path.join(root, 'source.ts')
    const envFile = path.join(root, '.env')
    const keypair = path.join(root, 'wallet-keypair.json')
    const binary = path.join(root, 'image.bin')
    await Promise.all([
      writeFile(source, 'export const value = 1\n', 'utf8'),
      writeFile(envFile, 'TOKEN=old\n', 'utf8'),
      writeFile(keypair, '[1,2,3]\n', 'utf8'),
      writeFile(binary, Buffer.from([0, 1, 2, 3])),
    ])
    mocks.projects.push({ path: root })
    const event = makeEvent()

    expect(await invoke('fs:writeFile', event, source, 'export const value = 2\n')).toMatchObject({ ok: true })
    expect(await readFile(source, 'utf8')).toBe('export const value = 2\n')
    expect(await invoke('fs:writeFile', event, envFile, 'TOKEN=new\n')).toMatchObject({ ok: false, error: 'Lite Workbench refuses to write secret or keypair files' })
    expect(await invoke('fs:writeFile', event, keypair, '[4,5,6]\n')).toMatchObject({ ok: false, error: 'Lite Workbench refuses to write secret or keypair files' })
    expect(await invoke('fs:writeFile', event, source, 'bad\0content')).toMatchObject({ ok: false, error: 'Binary content cannot be written in Lite Workbench' })
    expect(await invoke('fs:readFile', event, binary)).toMatchObject({ ok: false, error: 'Binary files cannot be opened in Lite Workbench' })
  })

  it('keeps one watcher and emits changes only from the current registered root', async () => {
    vi.useFakeTimers()
    try {
      const firstRoot = await makeTempRoot('watch-one')
      const secondRoot = await makeTempRoot('watch-two')
      mocks.projects.push({ path: firstRoot }, { path: secondRoot })
      const event = makeEvent()

      expect((await invoke('fs:watch', event, firstRoot)).ok).toBe(true)
      expect((await invoke('fs:watch', event, secondRoot)).ok).toBe(true)
      expect(mocks.watchers[0].close).toHaveBeenCalledOnce()

      mocks.watchers[0].callback('change', 'stale.ts')
      mocks.watchers[1].callback('change', 'active.ts')
      await vi.advanceTimersByTimeAsync(250)
      expect(event.sender.send).toHaveBeenCalledTimes(1)
      expect(event.sender.send).toHaveBeenCalledWith('fs:changed', { rootPath: secondRoot })

      expect((await invoke('fs:unwatch', event)).ok).toBe(true)
      expect(mocks.watchers[1].close).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

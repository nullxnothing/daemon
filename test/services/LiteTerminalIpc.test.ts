import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>()
  const listeners = new Map<string, (...args: any[]) => void>()
  const dataCallbacks: Array<(data: string) => void> = []
  const exitCallbacks: Array<(event: { exitCode: number }) => void> = []
  const terminals: Array<{
    pid: number
    write: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
  }> = []

  return {
    handlers,
    listeners,
    dataCallbacks,
    exitCallbacks,
    terminals,
    validateCwd: vi.fn(),
    clipboardReadText: vi.fn(() => 'from clipboard'),
    execFileSync: vi.fn(),
    spawn: vi.fn(() => {
      const terminal = {
        pid: 100 + terminals.length,
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
      }
      terminals.push(terminal)
      return {
        ...terminal,
        onData: (callback: (data: string) => void) => dataCallbacks.push(callback),
        onExit: (callback: (event: { exitCode: number }) => void) => exitCallbacks.push(callback),
      }
    }),
  }
})

vi.mock('electron', () => ({
  clipboard: { readText: mocks.clipboardReadText },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => Promise<unknown>) => mocks.handlers.set(channel, handler),
    on: (channel: string, listener: (...args: any[]) => void) => mocks.listeners.set(channel, listener),
  },
}))

vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }))
vi.mock('node-pty', () => ({ spawn: mocks.spawn }))
vi.mock('../../electron/shared/pathValidation', () => ({ validateCwd: mocks.validateCwd }))
vi.mock('../../electron/services/VoightService', () => ({ trackError: vi.fn() }))

import {
  getLiteTerminalSessionCount,
  killAllLiteTerminalSessions,
  registerLiteTerminalHandlers,
} from '../../electron/ipc/terminal.lite'

function makeEvent(senderId = 7) {
  const send = vi.fn()
  return {
    sender: { id: senderId, send, isDestroyed: () => false },
    senderFrame: { url: 'file:///C:/daemon-lite/lite.html', parent: null },
    send,
  }
}

async function createTerminal(event = makeEvent(), opts: Record<string, unknown> = {}) {
  const handler = mocks.handlers.get('terminal:create')!
  const response = await handler(event, { cwd: 'C:\\work\\project', ...opts }) as {
    ok: boolean
    data?: { id: string; pid: number }
    error?: string
  }
  return { event, response }
}

describe('Lite terminal IPC', () => {
  beforeEach(() => {
    killAllLiteTerminalSessions()
    mocks.handlers.clear()
    mocks.listeners.clear()
    mocks.dataCallbacks.length = 0
    mocks.exitCallbacks.length = 0
    mocks.terminals.length = 0
    vi.clearAllMocks()
    registerLiteTerminalHandlers()
  })

  it('requires and validates a registered project cwd', async () => {
    const missing = await mocks.handlers.get('terminal:create')!(makeEvent(), {}) as { ok: boolean; error?: string }
    expect(missing).toEqual({ ok: false, error: 'Terminal cwd is required' })

    mocks.validateCwd.mockImplementationOnce(() => { throw new Error('Path not within a registered project') })
    const invalid = await createTerminal()
    expect(invalid.response).toEqual({ ok: false, error: 'Path not within a registered project' })
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('buffers output until ready and then sends the startup command', async () => {
    const { event, response } = await createTerminal(makeEvent(), { startupCommand: 'pnpm test' })
    expect(response.ok).toBe(true)
    expect(mocks.validateCwd).toHaveBeenCalledWith('C:\\work\\project')
    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: 'C:\\work\\project' }),
    )

    const id = response.data!.id
    mocks.dataCallbacks[0]('shell banner')
    expect(event.send).not.toHaveBeenCalled()

    mocks.listeners.get('terminal:ready')!(event, id, 100, 24)
    expect(mocks.terminals[0].resize).toHaveBeenCalledWith(100, 24)
    expect(event.send).toHaveBeenCalledWith('terminal:data', { id, data: 'shell banner' })
    expect(mocks.terminals[0].write).toHaveBeenCalledWith('pnpm test\r')
  })

  it('rejects control events from a different renderer owner', async () => {
    const owner = makeEvent(7)
    const outsider = makeEvent(8)
    const { response } = await createTerminal(owner)
    const id = response.data!.id

    mocks.listeners.get('terminal:write')!(outsider, id, 'whoami\r')
    mocks.listeners.get('terminal:resize')!(outsider, id, 80, 24)
    expect(mocks.terminals[0].write).not.toHaveBeenCalled()
    expect(mocks.terminals[0].resize).not.toHaveBeenCalled()

    const killed = await mocks.handlers.get('terminal:kill')!(outsider, id) as { ok: boolean; error?: string }
    expect(killed).toEqual({ ok: false, error: 'Terminal session not found' })
    expect(getLiteTerminalSessionCount()).toBe(1)
  })

  it('supports clipboard paste, process exit, and shutdown cleanup', async () => {
    const first = await createTerminal(makeEvent(7))
    const firstId = first.response.data!.id
    const pasted = await mocks.handlers.get('terminal:paste-from-clipboard')!(first.event, firstId) as { ok: boolean; data?: unknown }
    expect(pasted).toEqual({ ok: true, data: { pasted: true } })
    expect(mocks.terminals[0].write).toHaveBeenCalledWith('from clipboard')

    mocks.exitCallbacks[0]({ exitCode: 2 })
    expect(first.event.send).toHaveBeenCalledWith('terminal:exit', { id: firstId, exitCode: 2 })
    expect(getLiteTerminalSessionCount()).toBe(0)

    await createTerminal(makeEvent(7))
    await createTerminal(makeEvent(7))
    expect(getLiteTerminalSessionCount()).toBe(2)
    killAllLiteTerminalSessions()
    expect(getLiteTerminalSessionCount()).toBe(0)
    if (process.platform === 'win32') {
      expect(mocks.execFileSync).toHaveBeenCalledTimes(2)
    } else {
      expect(mocks.terminals[1].kill).toHaveBeenCalled()
      expect(mocks.terminals[2].kill).toHaveBeenCalled()
    }
  })
})

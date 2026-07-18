import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => Promise<unknown>>()
  const terminal = {
    pid: 4242,
    write: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
  }
  return {
    handlers,
    terminal,
    reset: vi.fn(),
    setState: vi.fn(),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => Promise<unknown>) => mocks.handlers.set(channel, handler) },
}))
vi.mock('node-pty', () => ({ spawn: vi.fn(() => mocks.terminal) }))
vi.mock('../../electron/services/ValidatorManager', () => ({
  appendOutput: vi.fn(),
  detectAvailable: () => ({ surfpool: true, testValidator: true }),
  detectToolchain: vi.fn(),
  getState: () => ({ status: 'running' }),
  getValidatorCommand: () => ({ command: 'solana-test-validator', args: [] }),
  reset: mocks.reset,
  setState: mocks.setState,
  waitForValidatorHealth: vi.fn(async () => {}),
}))
vi.mock('../../electron/services/SolanaDetector', () => ({ detect: vi.fn() }))
vi.mock('../../electron/services/VoightService', () => ({ trackError: vi.fn() }))

import { registerValidatorHandlers, stopValidatorProcess } from '../../electron/ipc/validator'

function event() {
  return {
    sender: { id: 1 },
    senderFrame: { url: 'file:///C:/daemon-lite/lite.html', parent: null },
  }
}

describe('Lite validator shutdown cleanup', () => {
  beforeEach(() => {
    stopValidatorProcess()
    mocks.handlers.clear()
    vi.clearAllMocks()
    registerValidatorHandlers()
  })

  it('kills the owned validator process and resets runtime state', async () => {
    const response = await mocks.handlers.get('validator:start')!(event(), 'test-validator') as { ok: boolean }
    expect(response.ok).toBe(true)

    stopValidatorProcess()

    expect(mocks.terminal.kill).toHaveBeenCalledOnce()
    expect(mocks.reset).toHaveBeenCalledOnce()
  })
})

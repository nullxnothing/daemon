import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

import * as ValidatorManager from '../../electron/services/ValidatorManager'

describe('ValidatorManager', () => {
  beforeEach(() => {
    ValidatorManager.reset()
  })

  it('transitions a healthy JSON-RPC probe to lastHealthCheckAt', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: 'daemon-validator-health', result: 'ok' }),
    } as Response))

    await ValidatorManager.waitForValidatorHealth(8899, { timeoutMs: 0, intervalMs: 0, fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:8899', expect.objectContaining({ method: 'POST' }))
    expect(ValidatorManager.getState().lastHealthCheckAt).toEqual(expect.any(Number))
  })

  it('rejects failed health probes with a useful reason', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ jsonrpc: '2.0', id: 'daemon-validator-health', error: { message: 'validator not ready' } }),
    } as Response))

    await expect(ValidatorManager.waitForValidatorHealth(8899, { timeoutMs: 0, intervalMs: 0, fetchImpl }))
      .rejects.toThrow('validator not ready')
  })

  it('keeps a bounded stderr/stdout excerpt without ANSI escapes', () => {
    ValidatorManager.appendOutput('\u001b[31mstarting validator\u001b[0m\n')
    ValidatorManager.appendOutput('x'.repeat(2100))

    const state = ValidatorManager.getState()
    expect(state.outputExcerpt).not.toContain('\u001b[31m')
    expect(state.outputExcerpt?.length).toBeLessThanOrEqual(2000)
    expect(state.outputExcerpt).toContain('x')
  })

  it('stores lifecycle fields without claiming running implicitly', () => {
    ValidatorManager.setState({
      type: 'test-validator',
      status: 'starting',
      terminalId: 'validator-1',
      port: 8899,
      pid: 123,
      startedAt: 1000,
    })

    expect(ValidatorManager.getState()).toEqual(expect.objectContaining({
      type: 'test-validator',
      status: 'starting',
      terminalId: 'validator-1',
      port: 8899,
      pid: 123,
      startedAt: 1000,
    }))
  })
})

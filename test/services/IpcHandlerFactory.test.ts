import { describe, it, expect, vi } from 'vitest'
import { ipcHandler, withValidation, unwrapResponse } from '../../electron/services/IpcHandlerFactory'
import type { IpcMainInvokeEvent } from 'electron'

// Minimal fake event — ipcHandler passes it through but never inspects it in tests
const fakeEvent = {} as IpcMainInvokeEvent

describe('ipcHandler — success path', () => {
  it('wraps synchronous return value in { ok: true, data }', async () => {
    const handler = ipcHandler(() => 42)
    const result = await handler(fakeEvent)
    expect(result).toEqual({ ok: true, data: 42 })
  })

  it('wraps async return value in { ok: true, data }', async () => {
    const handler = ipcHandler(async () => 'hello')
    const result = await handler(fakeEvent)
    expect(result).toEqual({ ok: true, data: 'hello' })
  })

  it('wraps null/undefined return in { ok: true }', async () => {
    const handler = ipcHandler(async () => undefined)
    const result = await handler(fakeEvent)
    expect(result.ok).toBe(true)
  })

  it('passes arguments through to the inner handler', async () => {
    const innerFn = vi.fn().mockResolvedValue('result')
    const handler = ipcHandler(innerFn)
    await handler(fakeEvent, 'arg1', 'arg2')
    expect(innerFn).toHaveBeenCalledWith(fakeEvent, 'arg1', 'arg2')
  })
})

describe('ipcHandler — error path', () => {
  it('returns { ok: false, error } when handler throws', async () => {
    const handler = ipcHandler(() => { throw new Error('something broke') })
    const result = await handler(fakeEvent)
    expect(result).toEqual({ ok: false, error: 'something broke' })
  })

  it('returns { ok: false, error } when async handler rejects', async () => {
    const handler = ipcHandler(async () => { throw new Error('async failure') })
    const result = await handler(fakeEvent)
    expect(result).toEqual({ ok: false, error: 'async failure' })
  })

  it('does NOT re-throw errors — always returns a response object', async () => {
    const handler = ipcHandler(() => { throw new Error('dangerous') })
    await expect(handler(fakeEvent)).resolves.toBeDefined()
  })

  it('uses onError transformer when provided', async () => {
    const handler = ipcHandler(
      () => { throw new Error('raw error') },
      () => 'transformed error message'
    )
    const result = await handler(fakeEvent)
    expect(result).toEqual({ ok: false, error: 'transformed error message' })
  })

  it('falls back to err.message when onError returns null', async () => {
    const handler = ipcHandler(
      () => { throw new Error('fallback message') },
      () => null
    )
    const result = await handler(fakeEvent)
    expect(result).toEqual({ ok: false, error: 'fallback message' })
  })
})

describe('withValidation', () => {
  it('calls handler when validator returns null', async () => {
    const innerFn = vi.fn().mockResolvedValue('ok')
    const wrapped = withValidation(() => null, innerFn)
    const handler = ipcHandler(wrapped)
    const result = await handler(fakeEvent, 'input')
    expect(result).toEqual({ ok: true, data: 'ok' })
    expect(innerFn).toHaveBeenCalled()
  })

  it('throws and skips handler when validator returns an error string', async () => {
    const innerFn = vi.fn().mockResolvedValue('should not run')
    const wrapped = withValidation(() => 'Validation failed', innerFn)
    const handler = ipcHandler(wrapped)
    const result = await handler(fakeEvent, 'bad-input')
    expect(result).toEqual({ ok: false, error: 'Validation failed' })
    expect(innerFn).not.toHaveBeenCalled()
  })

  it('passes args to the validator', async () => {
    const validator = vi.fn().mockReturnValue(null)
    const wrapped = withValidation(validator, async () => 'ok')
    const handler = ipcHandler(wrapped)
    await handler(fakeEvent, 'a', 'b')
    expect(validator).toHaveBeenCalledWith('a', 'b')
  })
})

describe('unwrapResponse', () => {
  it('returns data when ok is true', () => {
    const result = unwrapResponse({ ok: true, data: 'value' })
    expect(result).toBe('value')
  })

  it('throws when ok is false', () => {
    expect(() => unwrapResponse({ ok: false, error: 'something went wrong' })).toThrow('something went wrong')
  })
})

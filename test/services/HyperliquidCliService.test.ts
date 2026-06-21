import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Capture execFile calls and drive their (err, result) outcome per test.
// vi.hoisted lets the factory (which is hoisted) reference this mock safely.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: execFileMock }))

// Network selection comes from settings; default to testnet unless overridden.
let mockNetwork: 'mainnet' | 'testnet' = 'testnet'
vi.mock('../../electron/services/SettingsService', () => ({
  getHyperliquidSettings: () => ({ network: mockNetwork }),
}))

import * as Hl from '../../electron/services/HyperliquidCliService'

// execFile is promisified internally, so the callback form must call cb(err, { stdout, stderr }).
function resolveWith(stdout: string, stderr = ''): void {
  execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: Function) => {
    cb(null, { stdout, stderr })
  })
}
function rejectWith(code: number | null, stdout = '', stderr = ''): void {
  execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: Function) => {
    const err = Object.assign(new Error('exit'), { code, stdout, stderr })
    cb(err, { stdout, stderr })
  })
}
function lastArgs(): string[] {
  return execFileMock.mock.calls[execFileMock.mock.calls.length - 1][1]
}

beforeEach(() => {
  execFileMock.mockReset()
  mockNetwork = 'testnet'
  Hl.resetCache()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('HyperliquidCliService.run', () => {
  it('forces JSON output and injects --testnet on testnet', async () => {
    resolveWith('{"ok":true}')
    const data = await Hl.run(['book', 'BTC'])
    const args = lastArgs()
    expect(args.slice(0, 2)).toEqual(['--format', 'json'])
    expect(args).toContain('--testnet')
    expect(args.slice(-2)).toEqual(['book', 'BTC'])
    expect(data).toEqual({ ok: true })
  })

  it('omits --testnet on mainnet', async () => {
    mockNetwork = 'mainnet'
    resolveWith('{}')
    await Hl.run(['mids'])
    expect(lastArgs()).not.toContain('--testnet')
  })

  it('appends --dry-run when requested', async () => {
    resolveWith('{}')
    await Hl.run(['orders', 'create', '--coin', 'BTC'], { dryRun: true })
    expect(lastArgs()).toContain('--dry-run')
  })

  it('throws the CLI structured error from a 0-exit JSON body', async () => {
    resolveWith('{"error":"Authentication required."}')
    await expect(Hl.run(['positions', 'list'])).rejects.toThrow('Authentication required.')
  })

  it('maps exit code 10 to a wallet-setup message', async () => {
    rejectWith(10, '', 'boom')
    await expect(Hl.run(['account', 'portfolio'])).rejects.toThrow(/wallet not set up/i)
  })

  it('maps exit code 11 to a rate-limit message', async () => {
    rejectWith(11)
    await expect(Hl.run(['mids'])).rejects.toThrow(/rate limited/i)
  })

  it('prefers the structured {error} body over the exit-code map', async () => {
    rejectWith(13, '{"error":"unknown coin FOO"}')
    await expect(Hl.run(['book', 'FOO'])).rejects.toThrow('unknown coin FOO')
  })

  it('rejects non-JSON stdout', async () => {
    resolveWith('not json at all')
    await expect(Hl.run(['status'])).rejects.toThrow(/non-JSON/i)
  })
})

describe('HyperliquidCliService order wrappers', () => {
  it('builds a live order argv with -y after approval', async () => {
    resolveWith('{}')
    await Hl.createOrder({ coin: 'BTC', side: 'buy', type: 'market', amount: 100 })
    const args = lastArgs()
    expect(args).toEqual(expect.arrayContaining(['orders', 'create', '--coin', 'BTC', '--side', 'buy', '--type', 'market', '--amount', '100', '-y']))
  })

  it('previews an order as a dry-run without -y', async () => {
    resolveWith('{}')
    await Hl.previewOrder({ coin: 'ETH', side: 'sell', type: 'limit', size: 1, price: 3000 })
    const args = lastArgs()
    expect(args).toContain('--dry-run')
    expect(args).not.toContain('-y')
    expect(args).toEqual(expect.arrayContaining(['--price', '3000', '--size', '1']))
  })
})

describe('HyperliquidCliService.isAvailable', () => {
  it('caches a successful --version probe', async () => {
    resolveWith('hyperliquid 0.11.1')
    expect(await Hl.isAvailable()).toBe(true)
    expect(await Hl.isAvailable()).toBe(true)
    // Only the first call hits execFile (the second is cached).
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('reports false when the binary is missing', async () => {
    rejectWith(null, '', 'ENOENT')
    expect(await Hl.isAvailable()).toBe(false)
  })
})

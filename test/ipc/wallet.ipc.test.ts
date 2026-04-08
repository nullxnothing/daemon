import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

// Everything referenced inside a `vi.mock` factory below must be declared via
// `vi.hoisted` because factories are hoisted above imports at transform time.
// Inline the handler registry + fake db so nothing is imported from a sibling.
const {
  handlers,
  fakeDb,
  dbCalls,
  walletServiceSpies,
  validationServiceSpies,
  dialogSpy,
  clipboardWriteSpy,
  clipboardReadSpy,
} = vi.hoisted(() => {
  type HandlerFn = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  const registry = new Map<string, HandlerFn>()
  const fakeEvent = {} as IpcMainInvokeEvent
  const handlers = {
    register(channel: string, fn: HandlerFn) { registry.set(channel, fn) },
    async invoke(channel: string, ...args: unknown[]) {
      const fn = registry.get(channel)
      if (!fn) throw new Error(`No handler for '${channel}'`)
      return (await fn(fakeEvent, ...args)) as { ok: boolean; data?: unknown; error?: string }
    },
    clear() { registry.clear() },
  }

  const dbCalls: Array<{ sql: string; method: string; params: unknown[] }> = []
  const fakeDb = {
    prepare: vi.fn((sql: string) => ({
      all: (...params: unknown[]) => { dbCalls.push({ sql, method: 'all', params }); return [] },
      get: (...params: unknown[]) => { dbCalls.push({ sql, method: 'get', params }); return undefined },
      run: (...params: unknown[]) => { dbCalls.push({ sql, method: 'run', params }); return { changes: 1, lastInsertRowid: 1 } },
    })),
    transaction: (fn: (...args: unknown[]) => unknown) => fn,
  }

  return {
    handlers,
    fakeDb,
    dbCalls,
    walletServiceSpies: {
      getDashboard: vi.fn(),
      listWallets: vi.fn(),
      createWallet: vi.fn(),
      deleteWallet: vi.fn(),
      setDefaultWallet: vi.fn(),
      assignWalletToProject: vi.fn(),
      storeHeliusKey: vi.fn(),
      deleteHeliusKey: vi.fn(),
      hasHeliusKey: vi.fn(),
      generateWallet: vi.fn(),
      transferSOL: vi.fn(),
      transferToken: vi.fn(),
      getSwapQuote: vi.fn(),
      executeSwap: vi.fn(),
      getBalance: vi.fn(),
      listAgentWallets: vi.fn(),
      createAgentWallet: vi.fn(),
      hasKeypair: vi.fn(),
      getTransactionHistory: vi.fn(),
      exportPrivateKey: vi.fn(),
    },
    validationServiceSpies: {
      checkRateLimit: vi.fn(() => true),
    },
    dialogSpy: vi.fn(),
    clipboardWriteSpy: vi.fn(),
    clipboardReadSpy: vi.fn(() => ''),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.register(channel, fn as never),
  },
  dialog: {
    showMessageBox: (...args: unknown[]) => dialogSpy(...args),
  },
  clipboard: {
    writeText: (...args: unknown[]) => clipboardWriteSpy(...args),
    readText: () => clipboardReadSpy(),
  },
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => fakeDb,
}))

vi.mock('../../electron/services/WalletService', () => walletServiceSpies)

vi.mock('../../electron/services/ValidationService', () => ({
  ValidationService: validationServiceSpies,
}))

// registerWalletHandlers is imported AFTER the mocks above are declared
import { registerWalletHandlers } from '../../electron/ipc/wallet'

beforeEach(() => {
  handlers.clear()
  dbCalls.length = 0
  Object.values(walletServiceSpies).forEach((s) => s.mockReset())
  validationServiceSpies.checkRateLimit.mockReset().mockReturnValue(true)
  dialogSpy.mockReset()
  clipboardWriteSpy.mockReset()
  clipboardReadSpy.mockReset().mockReturnValue('')
  registerWalletHandlers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('wallet:dashboard', () => {
  it('returns { ok: true, data } with dashboard payload', async () => {
    walletServiceSpies.getDashboard.mockResolvedValue({ totalUsd: 42, wallets: [] })
    const res = await handlers.invoke('wallet:dashboard', 'proj-1')
    expect(res).toEqual({ ok: true, data: { totalUsd: 42, wallets: [] } })
    expect(walletServiceSpies.getDashboard).toHaveBeenCalledWith('proj-1')
  })

  it('forwards service errors as { ok: false, error }', async () => {
    walletServiceSpies.getDashboard.mockRejectedValue(new Error('helius down'))
    const res = await handlers.invoke('wallet:dashboard')
    expect(res).toEqual({ ok: false, error: 'helius down' })
  })
})

describe('wallet:rename', () => {
  it('trims the name and persists via prepared statement', async () => {
    const res = await handlers.invoke('wallet:rename', 'w1', '  New Name  ')
    expect(res.ok).toBe(true)
    const runCall = dbCalls.find((c) => c.sql.includes('UPDATE wallets SET name') && c.method === 'run')
    expect(runCall?.params).toEqual(['New Name', 'w1'])
  })

  it('rejects an empty/whitespace name', async () => {
    const res = await handlers.invoke('wallet:rename', 'w1', '   ')
    expect(res).toEqual({ ok: false, error: 'Wallet name cannot be empty' })
    const runCall = dbCalls.find((c) => c.sql.includes('UPDATE wallets SET name') && c.method === 'run')
    expect(runCall).toBeUndefined()
  })

  it('caps the name at 100 characters', async () => {
    const long = 'A'.repeat(250)
    const res = await handlers.invoke('wallet:rename', 'w1', long)
    expect(res.ok).toBe(true)
    const runCall = dbCalls.find((c) => c.sql.includes('UPDATE wallets SET name') && c.method === 'run')
    expect((runCall?.params[0] as string).length).toBe(100)
  })
})

describe('wallet:swap-execute — confirmation enforcement', () => {
  const baseInput = {
    walletId: 'w1',
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: 'So11111111111111111111111111111111111111113',
    amount: 1,
    slippageBps: 50,
    acknowledgedImpact: false,
  }

  it('rejects when confirmedAt is missing', async () => {
    const res = await handlers.invoke('wallet:swap-execute', baseInput)
    expect(res).toEqual({ ok: false, error: 'Swap requires a confirmedAt timestamp' })
    expect(walletServiceSpies.executeSwap).not.toHaveBeenCalled()
  })

  it('rejects when confirmedAt is zero', async () => {
    const res = await handlers.invoke('wallet:swap-execute', { ...baseInput, confirmedAt: 0 })
    expect(res.ok).toBe(false)
    expect(walletServiceSpies.executeSwap).not.toHaveBeenCalled()
  })

  it('rejects when confirmedAt is older than 60 seconds', async () => {
    const old = Date.now() - 61_000
    const res = await handlers.invoke('wallet:swap-execute', { ...baseInput, confirmedAt: old })
    expect(res).toEqual({ ok: false, error: 'Swap confirmation expired — please review the quote again' })
    expect(walletServiceSpies.executeSwap).not.toHaveBeenCalled()
  })

  it('rejects when confirmedAt is in the future (clock skew or tampering)', async () => {
    const future = Date.now() + 30_000
    const res = await handlers.invoke('wallet:swap-execute', { ...baseInput, confirmedAt: future })
    expect(res.ok).toBe(false)
    expect(walletServiceSpies.executeSwap).not.toHaveBeenCalled()
  })

  it('rejects high-impact swap without explicit acknowledgement', async () => {
    const res = await handlers.invoke('wallet:swap-execute', {
      ...baseInput,
      confirmedAt: Date.now(),
      rawQuoteResponse: { priceImpactPct: '7.2' },
      acknowledgedImpact: false,
    })
    expect(res).toEqual({ ok: false, error: 'High price impact must be explicitly acknowledged before executing' })
    expect(walletServiceSpies.executeSwap).not.toHaveBeenCalled()
  })

  it('allows high-impact swap with explicit acknowledgement', async () => {
    walletServiceSpies.executeSwap.mockResolvedValue({ signature: 'abc' })
    const res = await handlers.invoke('wallet:swap-execute', {
      ...baseInput,
      confirmedAt: Date.now(),
      rawQuoteResponse: { priceImpactPct: '7.2' },
      acknowledgedImpact: true,
    })
    expect(res).toEqual({ ok: true, data: { signature: 'abc' } })
    expect(walletServiceSpies.executeSwap).toHaveBeenCalledOnce()
  })

  it('allows low-impact swap without acknowledgement', async () => {
    walletServiceSpies.executeSwap.mockResolvedValue({ signature: 'xyz' })
    const res = await handlers.invoke('wallet:swap-execute', {
      ...baseInput,
      confirmedAt: Date.now(),
      rawQuoteResponse: { priceImpactPct: '0.5' },
      acknowledgedImpact: false,
    })
    expect(res.ok).toBe(true)
    expect(walletServiceSpies.executeSwap).toHaveBeenCalledOnce()
  })

  it('treats 5% impact as the acknowledgement boundary', async () => {
    const res = await handlers.invoke('wallet:swap-execute', {
      ...baseInput,
      confirmedAt: Date.now(),
      rawQuoteResponse: { priceImpactPct: '5' },
      acknowledgedImpact: false,
    })
    expect(res.ok).toBe(false)
  })
})

describe('wallet:transaction-history — limit clamping', () => {
  it('clamps limit below 1 to 1', async () => {
    walletServiceSpies.getTransactionHistory.mockResolvedValue([])
    await handlers.invoke('wallet:transaction-history', 'w1', 0)
    expect(walletServiceSpies.getTransactionHistory).toHaveBeenCalledWith('w1', 1)
  })

  it('clamps limit above 200 to 200', async () => {
    walletServiceSpies.getTransactionHistory.mockResolvedValue([])
    await handlers.invoke('wallet:transaction-history', 'w1', 10_000)
    expect(walletServiceSpies.getTransactionHistory).toHaveBeenCalledWith('w1', 200)
  })

  it('defaults to 50 when limit is undefined', async () => {
    walletServiceSpies.getTransactionHistory.mockResolvedValue([])
    await handlers.invoke('wallet:transaction-history', 'w1')
    expect(walletServiceSpies.getTransactionHistory).toHaveBeenCalledWith('w1', 50)
  })
})

describe('wallet:export-private-key — rate limit + user confirmation', () => {
  it('rejects when rate limiter blocks the request', async () => {
    validationServiceSpies.checkRateLimit.mockReturnValueOnce(false)
    const res = await handlers.invoke('wallet:export-private-key', 'w1')
    expect(res).toEqual({ ok: false, error: 'Too many export attempts. Please wait 5 minutes.' })
    expect(dialogSpy).not.toHaveBeenCalled()
    expect(walletServiceSpies.exportPrivateKey).not.toHaveBeenCalled()
  })

  it('rejects when user cancels the dialog', async () => {
    dialogSpy.mockResolvedValue({ response: 0 })
    const res = await handlers.invoke('wallet:export-private-key', 'w1')
    expect(res).toEqual({ ok: false, error: 'Export cancelled by user' })
    expect(walletServiceSpies.exportPrivateKey).not.toHaveBeenCalled()
    expect(clipboardWriteSpy).not.toHaveBeenCalled()
  })

  it('copies key to clipboard on approval and schedules auto-clear', async () => {
    vi.useFakeTimers()
    dialogSpy.mockResolvedValue({ response: 1 })
    walletServiceSpies.exportPrivateKey.mockResolvedValue('PRIVKEY123')

    const res = await handlers.invoke('wallet:export-private-key', 'w1')
    expect(res).toEqual({ ok: true, data: 'PRIVKEY123' })
    expect(clipboardWriteSpy).toHaveBeenCalledWith('PRIVKEY123')

    // Simulate clipboard still containing the key after 30 seconds → should be cleared
    clipboardReadSpy.mockReturnValue('PRIVKEY123')
    vi.advanceTimersByTime(30_000)
    expect(clipboardWriteSpy).toHaveBeenLastCalledWith('')
  })

  it('does NOT clear clipboard if user has already overwritten it', async () => {
    vi.useFakeTimers()
    dialogSpy.mockResolvedValue({ response: 1 })
    walletServiceSpies.exportPrivateKey.mockResolvedValue('PRIVKEY456')

    await handlers.invoke('wallet:export-private-key', 'w1')
    expect(clipboardWriteSpy).toHaveBeenCalledWith('PRIVKEY456')

    clipboardReadSpy.mockReturnValue('user copied something else')
    vi.advanceTimersByTime(30_000)

    // Only the original write, no clearing write
    expect(clipboardWriteSpy).toHaveBeenCalledTimes(1)
  })
})

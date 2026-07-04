import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReceiptChain } from '../../electron/services/receipts/receiptChain'
import type { ReceiptRecord } from '../../electron/services/receipts/receiptBuilder'

const state = vi.hoisted(() => ({
  stored: undefined as unknown,
  cluster: 'devnet' as string,
  throwOnSettingsRead: false,
}))

const { mockRun, mockGet, mockAll, mockPrepare } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockAll: vi.fn(),
  mockPrepare: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({ prepare: mockPrepare }),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getJsonSetting: (_key: string, fallback: unknown) => {
    if (state.throwOnSettingsRead) throw new Error('db locked')
    return state.stored ?? fallback
  },
  setJsonSetting: vi.fn((_key: string, value: unknown) => { state.stored = value }),
  getWalletInfrastructureSettings: () => ({ cluster: state.cluster }),
}))

vi.mock('../../electron/services/LogService', () => ({
  LogService: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  getReceiptsSettings,
  setReceiptsSettings,
  isEmissionCluster,
  shouldEmit,
  emitReceipt,
  emitReceiptSafe,
  summarizeReceipts,
  listReceipts,
  pruneReceipts,
  RECEIPT_RETENTION,
} from '../../electron/services/receipts/ReceiptService'

/** A chain double that records calls; anchorMemo can be made to throw. */
function makeChain(opts: { hasSigner?: boolean; throwOnAnchor?: boolean } = {}): ReceiptChain & {
  anchorCalls: string[]
} {
  const anchorCalls: string[] = []
  return {
    anchorCalls,
    hasSigner: () => opts.hasSigner ?? true,
    anchorMemo: vi.fn(async (memo: string) => {
      anchorCalls.push(memo)
      if (opts.throwOnAnchor) throw new Error('rpc down')
      return { signature: 'ANCHOR_SIG', signer: 'SIGNER_PUBKEY' }
    }),
  }
}

const RECORD: Omit<ReceiptRecord, 'cluster'> = {
  source: 'aria',
  agentId: 'propose_patch',
  actionType: 'tool.write',
  summary: 'edited file',
  verdict: 'approved',
  riskTier: 'write',
}

function enable(): void {
  state.stored = { enabled: true }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.stored = undefined
  state.cluster = 'devnet'
  state.throwOnSettingsRead = false
  mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
})

describe('settings', () => {
  it('defaults to disabled', () => {
    expect(getReceiptsSettings()).toEqual({ enabled: false })
  })

  it('persists the toggle', () => {
    expect(setReceiptsSettings({ enabled: true })).toEqual({ enabled: true })
    expect(getReceiptsSettings().enabled).toBe(true)
  })
})

describe('isEmissionCluster (devnet-only guard)', () => {
  it('accepts devnet only', () => {
    expect(isEmissionCluster('devnet')).toBe(true)
    expect(isEmissionCluster('mainnet-beta')).toBe(false)
    expect(isEmissionCluster('localnet')).toBe(false)
    expect(isEmissionCluster('unknown')).toBe(false)
  })
})

describe('shouldEmit', () => {
  it('is false while disabled even on devnet', () => {
    expect(shouldEmit('devnet', makeChain())).toBe(false)
  })

  it('is false on non-devnet clusters even when enabled', () => {
    enable()
    expect(shouldEmit('mainnet-beta', makeChain())).toBe(false)
  })

  it('is false when no signer is provisioned', () => {
    enable()
    expect(shouldEmit('devnet', makeChain({ hasSigner: false }))).toBe(false)
  })

  it('is true only when enabled + devnet + signer', () => {
    enable()
    expect(shouldEmit('devnet', makeChain())).toBe(true)
  })
})

describe('emitReceipt', () => {
  it('makes ZERO on-chain calls and writes no ledger row while disabled', async () => {
    const chain = makeChain()
    const res = await emitReceipt({ ...RECORD, cluster: 'devnet' }, chain)
    expect(res.emitted).toBe(false)
    expect(res.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(chain.anchorCalls).toHaveLength(0)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('makes ZERO on-chain calls on mainnet even when enabled', async () => {
    enable()
    const chain = makeChain()
    const res = await emitReceipt({ ...RECORD, cluster: 'mainnet-beta' }, chain)
    expect(res.emitted).toBe(false)
    expect(chain.anchorCalls).toHaveLength(0)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('anchors the hash and writes the ledger on devnet when enabled', async () => {
    enable()
    const chain = makeChain()
    const res = await emitReceipt({ ...RECORD, cluster: 'devnet' }, chain)
    expect(res.emitted).toBe(true)
    expect(res.anchorSignature).toBe('ANCHOR_SIG')
    // The memo carries only the hash — never file contents/prompt/summary body.
    expect(chain.anchorCalls[0]).toBe(`DAEMON-RECEIPT v1 sha256=${res.contentHash}`)
    expect(chain.anchorCalls[0]).not.toContain('edited file')
    // Insert is the first prepared statement; prune follows it.
    const insertSql = mockPrepare.mock.calls[0][0] as string
    expect(insertSql).toMatch(/INSERT INTO receipts/)
    const args = mockRun.mock.calls[0]
    expect(args).toContain(res.contentHash)
    expect(args).toContain('ANCHOR_SIG')
    expect(args).toContain('memo')
    // Retention prune runs opportunistically after the insert.
    const pruneSql = mockPrepare.mock.calls[1][0] as string
    expect(pruneSql).toMatch(/DELETE FROM receipts/)
  })

  it('propagates a chain failure to emitReceipt callers (past the gate)', async () => {
    enable()
    const chain = makeChain({ throwOnAnchor: true })
    await expect(emitReceipt({ ...RECORD, cluster: 'devnet' }, chain)).rejects.toThrow(/rpc down/)
    expect(mockRun).not.toHaveBeenCalled()
  })
})

/** Drain the deferred setImmediate tick (and any promise chained off it). */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(() => setImmediate(() => resolve())))
}

describe('emitReceiptSafe (does not block the caller)', () => {
  it('consults NO settings/DB synchronously — the caller path returns before any read', () => {
    state.throwOnSettingsRead = true // any sync settings touch would throw here
    enable() // (ignored while throwOnSettingsRead is set)
    const chain = makeChain()
    // If the settings read were on the hot path it would throw synchronously.
    expect(() => emitReceiptSafe({ ...RECORD }, chain)).not.toThrow()
    // And nothing happened synchronously: no anchor, no ledger write.
    expect(chain.anchorCalls).toHaveLength(0)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('defers the settings read to the deferred tick, then no-ops safely when it throws', async () => {
    state.throwOnSettingsRead = true
    const chain = makeChain()
    emitReceiptSafe({ ...RECORD }, chain)
    await flush()
    // The deferred read threw and was swallowed — no emission, no throw escaped.
    expect(chain.anchorCalls).toHaveLength(0)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('never throws when the chain layer throws (failure isolation)', async () => {
    enable()
    const chain = makeChain({ throwOnAnchor: true })
    expect(() => emitReceiptSafe({ ...RECORD }, chain)).not.toThrow()
    await flush()
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('does no on-chain work while disabled', async () => {
    const chain = makeChain()
    emitReceiptSafe({ ...RECORD }, chain)
    await flush()
    expect(chain.anchorCalls).toHaveLength(0)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('reads the live cluster and emits on devnet when enabled', async () => {
    enable()
    state.cluster = 'devnet'
    const chain = makeChain()
    emitReceiptSafe({ ...RECORD }, chain)
    await flush()
    expect(chain.anchorCalls).toHaveLength(1)
    // insert + prune both run against the mocked prepare().run().
    expect(mockRun).toHaveBeenCalled()
  })

  it('reads the live cluster and stays silent on mainnet', async () => {
    enable()
    state.cluster = 'mainnet-beta'
    const chain = makeChain()
    emitReceiptSafe({ ...RECORD }, chain)
    await flush()
    expect(chain.anchorCalls).toHaveLength(0)
    expect(mockRun).not.toHaveBeenCalled()
  })
})

describe('ledger reads', () => {
  it('summarizes the count + latest timestamp', () => {
    mockGet.mockReturnValue({ n: 3, latest: 1_700_000_000_000 })
    expect(summarizeReceipts()).toEqual({ totalReceipts: 3, latestAt: 1_700_000_000_000 })
  })

  it('maps ledger rows to camelCase entries', () => {
    mockAll.mockReturnValue([
      {
        id: 'r1', content_hash: 'h', source: 'aria', action_type: 'tool.write',
        cluster: 'devnet', policy_verdict: 'approved', anchor_signature: 'sig', created_at: 1,
      },
    ])
    const rows = listReceipts(10)
    expect(rows[0]).toEqual({
      id: 'r1', contentHash: 'h', source: 'aria', actionType: 'tool.write',
      cluster: 'devnet', policyVerdict: 'approved', anchorSignature: 'sig', createdAt: 1,
    })
  })
})

describe('retention (bounded ledger growth)', () => {
  it('prunes to the RECEIPT_RETENTION bound with a DELETE-keep-newest query', () => {
    mockRun.mockReturnValue({ changes: 5 })
    const removed = pruneReceipts()
    const sql = mockPrepare.mock.calls[0][0] as string
    expect(sql).toMatch(/DELETE FROM receipts/)
    expect(sql).toMatch(/ORDER BY created_at DESC/)
    expect(mockRun).toHaveBeenCalledWith(RECEIPT_RETENTION)
    expect(removed).toBe(5)
  })

  it('caps at a sane bound (not unbounded)', () => {
    expect(RECEIPT_RETENTION).toBeGreaterThan(0)
    expect(RECEIPT_RETENTION).toBeLessThanOrEqual(10_000)
  })
})

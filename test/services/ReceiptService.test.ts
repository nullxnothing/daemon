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
    expect(mockRun).toHaveBeenCalledTimes(1)
    const insertSql = mockPrepare.mock.calls[0][0] as string
    expect(insertSql).toMatch(/INSERT INTO receipts/)
    const args = mockRun.mock.calls[0]
    expect(args).toContain(res.contentHash)
    expect(args).toContain('ANCHOR_SIG')
    expect(args).toContain('memo')
  })

  it('propagates a chain failure to emitReceipt callers (past the gate)', async () => {
    enable()
    const chain = makeChain({ throwOnAnchor: true })
    await expect(emitReceipt({ ...RECORD, cluster: 'devnet' }, chain)).rejects.toThrow(/rpc down/)
    expect(mockRun).not.toHaveBeenCalled()
  })
})

describe('emitReceiptSafe (failure isolation)', () => {
  it('never throws when the chain layer throws', async () => {
    enable()
    const chain = makeChain({ throwOnAnchor: true })
    expect(() => emitReceiptSafe({ ...RECORD }, chain)).not.toThrow()
    // let the fire-and-forget microtask settle
    await new Promise((r) => setTimeout(r, 0))
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('never throws even if the synchronous settings pre-check throws (runs inside the action try block)', () => {
    state.throwOnSettingsRead = true
    const chain = makeChain()
    expect(() => emitReceiptSafe({ ...RECORD }, chain)).not.toThrow()
    expect(chain.anchorCalls).toHaveLength(0)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('does no work at all while disabled (short-circuit, no async hop)', () => {
    const chain = makeChain()
    emitReceiptSafe({ ...RECORD }, chain)
    expect(chain.anchorCalls).toHaveLength(0)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('reads the live cluster and emits on devnet when enabled', async () => {
    enable()
    state.cluster = 'devnet'
    const chain = makeChain()
    emitReceiptSafe({ ...RECORD }, chain)
    await new Promise((r) => setTimeout(r, 0))
    expect(chain.anchorCalls).toHaveLength(1)
    expect(mockRun).toHaveBeenCalledTimes(1)
  })

  it('reads the live cluster and stays silent on mainnet', async () => {
    enable()
    state.cluster = 'mainnet-beta'
    const chain = makeChain()
    emitReceiptSafe({ ...RECORD }, chain)
    await new Promise((r) => setTimeout(r, 0))
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

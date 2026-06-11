import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair, SystemProgram } from '@solana/web3.js'

const state = vi.hoisted(() => ({
  stored: undefined as unknown,
  cluster: 'mainnet-beta' as string,
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
  getJsonSetting: (_key: string, fallback: unknown) => state.stored ?? fallback,
  setJsonSetting: vi.fn((_key: string, value: unknown) => { state.stored = value }),
  getWalletInfrastructureSettings: () => ({ cluster: state.cluster }),
}))

vi.mock('../../electron/services/LogService', () => ({
  LogService: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  DEFAULT_FEE_BPS,
  MAX_FEE_BPS,
  MIN_FEE_LAMPORTS,
  buildFeeInstruction,
  getFeeSettings,
  quoteExecutionFee,
  recordFeeEvent,
  setFeeSettings,
  summarizeFeeLedger,
} from '../../electron/services/FeeService'

const TREASURY = Keypair.generate().publicKey.toBase58()

function enableMeter(bps = DEFAULT_FEE_BPS): void {
  state.stored = { enabled: true, bps, treasuryAddress: TREASURY }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.stored = undefined
  state.cluster = 'mainnet-beta'
  mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
})

describe('getFeeSettings', () => {
  it('defaults to disabled with the launch rate', () => {
    expect(getFeeSettings()).toEqual({ enabled: false, bps: DEFAULT_FEE_BPS, treasuryAddress: '' })
  })

  it('is disabled when enabled but no treasury is configured', () => {
    state.stored = { enabled: true, bps: 25, treasuryAddress: '' }
    expect(getFeeSettings().enabled).toBe(false)
  })

  it('is disabled when the treasury address is not a valid pubkey', () => {
    state.stored = { enabled: true, bps: 25, treasuryAddress: 'not-a-key' }
    expect(getFeeSettings().enabled).toBe(false)
  })

  it('clamps bps to the compiled ceiling', () => {
    state.stored = { enabled: true, bps: 500, treasuryAddress: TREASURY }
    expect(getFeeSettings().bps).toBe(MAX_FEE_BPS)
  })
})

describe('setFeeSettings', () => {
  it('rejects an invalid treasury address', () => {
    expect(() => setFeeSettings({ treasuryAddress: 'bogus' })).toThrow(/valid Solana public key/)
  })

  it('persists and returns the normalized settings', () => {
    const result = setFeeSettings({ enabled: true, bps: 25, treasuryAddress: TREASURY })
    expect(result).toEqual({ enabled: true, bps: 25, treasuryAddress: TREASURY })
  })

  it('clamps a bps above the ceiling rather than persisting it', () => {
    const result = setFeeSettings({ enabled: true, bps: 10_000, treasuryAddress: TREASURY })
    expect(result.bps).toBe(MAX_FEE_BPS)
  })
})

describe('quoteExecutionFee', () => {
  it('returns null while the meter is disabled', () => {
    expect(quoteExecutionFee(10_000_000_000)).toBeNull()
  })

  it('never charges off mainnet', () => {
    enableMeter()
    state.cluster = 'devnet'
    expect(quoteExecutionFee(10_000_000_000)).toBeNull()
  })

  it('computes bps of notional on mainnet', () => {
    enableMeter(25)
    // 10 SOL at 25bps = 0.025 SOL
    expect(quoteExecutionFee(10_000_000_000)).toEqual({ bps: 25, lamports: 25_000_000, treasury: TREASURY })
  })

  it('returns null below the dust floor', () => {
    enableMeter(25)
    const dustNotional = Math.floor((MIN_FEE_LAMPORTS - 1) * 10_000 / 25)
    expect(quoteExecutionFee(dustNotional)).toBeNull()
  })

  it('returns null for zero, negative, and non-finite notionals', () => {
    enableMeter()
    expect(quoteExecutionFee(0)).toBeNull()
    expect(quoteExecutionFee(-5)).toBeNull()
    expect(quoteExecutionFee(Number.NaN)).toBeNull()
  })
})

describe('buildFeeInstruction', () => {
  it('builds a SystemProgram transfer to the treasury for the quoted lamports', () => {
    const payer = Keypair.generate().publicKey
    const ix = buildFeeInstruction(payer, { bps: 25, lamports: 25_000_000, treasury: TREASURY })
    expect(ix.programId.equals(SystemProgram.programId)).toBe(true)
    expect(ix.keys[0].pubkey.equals(payer)).toBe(true)
    expect(ix.keys[1].pubkey.toBase58()).toBe(TREASURY)
  })
})

describe('recordFeeEvent', () => {
  it('writes one ledger row with the charged amounts', () => {
    enableMeter()
    recordFeeEvent(
      { kind: 'transfer', notionalLamports: 10_000_000_000, wallet: 'walletA' },
      { bps: 25, lamports: 25_000_000, treasury: TREASURY },
      'sig123',
    )
    expect(mockRun).toHaveBeenCalledTimes(1)
    const args = mockRun.mock.calls[0]
    expect(args).toContain('walletA')
    expect(args).toContain('transfer')
    expect(args).toContain(10_000_000_000)
    expect(args).toContain(25_000_000)
    expect(args).toContain('sig123')
  })
})

describe('summarizeFeeLedger', () => {
  it('aggregates totals and top-ten concentration', () => {
    mockGet.mockReturnValue({ fees: 50_000_000, notional: 20_000_000_000, n: 2 })
    mockAll.mockReturnValue([
      { wallet: 'a', vol: 15_000_000_000 },
      { wallet: 'b', vol: 5_000_000_000 },
    ])
    const summary = summarizeFeeLedger(0)
    expect(summary.totalFeeLamports).toBe(50_000_000)
    expect(summary.feeEventCount).toBe(2)
    expect(summary.uniqueWallets).toBe(2)
    expect(summary.topTenWalletShare).toBe(1)
  })

  it('reports zero concentration on an empty ledger', () => {
    mockGet.mockReturnValue({ fees: 0, notional: 0, n: 0 })
    mockAll.mockReturnValue([])
    expect(summarizeFeeLedger(0).topTenWalletShare).toBe(0)
  })
})

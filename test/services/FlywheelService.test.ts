import { beforeEach, describe, expect, it, vi } from 'vitest'

const PAYOUT = 'So11111111111111111111111111111111111111112'
const BUYBACK_ADDR = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const DAEMON = '4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump'
const TOKEN = 'BVn6UjFkr6geqAwRFW1ZdKxfH1rHg6DMu8GppA1hpum1' // any 44-char base58

const {
  mockWithKeypair,
  mockLoadKeypair,
  mockGetConnectionStrict,
  mockExecuteInstructions,
  mockExecuteSwap,
  mockGetMintDecimals,
  mockCreateSharingConfig,
  mockIsUsingSharing,
  mockCollectFees,
  mockGetVaultBalance,
  mockFetchBondingCurve,
  mockGetAccount,
  mockGetAta,
  mockCreateBurn,
} = vi.hoisted(() => ({
  mockWithKeypair: vi.fn(),
  mockLoadKeypair: vi.fn(),
  mockGetConnectionStrict: vi.fn(),
  mockExecuteInstructions: vi.fn(),
  mockExecuteSwap: vi.fn(),
  mockGetMintDecimals: vi.fn(),
  mockCreateSharingConfig: vi.fn(),
  mockIsUsingSharing: vi.fn(() => false),
  mockCollectFees: vi.fn(),
  mockGetVaultBalance: vi.fn(),
  mockFetchBondingCurve: vi.fn(),
  mockGetAccount: vi.fn(),
  mockGetAta: vi.fn(),
  mockCreateBurn: vi.fn(() => ({ kind: 'burn-ix' })),
}))

const mockDecodePool = vi.hoisted(() => vi.fn())
const mockDecodeBondingCurve = vi.hoisted(() => vi.fn())
const jupiterKeyRef = vi.hoisted(() => ({ value: 'jup-test-key' as string | null }))

const mockSdkModule = vi.hoisted(() => ({
  PumpSdk: vi.fn(() => ({
    createSharingConfigWithSocialRecipients: mockCreateSharingConfig,
    decodePool: mockDecodePool,
    decodeBondingCurveNullable: mockDecodeBondingCurve,
  })),
  OnlinePumpSdk: vi.fn(() => ({
    collectCoinCreatorFeeInstructions: mockCollectFees,
    getCreatorVaultBalanceBothPrograms: mockGetVaultBalance,
    fetchBondingCurve: mockFetchBondingCurve,
  })),
  isCreatorUsingSharingConfig: mockIsUsingSharing,
  bondingCurvePda: vi.fn(() => ({ toBase58: () => 'bc-pda' })),
  canonicalPumpPoolPda: vi.fn(() => ({ toBase58: () => 'pool-pda' })),
}))

vi.mock('node:module', () => ({ createRequire: () => () => mockSdkModule }))

vi.mock('../../electron/services/SolanaService', () => ({
  withKeypair: mockWithKeypair,
  loadKeypair: mockLoadKeypair,
  getConnectionStrict: mockGetConnectionStrict,
  executeInstructions: mockExecuteInstructions,
  getJupiterApiKey: () => jupiterKeyRef.value,
}))

vi.mock('../../electron/services/WalletService', () => ({
  executeSwap: mockExecuteSwap,
  getMintDecimals: mockGetMintDecimals,
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: () => ({ cluster: 'mainnet-beta' }),
}))

vi.mock('@solana/spl-token', () => ({
  TOKEN_PROGRAM_ID: { toBase58: () => 'TokenProgram1111111111111111111111111111111', _id: 'classic' },
  TOKEN_2022_PROGRAM_ID: { toBase58: () => 'Token2022', _id: 'token-2022' },
  getAssociatedTokenAddress: (...a: unknown[]) => mockGetAta(...a),
  getAccount: (...a: unknown[]) => mockGetAccount(...a),
  createBurnCheckedInstruction: (...a: unknown[]) => mockCreateBurn(...a),
}))

// In-memory DB shim covering the prepared statements FlywheelService uses.
const configs: Record<string, Record<string, unknown>> = {}
const events: Array<Record<string, unknown>> = []
const settlements: Record<string, Record<string, unknown>> = {}
const wallets: Record<string, { address: string }> = {
  'creator-w': { address: PAYOUT },
  'buyback-w': { address: BUYBACK_ADDR },
}

function makeDb() {
  return {
    prepare(sql: string) {
      const s = sql.replace(/\s+/g, ' ').trim()
      return {
        get(...args: unknown[]) {
          if (s.startsWith('SELECT address FROM wallets')) return wallets[args[0] as string]
          if (s.includes('FROM flywheel_configs WHERE id')) return configs[args[0] as string]
          if (s.includes('FROM flywheel_configs WHERE token_mint')) {
            return Object.values(configs).find((c) => c.token_mint === args[0])
          }
          if (s.includes('FROM flywheel_settlements WHERE id')) return settlements[args[0] as string]
          if (s.includes("FROM flywheel_settlements WHERE config_id = ? AND status = 'claimed'")) {
            return Object.values(settlements)
              .filter((r) => r.config_id === args[0] && r.status === 'claimed')
              .sort((a, b) => (a.created_at as number) - (b.created_at as number))[0]
          }
          return undefined
        },
        all(...args: unknown[]) {
          if (s.includes('FROM flywheel_events')) {
            return events.filter((e) => e.config_id === args[0])
          }
          if (s.includes('FROM flywheel_configs ORDER BY')) return Object.values(configs)
          return []
        },
        run(...args: unknown[]) {
          if (s.startsWith('INSERT INTO flywheel_configs')) {
            const [id, token_mint, label, creator_wallet_id, payout_wallet, buyback_wallet_id,
              buyback_wallet, payout_bps, buyback_bps, buyback_target_mint, burn, configure_signature] = args
            configs[id as string] = {
              id, token_mint, label, creator_wallet_id, payout_wallet, buyback_wallet_id,
              buyback_wallet, payout_bps, buyback_bps, buyback_target_mint, burn, configure_signature,
              created_at: Date.now(),
            }
          } else if (s.startsWith('UPDATE flywheel_configs SET')) {
            const [label, creator_wallet_id, payout_wallet, buyback_wallet_id, buyback_wallet,
              payout_bps, buyback_bps, buyback_target_mint, burn, id] = args
            const existing = configs[id as string]
            if (existing) {
              Object.assign(existing, {
                label, creator_wallet_id, payout_wallet, buyback_wallet_id, buyback_wallet,
                payout_bps, buyback_bps, buyback_target_mint, burn,
              })
            }
          } else if (s.startsWith('INSERT INTO flywheel_events')) {
            const [id, config_id, kind, signature, sol_amount, token_amount, token_mint, note, at] = args
            events.push({ id, config_id, kind, signature, sol_amount, token_amount, token_mint, note, at })
          } else if (s.startsWith('INSERT INTO flywheel_settlements')) {
            const [id, config_id, claim_signature, claimed_lamports] = args
            settlements[id as string] = {
              id, config_id, claim_signature, claimed_lamports,
              payout_lamports: 0, buyback_lamports: 0,
              payout_signature: null, buyback_signature: null,
              status: 'claimed', created_at: Date.now(),
            }
          } else if (s.includes('UPDATE flywheel_settlements SET payout_lamports')) {
            const [payout_lamports, buyback_lamports, id] = args
            Object.assign(settlements[id as string] ?? {}, { payout_lamports, buyback_lamports })
          } else if (s.includes('UPDATE flywheel_settlements SET payout_signature')) {
            const [sig, id] = args
            Object.assign(settlements[id as string] ?? {}, { payout_signature: sig })
          } else if (s.includes('UPDATE flywheel_settlements SET buyback_signature')) {
            const [sig, id] = args
            Object.assign(settlements[id as string] ?? {}, { buyback_signature: sig })
          } else if (s.includes("UPDATE flywheel_settlements SET status = 'distributed'")) {
            Object.assign(settlements[args[0] as string] ?? {}, { status: 'distributed' })
          }
          return { changes: 1 }
        },
      }
    },
  }
}

vi.mock('../../electron/db/db', () => ({ getDb: () => makeDb() }))

import * as Flywheel from '../../electron/services/FlywheelService'

function seedConfig(overrides: Partial<Record<string, unknown>> = {}): string {
  const id = (overrides.id as string) ?? 'cfg-1'
  configs[id] = {
    id,
    token_mint: (overrides.token_mint as string) ?? TOKEN,
    label: 'Keycard',
    creator_wallet_id: 'creator-w',
    payout_wallet: PAYOUT,
    buyback_wallet_id: 'buyback-w',
    buyback_wallet: BUYBACK_ADDR,
    payout_bps: 8000,
    buyback_bps: 2000,
    buyback_target_mint: DAEMON,
    burn: 1,
    configure_signature: 'sig-configure',
    created_at: Date.now(),
    ...overrides,
  }
  return id
}

describe('FlywheelService.validateShareholders', () => {
  it('accepts a valid 80/20 split', () => {
    expect(() =>
      Flywheel.validateShareholders([
        { address: PAYOUT, shareBps: 8000 },
        { address: BUYBACK_ADDR, shareBps: 2000 },
      ]),
    ).not.toThrow()
  })

  it('rejects shares that do not sum to 10000', () => {
    expect(() =>
      Flywheel.validateShareholders([
        { address: PAYOUT, shareBps: 8000 },
        { address: BUYBACK_ADDR, shareBps: 1000 },
      ]),
    ).toThrow(/sum to 10000/)
  })

  it('rejects duplicate addresses', () => {
    expect(() =>
      Flywheel.validateShareholders([
        { address: PAYOUT, shareBps: 5000 },
        { address: PAYOUT, shareBps: 5000 },
      ]),
    ).toThrow(/Duplicate/)
  })

  it('rejects zero or negative shares', () => {
    expect(() =>
      Flywheel.validateShareholders([
        { address: PAYOUT, shareBps: 10000 },
        { address: BUYBACK_ADDR, shareBps: 0 },
      ]),
    ).toThrow(/positive integer/)
  })

  it('rejects more than 10 shareholders', () => {
    // The count guard runs before per-address validation, so placeholder addresses are fine.
    const many = Array.from({ length: 11 }, () => ({ address: PAYOUT, shareBps: 1 }))
    expect(() => Flywheel.validateShareholders(many)).toThrow(/Too many shareholders/)
  })
})

describe('FlywheelService configure (off-chain split)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(configs)) delete configs[k]
    events.length = 0
    // creator-w resolves to PAYOUT; the token's on-chain creator must match it.
    // resolveTokenCreatorState reads the bonding-curve account raw, then decodes it.
    mockGetConnectionStrict.mockReturnValue({
      getAccountInfo: vi.fn(async () => ({ data: Buffer.alloc(151) })),
    })
    mockDecodeBondingCurve.mockReturnValue({ creator: { toBase58: () => PAYOUT }, complete: false })
  })

  it('persists the split off-chain without writing any on-chain config', async () => {
    const config = await Flywheel.configureSplit({
      tokenMint: TOKEN,
      label: 'Keycard',
      creatorWalletId: 'creator-w',
      payoutWallet: PAYOUT,
      buybackWalletId: 'buyback-w',
      payoutBps: 9500,
      buybackBps: 500,
    })
    expect(config.payoutBps).toBe(9500)
    expect(config.buybackBps).toBe(500)
    expect(config.buybackTargetMint).toBe(DAEMON)
    expect(config.configureSignature).toBeNull() // no on-chain tx
    expect(mockCreateSharingConfig).not.toHaveBeenCalled()
    expect(events.some((e) => e.kind === 'configure')).toBe(true)
  })

  it('updates an existing config instead of erroring on a second save', async () => {
    const first = await Flywheel.configureSplit({
      tokenMint: TOKEN, creatorWalletId: 'creator-w', payoutWallet: PAYOUT,
      buybackWalletId: 'buyback-w', payoutBps: 9500, buybackBps: 500,
    })
    const second = await Flywheel.configureSplit({
      tokenMint: TOKEN, creatorWalletId: 'creator-w', payoutWallet: PAYOUT,
      buybackWalletId: 'buyback-w', payoutBps: 8000, buybackBps: 2000,
    })
    expect(second.id).toBe(first.id) // same row, updated
    expect(second.payoutBps).toBe(8000)
  })

  it('rejects when the selected wallet is not the token on-chain creator', async () => {
    mockDecodeBondingCurve.mockReturnValue({ creator: { toBase58: () => BUYBACK_ADDR }, complete: false })
    await expect(
      Flywheel.configureSplit({
        tokenMint: TOKEN, creatorWalletId: 'creator-w', payoutWallet: PAYOUT,
        buybackWalletId: 'buyback-w', payoutBps: 9500, buybackBps: 500,
      }),
    ).rejects.toThrow(/not the token's on-chain creator/)
  })
})

describe('FlywheelService runBuyback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(configs)) delete configs[k]
    events.length = 0
    jupiterKeyRef.value = 'jup-test-key'
    mockGetConnectionStrict.mockReturnValue({
      getBalance: vi.fn(async () => 1_000_000_000), // 1 SOL
      // $DAEMON is Token-2022 — resolveTokenProgram reads the mint owner.
      getAccountInfo: vi.fn(async () => ({ owner: { equals: (o: { _id?: string }) => o?._id === 'token-2022' } })),
    })
    mockLoadKeypair.mockReturnValue({ publicKey: { toBase58: () => BUYBACK_ADDR } })
    mockExecuteSwap.mockResolvedValue({ signature: 'sig-swap', transport: 'jupiter' })
    mockGetAta.mockResolvedValue({ toBase58: () => 'ata' })
    mockGetAccount.mockResolvedValue({ amount: 500_000n })
    mockGetMintDecimals.mockResolvedValue(6)
    mockWithKeypair.mockImplementation(async (_id: string, fn: (kp: unknown) => Promise<unknown>) =>
      fn({ publicKey: { toBase58: () => BUYBACK_ADDR } }),
    )
    mockExecuteInstructions.mockResolvedValue({ signature: 'sig-burn', transport: 'rpc' })
  })

  it('swaps the spendable SOL then burns the bought tokens, recording both events', async () => {
    const id = seedConfig()
    const result = await Flywheel.runBuyback(id)

    expect(result.swapSignature).toBe('sig-swap')
    expect(result.burnSignature).toBe('sig-burn')

    // swap spends balance minus the 0.01 SOL reserve
    const swapArgs = mockExecuteSwap.mock.calls[0]
    expect(swapArgs[1]).toBe('So11111111111111111111111111111111111111112') // SOL in
    expect(swapArgs[2]).toBe(DAEMON) // DAEMON out
    expect(swapArgs[3]).toBeCloseTo(0.99, 5)

    expect(mockCreateBurn).toHaveBeenCalledOnce()
    // The burn must use the Token-2022 program (last arg) for a Token-2022 mint like $DAEMON.
    const burnArgs = mockCreateBurn.mock.calls[0]
    expect((burnArgs[burnArgs.length - 1] as { _id?: string })._id).toBe('token-2022')
    const swapEvent = events.find((e) => e.kind === 'swap')
    const burnEvent = events.find((e) => e.kind === 'burn')
    expect(swapEvent).toBeTruthy()
    expect(burnEvent?.token_amount).toBe('500000')
  })

  it('skips the burn when there is no token balance to burn', async () => {
    mockGetAccount.mockResolvedValue({ amount: 0n })
    const id = seedConfig()
    const result = await Flywheel.runBuyback(id)
    expect(result.swapSignature).toBe('sig-swap')
    expect(result.burnSignature).toBeNull()
    expect(mockCreateBurn).not.toHaveBeenCalled()
  })

  it('does not burn when config.burn is false', async () => {
    const id = seedConfig({ burn: 0 })
    const result = await Flywheel.runBuyback(id)
    expect(result.burnSignature).toBeNull()
    expect(mockCreateBurn).not.toHaveBeenCalled()
  })

  it('reports no-jupiter-key and does NOT swap when the key is missing', async () => {
    jupiterKeyRef.value = null
    const id = seedConfig()
    const result = await Flywheel.runBuyback(id)
    expect(result.status).toBe('no-jupiter-key')
    expect(result.swapSignature).toBeNull()
    expect(mockExecuteSwap).not.toHaveBeenCalled()
  })

  it('reports swapped status when the swap runs', async () => {
    const id = seedConfig()
    const result = await Flywheel.runBuyback(id)
    expect(result.status).toBe('swapped')
    expect(result.swapSignature).toBe('sig-swap')
  })

  it('still burns existing tokens when the swap fails (guard-blocked route)', async () => {
    mockExecuteSwap.mockRejectedValue(new Error('Signer guard: transaction touches non-allowlisted program(s)'))
    const id = seedConfig()
    const result = await Flywheel.runBuyback(id)
    expect(result.status).toBe('swap-failed')
    expect(result.swapSignature).toBeNull()
    expect(result.swapError).toMatch(/non-allowlisted/)
    // burn of the 500_000 already-held tokens must still run
    expect(result.burnSignature).toBe('sig-burn')
    expect(mockCreateBurn).toHaveBeenCalledOnce()
  })
})

function seedSettlement(configId: string, claimedLamports: number, overrides: Partial<Record<string, unknown>> = {}): string {
  const id = `stl-${Object.keys(settlements).length + 1}`
  settlements[id] = {
    id, config_id: configId, claim_signature: `claim-${id}`, claimed_lamports: claimedLamports,
    payout_lamports: 0, buyback_lamports: 0, payout_signature: null, buyback_signature: null,
    status: 'claimed', created_at: Date.now(), ...overrides,
  }
  return id
}

describe('FlywheelService distributeClaimed (settlement-driven, 95/5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(configs)) delete configs[k]
    for (const k of Object.keys(settlements)) delete settlements[k]
    events.length = 0
    mockGetConnectionStrict.mockReturnValue({})
    let n = 0
    mockExecuteInstructions.mockImplementation(async () => ({ signature: `xfer-${++n}`, transport: 'rpc' }))
    mockWithKeypair.mockImplementation(async (_id: string, fn: (kp: unknown) => Promise<unknown>) =>
      fn({ publicKey: { toBase58: () => PAYOUT } }),
    )
  })

  it('splits the claimed amount minus the fee reserve, 95/5', async () => {
    const id = seedConfig({ payout_bps: 9500, buyback_bps: 500 })
    const stl = seedSettlement(id, 1_000_000_000) // 1 SOL claimed
    const result = await Flywheel.distributeClaimed(stl)

    // distributable = 1e9 - 30_000 reserve
    expect(result.payoutSignature).toBe('xfer-1')
    expect(result.buybackSignature).toBe('xfer-2')
    expect(result.buybackLamports).toBe(Math.floor((1_000_000_000 - 30_000) * 0.05))
    expect(events.filter((e) => e.kind === 'transfer')).toHaveLength(2)
    // settlement marked distributed + leg signatures persisted
    expect(settlements[stl].status).toBe('distributed')
    expect(settlements[stl].payout_signature).toBe('xfer-1')
  })

  it('is idempotent: a resume skips the already-completed payout leg (no double-send)', async () => {
    const id = seedConfig({ payout_bps: 9500, buyback_bps: 500 })
    // Simulate a crash AFTER payout landed but BEFORE buyback: payout_signature set, amounts frozen.
    const distributable = 1_000_000_000 - 30_000
    const stl = seedSettlement(id, 1_000_000_000, {
      payout_lamports: Math.floor(distributable * 0.95),
      buyback_lamports: Math.floor(distributable * 0.05),
      payout_signature: 'payout-already-done',
    })
    const result = await Flywheel.distributeClaimed(stl)

    expect(result.payoutSignature).toBe('payout-already-done') // not re-sent
    expect(result.buybackSignature).toBe('xfer-1') // only the buyback leg ran
    // exactly ONE transfer this run (the buyback), not two
    expect(mockExecuteInstructions).toHaveBeenCalledOnce()
  })
})

describe('FlywheelService distributeManual', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(configs)) delete configs[k]
    events.length = 0
    mockGetConnectionStrict.mockReturnValue({})
    let n = 0
    mockExecuteInstructions.mockImplementation(async () => ({ signature: `m-${++n}`, transport: 'rpc' }))
    mockWithKeypair.mockImplementation(async (_id: string, fn: (kp: unknown) => Promise<unknown>) =>
      fn({ publicKey: { toBase58: () => PAYOUT } }),
    )
  })

  it('splits a manual amount minus the fee reserve', async () => {
    const id = seedConfig({ payout_bps: 9500, buyback_bps: 500 })
    const result = await Flywheel.distributeManual(id, 1_000_000_000)
    expect(result.payoutSignature).toBe('m-1')
    expect(result.buybackSignature).toBe('m-2')
    expect(result.buybackLamports).toBe(Math.floor((1_000_000_000 - 30_000) * 0.05))
  })

  it('does nothing when the amount is below the fee reserve', async () => {
    const id = seedConfig()
    const result = await Flywheel.distributeManual(id, 10_000) // < 30_000 reserve
    expect(result.payoutSignature).toBeNull()
    expect(result.buybackSignature).toBeNull()
    expect(mockExecuteInstructions).not.toHaveBeenCalled()
  })
})

describe('FlywheelService runAllFlywheels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const k of Object.keys(configs)) delete configs[k]
    for (const k of Object.keys(settlements)) delete settlements[k]
    events.length = 0
    jupiterKeyRef.value = 'jup-test-key'
    // Each config: no fees to claim → claim throws "No creator fees" (caught), nothing to
    // distribute, buyback finds the wallet below the floor → 'nothing-to-swap', no burn.
    mockGetConnectionStrict.mockReturnValue({
      getBalance: vi.fn(async () => 0),
      getAccountInfo: vi.fn(async () => null),
    })
    mockWithKeypair.mockImplementation(async (_id: string, fn: (kp: unknown) => Promise<unknown>) =>
      fn({ publicKey: { toBase58: () => PAYOUT } }),
    )
    mockGetAccount.mockRejectedValue(new Error('no ata'))
    // No fees → claim throws the catchable "No creator fees available to claim".
    mockCollectFees.mockResolvedValue([])
  })

  it('runs every config and continues past a failing one', async () => {
    seedConfig({ id: 'cfg-a', token_mint: TOKEN, label: 'A' })
    seedConfig({ id: 'cfg-b', token_mint: BUYBACK_ADDR, label: 'B', creator_wallet_id: 'missing-wallet' })

    const results = await Flywheel.runAllFlywheels()
    expect(results).toHaveLength(2)
    // cfg-a: no fees, nothing to swap → ok
    const a = results.find((r) => r.configId === 'cfg-a')
    expect(a?.ok).toBe(true)
    // cfg-b: creator wallet 'missing-wallet' not in the wallets shim → walletAddress throws → ok:false, but loop continued
    const b = results.find((r) => r.configId === 'cfg-b')
    expect(b?.ok).toBe(false)
    expect(b?.error).toMatch(/missing-wallet|not found/i)
  })
})

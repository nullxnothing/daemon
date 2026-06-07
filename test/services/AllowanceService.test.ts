import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicKey } from '@solana/web3.js'

const VALID_WALLET = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const getAccountMock = vi.fn()

vi.mock('../../electron/services/SolanaService', () => ({
  getConnection: () => ({}),
}))

vi.mock('@solana/spl-token', async () => {
  const actual = await vi.importActual<typeof import('@solana/spl-token')>('@solana/spl-token')
  return {
    ...actual,
    getAssociatedTokenAddress: vi.fn(async () => new PublicKey(USDC_MINT)),
    getAccount: (...args: unknown[]) => getAccountMock(...args),
  }
})

import * as AllowanceService from '../../electron/services/AllowanceService'
import { TokenAccountNotFoundError } from '@solana/spl-token'

describe('AllowanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects invalid wallet and mint addresses before reading chain', async () => {
    await expect(AllowanceService.getAllowanceState('not-a-wallet', USDC_MINT)).rejects.toThrow('Invalid wallet address')
    await expect(AllowanceService.getAllowanceState(VALID_WALLET, 'short')).rejects.toThrow('Invalid mint address')
    expect(getAccountMock).not.toHaveBeenCalled()
  })

  it('returns an empty allowance when the token account does not exist', async () => {
    getAccountMock.mockRejectedValueOnce(new TokenAccountNotFoundError())
    const state = await AllowanceService.getAllowanceState(VALID_WALLET, USDC_MINT)
    expect(state.tokenAccountExists).toBe(false)
    expect(state.hasDelegate).toBe(false)
    expect(state.delegate).toBeNull()
    expect(state.delegatedAmount).toBe('0')
  })

  it('parses an active delegate and cap off the token account', async () => {
    const delegate = new PublicKey('11111111111111111111111111111111')
    getAccountMock.mockResolvedValueOnce({ delegate, delegatedAmount: 5_000_000n })
    const state = await AllowanceService.getAllowanceState(VALID_WALLET, USDC_MINT)
    expect(state.tokenAccountExists).toBe(true)
    expect(state.hasDelegate).toBe(true)
    expect(state.delegate).toBe(delegate.toBase58())
    expect(state.delegatedAmount).toBe('5000000')
  })

  it('reports no delegate as no active allowance', async () => {
    getAccountMock.mockResolvedValueOnce({ delegate: null, delegatedAmount: 0n })
    const state = await AllowanceService.getAllowanceState(VALID_WALLET, USDC_MINT)
    expect(state.hasDelegate).toBe(false)
    expect(state.delegate).toBeNull()
  })

  it('marks enrollment when the delegate equals the derived subscription authority', async () => {
    const owner = new PublicKey(VALID_WALLET)
    const mint = new PublicKey(USDC_MINT)
    const [authority] = PublicKey.findProgramAddressSync(
      [Buffer.from('subscription_authority'), owner.toBuffer(), mint.toBuffer()],
      new PublicKey(AllowanceService.SUBSCRIPTIONS_PROGRAM_ID),
    )
    getAccountMock.mockResolvedValueOnce({ delegate: authority, delegatedAmount: 1_000_000n })
    const sub = await AllowanceService.getSubscriptionEnrollment(VALID_WALLET, USDC_MINT)
    expect(sub.subscriptionAuthority).toBe(authority.toBase58())
    expect(sub.enrolled).toBe(true)
  })

  it('is not enrolled when the delegate differs from the subscription authority', async () => {
    getAccountMock.mockResolvedValueOnce({ delegate: new PublicKey(USDC_MINT), delegatedAmount: 1n })
    const sub = await AllowanceService.getSubscriptionEnrollment(VALID_WALLET, USDC_MINT)
    expect(sub.enrolled).toBe(false)
  })

  it('exposes a valid base58 subscriptions program id', () => {
    expect(AllowanceService.SUBSCRIPTIONS_PROGRAM_ID).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  })
})

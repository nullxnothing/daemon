import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFetch,
  mockPrepare,
  mockStoreKey,
  mockDeleteKey,
  mockWithKeypair,
  mockTransferToken,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockPrepare: vi.fn(),
  mockStoreKey: vi.fn(),
  mockDeleteKey: vi.fn(),
  mockWithKeypair: vi.fn(),
  mockTransferToken: vi.fn(),
}))

vi.stubGlobal('fetch', mockFetch)

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/daemon-test' },
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: mockPrepare,
  }),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => null),
  storeKey: mockStoreKey,
  deleteKey: mockDeleteKey,
}))

vi.mock('../../electron/services/SolanaService', () => ({
  withKeypair: mockWithKeypair,
}))

vi.mock('../../electron/services/WalletService', () => ({
  transferToken: mockTransferToken,
}))

import { subscribe } from '../../electron/services/ProService'

describe('ProService subscription payment flow', () => {
  const walletAddress = 'Wallet1111111111111111111111111111111111111'
  let localRow: {
    wallet_id: string | null
    wallet_address: string | null
    expires_at: number | null
    features: string | null
    tier: string | null
  } | null

  beforeEach(() => {
    vi.clearAllMocks()
    localRow = null
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT wallet_id, wallet_address, expires_at, features, tier FROM pro_state')) {
        return { get: vi.fn(() => localRow) }
      }
      if (sql.includes('INSERT INTO pro_state')) {
        return {
          run: vi.fn((walletId, wallet, expiresAt, features, tier) => {
            localRow = {
              wallet_id: walletId,
              wallet_address: wallet,
              expires_at: expiresAt,
              features,
              tier,
            }
          }),
        }
      }
      return { get: vi.fn(), run: vi.fn(), all: vi.fn(() => []) }
    })
    mockWithKeypair.mockImplementation((_walletId: string, fn: Function) => fn({
      publicKey: { toBase58: () => walletAddress },
    }))
    mockTransferToken.mockResolvedValue({ id: 'tx-row', signature: 'solana-payment-sig', status: 'confirmed', transport: 'rpc' })
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            priceUsdc: 20,
            durationDays: 30,
            network: 'solana:mainnet',
            payTo: 'PayTo11111111111111111111111111111111111111',
            paymentMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          },
        }),
      })
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        json: async () => ({ ok: false, code: 'daemon_pro_payment_required' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          jwt: 'paid-jwt',
          expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          features: ['daemon-ai', 'pro-skills'],
          tier: 'pro',
          plan: 'pro',
        }),
      })
  })

  it('sends a real USDC transfer before requesting a server-issued entitlement token', async () => {
    const result = await subscribe('wallet-1')

    expect(mockTransferToken).toHaveBeenCalledWith(
      'wallet-1',
      'PayTo11111111111111111111111111111111111111',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      20,
    )
    const paidRequest = mockFetch.mock.calls[2]
    expect(String(paidRequest[0])).toContain('/v1/subscribe')
    const paymentHeader = paidRequest[1].headers['X-Payment']
    const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64url').toString('utf8'))
    expect(decoded).toMatchObject({
      wallet: walletAddress,
      txSignature: 'solana-payment-sig',
      amount: 20,
      network: 'solana:mainnet',
    })
    expect(mockStoreKey).toHaveBeenCalledWith('daemon_pro_jwt', 'paid-jwt')
    expect(result.state).toMatchObject({
      active: true,
      plan: 'pro',
      accessSource: 'payment',
      walletAddress,
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFetch,
  mockPrepare,
  mockStoreKey,
  mockDeleteKey,
  mockWithKeypair,
  mockCreateKeyPairSignerFromBytes,
  mockRegisterExactSvmScheme,
  mockToClientSvmSigner,
  mockGetPaymentRequiredResponse,
  mockCreatePaymentPayload,
  mockEncodePaymentSignatureHeader,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockPrepare: vi.fn(),
  mockStoreKey: vi.fn(),
  mockDeleteKey: vi.fn(),
  mockWithKeypair: vi.fn(),
  mockCreateKeyPairSignerFromBytes: vi.fn(),
  mockRegisterExactSvmScheme: vi.fn(),
  mockToClientSvmSigner: vi.fn(),
  mockGetPaymentRequiredResponse: vi.fn(),
  mockCreatePaymentPayload: vi.fn(),
  mockEncodePaymentSignatureHeader: vi.fn(),
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

vi.mock('@solana/kit', () => ({
  createKeyPairSignerFromBytes: mockCreateKeyPairSignerFromBytes,
}))

vi.mock('@x402/svm', () => ({
  toClientSvmSigner: mockToClientSvmSigner,
}))

vi.mock('@x402/svm/exact/client', () => ({
  registerExactSvmScheme: mockRegisterExactSvmScheme,
}))

vi.mock('@x402/core/client', () => ({
  x402Client: vi.fn(() => ({ kind: 'x402-client' })),
  x402HTTPClient: vi.fn(() => ({
    getPaymentRequiredResponse: mockGetPaymentRequiredResponse,
    createPaymentPayload: mockCreatePaymentPayload,
    encodePaymentSignatureHeader: mockEncodePaymentSignatureHeader,
  })),
}))

import { subscribe } from '../../electron/services/ProService'

describe('ProService subscription payment flow', () => {
  const walletAddress = 'Wallet1111111111111111111111111111111111111'
  const secretKey = new Uint8Array(64).fill(7)
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
      secretKey,
    }))
    mockCreateKeyPairSignerFromBytes.mockResolvedValue({ address: walletAddress })
    mockToClientSvmSigner.mockImplementation((signer) => signer)
    mockRegisterExactSvmScheme.mockImplementation((client) => client)
    mockGetPaymentRequiredResponse.mockReturnValue({
      x402Version: 2,
      resource: { url: '/v1/subscribe' },
      accepts: [],
    })
    mockCreatePaymentPayload.mockResolvedValue({
      x402Version: 2,
      accepted: { scheme: 'exact' },
      payload: { transaction: 'signed-svm-transaction' },
    })
    mockEncodePaymentSignatureHeader.mockReturnValue({ 'PAYMENT-SIGNATURE': 'signed-x402-payment' })
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            priceUsdc: 20,
            durationDays: 30,
            network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            payTo: 'PayTo11111111111111111111111111111111111111',
            paymentMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          },
        }),
      })
      .mockResolvedValueOnce({
        status: 402,
        ok: false,
        headers: { get: vi.fn(() => null) },
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

  it('signs an x402 SVM payment before requesting a server-issued entitlement token', async () => {
    const result = await subscribe('wallet-1')

    expect(mockCreateKeyPairSignerFromBytes).toHaveBeenCalledWith(secretKey)
    expect(mockRegisterExactSvmScheme).toHaveBeenCalledWith(expect.anything(), {
      signer: { address: walletAddress },
      networks: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
    })
    expect(mockCreatePaymentPayload).toHaveBeenCalledWith(expect.objectContaining({ x402Version: 2 }))
    const paidRequest = mockFetch.mock.calls[2]
    expect(String(paidRequest[0])).toContain('/v1/subscribe')
    expect(paidRequest[1].headers).toEqual({ 'PAYMENT-SIGNATURE': 'signed-x402-payment' })
    expect(mockStoreKey).toHaveBeenCalledWith('daemon_pro_jwt', 'paid-jwt')
    expect(result.state).toMatchObject({
      active: true,
      plan: 'pro',
      accessSource: 'payment',
      walletAddress,
    })
  })
})

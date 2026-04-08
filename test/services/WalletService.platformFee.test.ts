import { describe, it, expect, vi, beforeEach } from 'vitest'

// All state the vi.mock factories touch must be declared via vi.hoisted.
const {
  mockFetch,
  mockGetAccountInfo,
  mockGetAssociatedTokenAddress,
  mockGetBooleanSetting,
  platformFeeMock,
} = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetAccountInfo: vi.fn(),
  mockGetAssociatedTokenAddress: vi.fn(),
  mockGetBooleanSetting: vi.fn((_key: string, fallback: boolean) => fallback),
  platformFeeMock: {
    BPS: 50,
    WALLET_PUBKEY: 'FeeW4lLet1111111111111111111111111111111111',
    ENABLED_SETTING_KEY: 'platform_fee_enabled',
    ENABLED_DEFAULT: true,
  },
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/daemon-test' },
  safeStorage: {
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
    isEncryptionAvailable: () => true,
  },
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: vi.fn(() => ({
      get: vi.fn().mockReturnValue({ value: 'true' }),
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
    })),
    transaction: (fn: () => void) => fn,
  }),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => null),
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
  isEncryptionAvailable: vi.fn(() => true),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getBooleanSetting: mockGetBooleanSetting,
  setBooleanSetting: vi.fn(),
}))

vi.mock('../../electron/config/constants', () => ({
  API_ENDPOINTS: {
    HELIUS_BASE: 'https://api.helius.xyz/v1',
    COINGECKO_PRICE: 'https://api.coingecko.com/',
    JUPITER_PRICE: 'https://api.jup.ag/price/v2',
    DEXSCREENER_TOKEN: 'https://api.dexscreener.com/',
    HELIUS_PARSE_TX: 'https://api.helius.xyz/v0/transactions',
    HELIUS_TX_HISTORY: 'https://api.helius.xyz/v0/addresses',
  },
  RETRY_CONFIG: { MAX_RETRIES: 3, BASE_DELAY_MS: 1000 },
  PLATFORM_FEE: platformFeeMock,
}))

vi.mock('../../electron/services/SolanaService', () => ({
  getConnection: vi.fn(() => ({
    getAccountInfo: mockGetAccountInfo,
    getParsedAccountInfo: vi.fn().mockResolvedValue({
      value: { data: { parsed: { info: { decimals: 6 } } } },
    }),
    getBalance: vi.fn().mockResolvedValue(10_000_000_000),
    getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: 'hash', lastValidBlockHeight: 999 }),
    sendRawTransaction: vi.fn().mockResolvedValue('sig'),
  })),
  getConnectionStrict: vi.fn(),
  loadKeypair: vi.fn(),
  withKeypair: vi.fn(),
}))

vi.mock('@solana/spl-token', () => ({
  getAssociatedTokenAddress: mockGetAssociatedTokenAddress,
  getAccount: vi.fn(),
  createTransferInstruction: vi.fn(),
  createAssociatedTokenAccountInstruction: vi.fn(),
}))

vi.mock('@solana/web3.js', () => ({
  Connection: vi.fn(),
  Keypair: { fromSecretKey: vi.fn(), generate: vi.fn() },
  PublicKey: vi.fn((addr: string) => ({
    toBase58: () => addr,
    toBuffer: () => Buffer.alloc(32),
    toString: () => addr,
  })),
  Transaction: vi.fn(),
  SystemProgram: { transfer: vi.fn() },
  LAMPORTS_PER_SOL: 1_000_000_000,
  sendAndConfirmTransaction: vi.fn(),
  TOKEN_PROGRAM_ID: { toBase58: () => 'TokenProgram' },
}))

vi.stubGlobal('fetch', mockFetch)

import { getSwapQuote } from '../../electron/services/WalletService'

const SOL = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

function mockJupiterQuoteResponse(overrides: Partial<Record<string, unknown>> = {}) {
  const body = {
    inputMint: SOL,
    outputMint: USDC,
    inAmount: '1000000000',  // 1 SOL in lamports
    outAmount: '200000000',  // 200 USDC (6 decimals)
    priceImpactPct: '0.01',
    routePlan: [{ swapInfo: { label: 'Orca', ammKey: 'k' }, percent: 100 }],
    ...overrides,
  }
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  return body
}

beforeEach(() => {
  mockFetch.mockReset()
  mockGetAccountInfo.mockReset()
  mockGetAssociatedTokenAddress.mockReset().mockResolvedValue({
    toBase58: () => 'FeeAta11111111111111111111111111111111111111',
    toBuffer: () => Buffer.alloc(32),
  })
  mockGetBooleanSetting.mockReset().mockImplementation((_key, fallback) => fallback)
  platformFeeMock.BPS = 50
  platformFeeMock.WALLET_PUBKEY = 'FeeW4lLet1111111111111111111111111111111111'
})

function extractFetchedUrl(): URL {
  const call = mockFetch.mock.calls[0]
  expect(call).toBeDefined()
  return new URL(call[0] as string)
}

describe('getSwapQuote — platform fee enabled + ATA exists', () => {
  it('attaches platformFeeBps to the Jupiter quote URL', async () => {
    mockGetAccountInfo.mockResolvedValue({ lamports: 2_039_280 }) // ATA exists
    mockJupiterQuoteResponse({
      platformFee: { amount: '1000000', feeBps: 50 }, // 1 USDC at 50 bps
    })

    const quote = await getSwapQuote(SOL, USDC, 1, 50)

    const url = extractFetchedUrl()
    expect(url.searchParams.get('platformFeeBps')).toBe('50')
    expect(url.searchParams.get('inputMint')).toBe(SOL)
    expect(url.searchParams.get('outputMint')).toBe(USDC)
    expect(quote.platformFee).not.toBeNull()
    expect(quote.platformFee?.bps).toBe(50)
  })

  it('uses Jupiter-reported platformFee.amount when present', async () => {
    mockGetAccountInfo.mockResolvedValue({ lamports: 2_039_280 })
    mockJupiterQuoteResponse({
      platformFee: { amount: '1000000', feeBps: 50 }, // 1 USDC (6 decimals)
    })

    const quote = await getSwapQuote(SOL, USDC, 1, 50)
    expect(quote.platformFee?.amount).toBe('1')
  })

  it('falls back to derived fee amount when Jupiter omits platformFee field', async () => {
    mockGetAccountInfo.mockResolvedValue({ lamports: 2_039_280 })
    mockJupiterQuoteResponse({}) // no platformFee in response

    const quote = await getSwapQuote(SOL, USDC, 1, 50)
    // outAmount=200 USDC, bps=50 → fee ≈ 200 * 50 / 9950 ≈ 1.00502...
    expect(quote.platformFee).not.toBeNull()
    expect(parseFloat(quote.platformFee!.amount)).toBeGreaterThan(0.99)
    expect(parseFloat(quote.platformFee!.amount)).toBeLessThan(1.02)
  })
})

describe('getSwapQuote — platform fee skipped', () => {
  it('omits platformFeeBps when fee wallet is not configured at build time', async () => {
    platformFeeMock.WALLET_PUBKEY = ''
    mockJupiterQuoteResponse()

    const quote = await getSwapQuote(SOL, USDC, 1, 50)
    expect(extractFetchedUrl().searchParams.get('platformFeeBps')).toBeNull()
    expect(quote.platformFee).toBeNull()
  })

  it('omits platformFeeBps when BPS is 0', async () => {
    platformFeeMock.BPS = 0
    mockJupiterQuoteResponse()

    const quote = await getSwapQuote(SOL, USDC, 1, 50)
    expect(extractFetchedUrl().searchParams.get('platformFeeBps')).toBeNull()
    expect(quote.platformFee).toBeNull()
  })

  it('omits platformFeeBps when user has opted out via settings', async () => {
    mockGetBooleanSetting.mockImplementation((key) =>
      key === 'platform_fee_enabled' ? false : true,
    )
    mockJupiterQuoteResponse()

    const quote = await getSwapQuote(SOL, USDC, 1, 50)
    expect(extractFetchedUrl().searchParams.get('platformFeeBps')).toBeNull()
    expect(quote.platformFee).toBeNull()
  })

  it('omits platformFeeBps when the fee ATA has not been initialized', async () => {
    mockGetAccountInfo.mockResolvedValue(null) // ATA does NOT exist
    mockJupiterQuoteResponse()

    const quote = await getSwapQuote(SOL, USDC, 1, 50)
    expect(extractFetchedUrl().searchParams.get('platformFeeBps')).toBeNull()
    expect(quote.platformFee).toBeNull()
  })

  it('omits platformFeeBps when the fee wallet pubkey is malformed', async () => {
    platformFeeMock.WALLET_PUBKEY = 'not-a-real-pubkey'
    // Make PublicKey constructor throw for this specific address
    mockGetAssociatedTokenAddress.mockRejectedValueOnce(new Error('invalid address'))
    mockJupiterQuoteResponse()

    const quote = await getSwapQuote(SOL, USDC, 1, 50)
    expect(extractFetchedUrl().searchParams.get('platformFeeBps')).toBeNull()
    expect(quote.platformFee).toBeNull()
  })
})

describe('getSwapQuote — input validation (unchanged)', () => {
  it('rejects zero amount regardless of fee state', async () => {
    await expect(getSwapQuote(SOL, USDC, 0, 50)).rejects.toThrow(/greater than 0/i)
  })

  it('rejects identical input/output mints', async () => {
    await expect(getSwapQuote(SOL, SOL, 1, 50)).rejects.toThrow(/must differ/i)
  })
})

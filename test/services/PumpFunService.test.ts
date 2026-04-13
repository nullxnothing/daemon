import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockWithKeypair,
  mockGetConnectionStrict,
  mockFetchGlobal,
  mockFetchBondingCurve,
  mockFetchFeeConfig,
  mockFetch,
} = vi.hoisted(() => ({
  mockWithKeypair: vi.fn(),
  mockGetConnectionStrict: vi.fn(),
  mockFetchGlobal: vi.fn(),
  mockFetchBondingCurve: vi.fn(),
  mockFetchFeeConfig: vi.fn(),
  mockFetch: vi.fn(),
}))

const mockSdkModule = vi.hoisted(() => ({
  OnlinePumpSdk: vi.fn(() => ({
    fetchGlobal: mockFetchGlobal,
    fetchBondingCurve: mockFetchBondingCurve,
    fetchFeeConfig: mockFetchFeeConfig,
    buyInstructions: vi.fn(),
    sellInstructions: vi.fn(),
  })),
  PumpSdk: vi.fn(() => ({})),
  bondingCurvePda: vi.fn(() => ({ toBase58: () => 'curve-1' })),
  getBuyTokenAmountFromSolAmount: vi.fn(),
  getSellSolAmountFromTokenAmount: vi.fn(),
}))

vi.mock('node:module', () => ({
  createRequire: () => () => mockSdkModule,
}))

vi.mock('../../electron/services/SolanaService', () => ({
  withKeypair: mockWithKeypair,
  getConnectionStrict: mockGetConnectionStrict,
  executeInstructions: vi.fn(),
  loadKeypair: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: vi.fn(),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(),
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
  isEncryptionAvailable: vi.fn(() => true),
}))

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: vi.fn(),
  },
}))

vi.mock('@solana/spl-token', () => ({
  TOKEN_PROGRAM_ID: { toBase58: () => 'TokenProgram1111111111111111111111111111111' },
}))

vi.mock('@solana/web3.js', () => ({
  PublicKey: vi.fn((value: string) => ({ toBase58: () => value })),
  Keypair: {
    generate: vi.fn(),
  },
}))

vi.stubGlobal('fetch', mockFetch)

import { buyToken, createToken, sellToken } from '../../electron/services/PumpFunService'

describe('PumpFunService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConnectionStrict.mockReturnValue({
      getAccountInfo: vi.fn().mockResolvedValue({}),
    })
    mockWithKeypair.mockImplementation((_walletId: string, fn: Function) => fn({
      publicKey: { toBase58: () => 'Wallet111111111111111111111111111111111111' },
      secretKey: new Uint8Array(64),
    }))
    mockFetchGlobal.mockResolvedValue({ tokenTotalSupply: {} })
    mockFetchBondingCurve.mockResolvedValue({ complete: false })
    mockFetchFeeConfig.mockResolvedValue({})
  })

  it('rejects zero-value buys before building instructions', async () => {
    await expect(buyToken({
      walletId: 'wallet-1',
      mint: 'Mint111111111111111111111111111111111111111',
      action: 'buy',
      amountSol: 0,
      slippageBps: 100,
    })).rejects.toThrow('Buy amount must be greater than 0')
  })

  it('rejects zero-value sells before building instructions', async () => {
    await expect(sellToken({
      walletId: 'wallet-1',
      mint: 'Mint111111111111111111111111111111111111111',
      action: 'sell',
      amountTokens: 0,
      slippageBps: 100,
    })).rejects.toThrow('Sell amount must be greater than 0')
  })

  it('turns aborted metadata uploads into a clear timeout error', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    mockFetch.mockRejectedValue(abortError)

    await expect(createToken({
      walletId: 'wallet-1',
      name: 'Daemon',
      symbol: 'DMN',
      description: 'Daemon token',
      imagePath: null,
      initialBuyAmountSol: 0.1,
      mayhemMode: false,
    })).rejects.toThrow('Token metadata upload timed out after 30s')
  })
})

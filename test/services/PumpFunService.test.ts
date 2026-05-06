import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockWithKeypair,
  mockGetConnectionStrict,
  mockFetchGlobal,
  mockFetchBondingCurve,
  mockFetchFeeConfig,
  mockCreateV2AndBuyInstructions,
  mockExecuteInstructions,
  mockKeypairGenerate,
  mockFetch,
} = vi.hoisted(() => ({
  mockWithKeypair: vi.fn(),
  mockGetConnectionStrict: vi.fn(),
  mockFetchGlobal: vi.fn(),
  mockFetchBondingCurve: vi.fn(),
  mockFetchFeeConfig: vi.fn(),
  mockCreateV2AndBuyInstructions: vi.fn(),
  mockExecuteInstructions: vi.fn(),
  mockKeypairGenerate: vi.fn(),
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
  PumpSdk: vi.fn(() => ({
    createV2AndBuyInstructions: mockCreateV2AndBuyInstructions,
  })),
  bondingCurvePda: vi.fn(() => ({ toBase58: () => 'curve-1' })),
  getBuyTokenAmountFromSolAmount: vi.fn(() => ({ toString: () => '1000' })),
  getSellSolAmountFromTokenAmount: vi.fn(),
}))

vi.mock('node:module', () => ({
  createRequire: () => () => mockSdkModule,
}))

vi.mock('../../electron/services/SolanaService', () => ({
  withKeypair: mockWithKeypair,
  getConnectionStrict: mockGetConnectionStrict,
  executeInstructions: mockExecuteInstructions,
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
    generate: mockKeypairGenerate,
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
    mockCreateV2AndBuyInstructions.mockResolvedValue([{}])
    mockExecuteInstructions.mockResolvedValue({ signature: 'create-sig', transport: 'rpc' })
    mockKeypairGenerate.mockReturnValue({
      publicKey: { toBase58: () => 'Mint111111111111111111111111111111111111111' },
      secretKey: new Uint8Array(64),
    })
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

  it('retries transient metadata upload failures before creating the token', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'temporary outage',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ metadataUri: 'ipfs://metadata' }),
      })

    const result = await createToken({
      walletId: 'wallet-1',
      name: 'Daemon',
      symbol: 'DMN',
      description: 'Daemon token',
      imagePath: null,
      initialBuyAmountSol: 0.1,
      mayhemMode: false,
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      signature: 'create-sig',
      mint: 'Mint111111111111111111111111111111111111111',
      metadataUri: 'ipfs://metadata',
      bondingCurveAddress: 'curve-1',
    })
  })

  it('adds an explicit 500K CU limit to pump create+buy transactions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ metadataUri: 'ipfs://metadata' }),
    })

    await createToken({
      walletId: 'wallet-1',
      name: 'Daemon',
      symbol: 'DMN',
      description: 'Daemon token',
      imagePath: null,
      initialBuyAmountSol: 0.1,
      mayhemMode: false,
    })

    expect(mockExecuteInstructions).toHaveBeenCalledWith(
      expect.anything(),
      [{}],
      [expect.anything(), expect.objectContaining({ publicKey: expect.anything() })],
      {
        payer: expect.anything(),
        computeUnitLimit: 500_000,
      },
    )
  })

  it('adds mint context when create+buy submission fails ambiguously', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ metadataUri: 'ipfs://metadata' }),
    })
    mockExecuteInstructions.mockRejectedValueOnce(new Error('Transaction confirmation timed out (60s)'))

    await expect(createToken({
      walletId: 'wallet-1',
      name: 'Daemon',
      symbol: 'DMN',
      description: 'Daemon token',
      imagePath: null,
      initialBuyAmountSol: 0.1,
      mayhemMode: false,
    })).rejects.toThrow(/verify the mint on-chain before retrying/i)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  VersionedTransaction,
} from '@solana/web3.js'

const { mockGetWalletInfrastructureSettings, mockLogWarn } = vi.hoisted(() => ({
  mockGetWalletInfrastructureSettings: vi.fn(),
  mockLogWarn: vi.fn(),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: mockGetWalletInfrastructureSettings,
}))

vi.mock('../../electron/services/LogService', () => ({
  LogService: {
    warn: mockLogWarn,
  },
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => null),
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: vi.fn(),
}))

import {
  confirmSignature,
  executeInstructions,
  getRpcEndpoint,
} from '../../electron/services/SolanaService'

function mockInfrastructureSettings(overrides: Record<string, unknown> = {}) {
  mockGetWalletInfrastructureSettings.mockReturnValue({
    rpcProvider: 'helius',
    quicknodeRpcUrl: '',
    customRpcUrl: '',
    swapProvider: 'jupiter',
    preferredWallet: 'phantom',
    executionMode: 'rpc',
    jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    ...overrides,
  })
}

describe('SolanaService transaction execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInfrastructureSettings()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { priorityFeeEstimate: 42_000 } }),
    }))
  })

  it('adds compute budget instructions when executing raw instructions', async () => {
    const payer = Keypair.generate()
    let submittedTx: VersionedTransaction | null = null
    const connection = {
      rpcEndpoint: 'https://unit.test',
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: '11111111111111111111111111111111',
        lastValidBlockHeight: 123,
      }),
      sendRawTransaction: vi.fn((rawTx: Uint8Array) => {
        submittedTx = VersionedTransaction.deserialize(rawTx)
        return Promise.resolve('test-signature')
      }),
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
      getRecentPrioritizationFees: vi.fn(),
    } as any

    await executeInstructions(
      connection,
      [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1,
        }),
      ],
      [payer],
      { payer: payer.publicKey },
    )

    expect(submittedTx).not.toBeNull()
    const message = submittedTx!.message
    const [limitIx, priceIx] = message.compiledInstructions
    expect(message.staticAccountKeys[limitIx.programIdIndex].equals(ComputeBudgetProgram.programId)).toBe(true)
    expect(message.staticAccountKeys[priceIx.programIdIndex].equals(ComputeBudgetProgram.programId)).toBe(true)
    expect(limitIx.data[0]).toBe(2)
    expect(priceIx.data[0]).toBe(3)
  })

  it('confirms signatures with blockhash and lastValidBlockHeight strategy', async () => {
    const connection = {
      confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    } as any

    await confirmSignature(connection, 'test-signature', 1_000, {
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 456,
    })

    expect(connection.confirmTransaction).toHaveBeenCalledWith({
      signature: 'test-signature',
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 456,
    }, 'confirmed')
  })

  it('logs when falling back to public mainnet RPC', () => {
    mockInfrastructureSettings({ rpcProvider: 'public' })

    expect(getRpcEndpoint()).toBe('https://api.mainnet-beta.solana.com')
    expect(mockLogWarn).toHaveBeenCalledWith(
      'SolanaService',
      expect.stringContaining('Using public Solana mainnet RPC fallback'),
      expect.objectContaining({ reason: 'Public Solana RPC is selected.' }),
    )
  })
})

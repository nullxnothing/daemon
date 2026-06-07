import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js'

const {
  mockGetWalletInfrastructureSettings,
  mockSecureGetKey,
  mockLogWarn,
  mockAssertTransactionAllowed,
  mockEmitEventSafe,
  mockTrackError,
} = vi.hoisted(() => ({
  mockGetWalletInfrastructureSettings: vi.fn(),
  mockSecureGetKey: vi.fn(),
  mockLogWarn: vi.fn(),
  mockAssertTransactionAllowed: vi.fn(),
  mockEmitEventSafe: vi.fn(),
  mockTrackError: vi.fn(),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: mockGetWalletInfrastructureSettings,
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: mockSecureGetKey,
}))

vi.mock('../../electron/services/LogService', () => ({
  LogService: {
    warn: mockLogWarn,
  },
}))

vi.mock('../../electron/services/SignerGuardService', () => ({
  assertTransactionAllowed: mockAssertTransactionAllowed,
}))

vi.mock('../../electron/services/VoightService', () => ({
  emitEventSafe: mockEmitEventSafe,
  trackError: mockTrackError,
}))

import {
  executeTransactionWithReceipt,
  requireSuccessfulSignature,
} from '../../electron/services/SolanaExecutionService'

const BLOCKHASH = '11111111111111111111111111111111'

function mockInfrastructureSettings(overrides: Record<string, unknown> = {}) {
  mockGetWalletInfrastructureSettings.mockReturnValue({
    cluster: 'devnet',
    rpcProvider: 'quicknode',
    quicknodeRpcUrl: 'https://quicknode.test',
    customRpcUrl: '',
    swapProvider: 'jupiter',
    preferredWallet: 'phantom',
    executionMode: 'rpc',
    jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
    ...overrides,
  })
}

function makeConnection(overrides: Record<string, unknown> = {}) {
  return {
    rpcEndpoint: 'https://rpc.test',
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 123,
    }),
    sendRawTransaction: vi.fn().mockResolvedValue('rpc-signature'),
    confirmTransaction: vi.fn().mockResolvedValue({ value: { err: null } }),
    getRecentPrioritizationFees: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as any
}

function makeTransaction(payer: Keypair): Transaction {
  return new Transaction().add(SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1,
  }))
}

describe('SolanaExecutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInfrastructureSettings()
    mockSecureGetKey.mockReturnValue(null)
    mockAssertTransactionAllowed.mockReturnValue(undefined)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'jito-signature' }),
    }))
  })

  it('returns a success receipt for RPC transport', async () => {
    const payer = Keypair.generate()
    const connection = makeConnection()

    const receipt = await executeTransactionWithReceipt(
      connection,
      makeTransaction(payer),
      [payer],
      { addComputeBudget: false },
    )

    expect(receipt).toMatchObject({
      status: 'success',
      stage: 'record',
      signature: 'rpc-signature',
      transport: 'rpc',
      cluster: 'devnet',
      provider: 'quicknode',
      signerRoute: 'local-keypair',
    })
    expect(connection.sendRawTransaction).toHaveBeenCalled()
    expect(mockEmitEventSafe).toHaveBeenCalledWith(expect.objectContaining({
      transaction: 'rpc-signature',
      outcome: 'success',
    }))
  })

  it('returns a failed receipt for RPC submit failure', async () => {
    const payer = Keypair.generate()
    const connection = makeConnection({
      sendRawTransaction: vi.fn().mockRejectedValue(new Error('rpc unavailable')),
    })

    const receipt = await executeTransactionWithReceipt(
      connection,
      makeTransaction(payer),
      [payer],
      { addComputeBudget: false },
    )

    expect(receipt).toMatchObject({
      status: 'failed',
      stage: 'submit',
      failureReason: 'rpc unavailable',
    })
    expect(mockTrackError).toHaveBeenCalledWith('daemon-solana', expect.any(Error), expect.objectContaining({
      stage: 'submit',
      status: 'failed',
    }))
  })

  it('returns a success receipt for Jito transport', async () => {
    mockInfrastructureSettings({
      cluster: 'mainnet-beta',
      rpcProvider: 'helius',
      executionMode: 'jito',
    })
    mockSecureGetKey.mockImplementation((key: string) => key === 'HELIUS_API_KEY' ? 'helius-key' : null)
    const payer = Keypair.generate()
    const connection = makeConnection()

    const receipt = await executeTransactionWithReceipt(
      connection,
      makeTransaction(payer),
      [payer],
      { addComputeBudget: false },
    )

    expect(receipt).toMatchObject({
      status: 'success',
      stage: 'record',
      signature: 'jito-signature',
      transport: 'jito',
      cluster: 'mainnet-beta',
      provider: 'helius',
    })
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith(
      'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('returns a failed receipt for Jito HTTP failure', async () => {
    mockInfrastructureSettings({
      cluster: 'mainnet-beta',
      rpcProvider: 'helius',
      executionMode: 'jito',
    })
    mockSecureGetKey.mockImplementation((key: string) => key === 'HELIUS_API_KEY' ? 'helius-key' : null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: { message: 'jito down' } }),
    }))
    const payer = Keypair.generate()
    const connection = makeConnection()

    const receipt = await executeTransactionWithReceipt(
      connection,
      makeTransaction(payer),
      [payer],
      { addComputeBudget: false },
    )

    expect(receipt).toMatchObject({
      status: 'failed',
      stage: 'submit',
      transport: 'jito',
      failureReason: 'jito down',
    })
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('blocks in guard before submit', async () => {
    mockAssertTransactionAllowed.mockImplementation(() => {
      throw new Error('Signer guard: unexpected program')
    })
    const payer = Keypair.generate()
    const connection = makeConnection()

    const receipt = await executeTransactionWithReceipt(
      connection,
      makeTransaction(payer),
      [payer],
      { addComputeBudget: false },
    )

    expect(receipt).toMatchObject({
      status: 'blocked',
      stage: 'guard',
      failureReason: 'Signer guard: unexpected program',
    })
    expect(connection.sendRawTransaction).not.toHaveBeenCalled()
  })

  it('runs guard before submit', async () => {
    const payer = Keypair.generate()
    const connection = makeConnection()

    await executeTransactionWithReceipt(
      connection,
      makeTransaction(payer),
      [payer],
      { addComputeBudget: false },
    )

    expect(mockAssertTransactionAllowed.mock.invocationCallOrder[0]).toBeLessThan(
      connection.sendRawTransaction.mock.invocationCallOrder[0],
    )
  })

  it('classifies confirmation timeout as submitted', async () => {
    const payer = Keypair.generate()
    const connection = makeConnection({
      sendRawTransaction: vi.fn().mockResolvedValue('pending-signature'),
      confirmTransaction: vi.fn(() => new Promise(() => {})),
    })

    const receipt = await executeTransactionWithReceipt(
      connection,
      makeTransaction(payer),
      [payer],
      { addComputeBudget: false, timeoutMs: 1 },
    )

    expect(receipt).toMatchObject({
      status: 'submitted',
      stage: 'confirm',
      signature: 'pending-signature',
      failureReason: expect.stringContaining('Transaction confirmation timed out'),
    })
    expect(mockTrackError).toHaveBeenCalledWith('daemon-solana', expect.any(Error), expect.objectContaining({
      stage: 'confirm',
      status: 'submitted',
    }))
  })

  it('returns a signature for successful compatibility receipts', () => {
    expect(requireSuccessfulSignature({
      status: 'success',
      stage: 'record',
      signature: 'sig',
      transport: 'rpc',
      cluster: 'devnet',
      signerRoute: 'local-keypair',
      warnings: [],
    })).toBe('sig')
  })

  it('throws for failed compatibility receipts', () => {
    expect(() => requireSuccessfulSignature({
      status: 'failed',
      stage: 'submit',
      transport: 'rpc',
      cluster: 'devnet',
      signerRoute: 'local-keypair',
      warnings: [],
      failureReason: 'submit failed',
    })).toThrow(/submit failed/i)
  })
})

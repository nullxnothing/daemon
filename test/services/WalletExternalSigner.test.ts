import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Keypair, Transaction, SystemProgram, ComputeBudgetProgram, PublicKey } from '@solana/web3.js'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/daemon-test' },
  safeStorage: { encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
  dialog: {},
}))

// In-memory DB capturing transaction_history writes.
const historyRows = new Map<string, Record<string, unknown>>()
const walletRow = { address: '', wallet_type: 'user' }

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: () => {
        if (sql.includes('FROM wallets')) return walletRow
        if (sql.includes('SUM(amount)')) return { total: 0 }
        return undefined
      },
      run: (...args: unknown[]) => {
        if (sql.startsWith('INSERT INTO transaction_history')) {
          historyRows.set(args[0] as string, { id: args[0], status: args[6] })
        }
        if (sql.startsWith('UPDATE transaction_history SET signature')) {
          const row = historyRows.get(args[2] as string) ?? {}
          historyRows.set(args[2] as string, { ...row, signature: args[0], status: args[1] })
        }
      },
    }),
    transaction: (fn: () => void) => fn,
  }),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => null),
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
}))

const emitEventSafe = vi.fn()
vi.mock('../../electron/services/VoightService', () => ({
  emitEventSafe: (...args: unknown[]) => emitEventSafe(...args),
  trackError: vi.fn(),
}))

const approveTransactionHash = vi.fn()
const assertTransactionAllowed = vi.fn()
vi.mock('../../electron/services/SignerGuardService', () => ({
  approveTransactionHash: (...a: unknown[]) => approveTransactionHash(...a),
  assertTransactionAllowed: (...a: unknown[]) => assertTransactionAllowed(...a),
  hashTransactionMessage: () => 'message-hash',
  collectProgramIds: () => [],
}))

const BLOCKHASH = '11111111111111111111111111111111'

const mockConnection = {
  getBalance: vi.fn().mockResolvedValue(5 * 1e9),
  getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: BLOCKHASH, lastValidBlockHeight: 1000 }),
}

vi.mock('../../electron/services/SolanaService', () => ({
  getConnection: () => mockConnection,
  getConnectionStrict: () => mockConnection,
  getPriorityFeeMicroLamports: vi.fn().mockResolvedValue(1000),
  getTransactionSubmissionSettings: () => ({ mode: 'rpc' }),
  submitRawTransaction: vi.fn().mockResolvedValue('test-signature'),
  confirmSignature: vi.fn().mockResolvedValue(undefined),
  withKeypair: vi.fn(),
  executeTransaction: vi.fn(),
  getHeliusApiKey: vi.fn(),
  getJupiterApiKey: vi.fn(),
  getPriorityFeeLamports: vi.fn(),
}))

import {
  prepareExternalSolTransfer,
  submitExternalSignedTransaction,
} from '../../electron/services/WalletService'

const fromKeypair = Keypair.generate()
const toAddress = Keypair.generate().publicKey.toBase58()

// Re-sign the prepared message with the from-keypair so submit's byte-match and
// fee-payer checks pass, then serialize like an external wallet would.
function signPrepared(transactionBase64: string): string {
  const tx = Transaction.from(Buffer.from(transactionBase64, 'base64'))
  tx.sign(fromKeypair)
  return Buffer.from(tx.serialize()).toString('base64')
}

describe('external signer provider attribution', () => {
  beforeEach(() => {
    walletRow.address = fromKeypair.publicKey.toBase58()
    historyRows.clear()
    emitEventSafe.mockClear()
    approveTransactionHash.mockClear()
    assertTransactionAllowed.mockClear()
  })

  it('tags solflare as the partner signer with a perk', async () => {
    const draft = await prepareExternalSolTransfer('wallet-1', toAddress, 0.5)
    const signed = signPrepared(draft.transactionBase64)
    await submitExternalSignedTransaction({
      id: draft.id,
      publicKey: fromKeypair.publicKey.toBase58(),
      signedTransactionBase64: signed,
      signerProvider: 'solflare',
    })

    expect(assertTransactionAllowed).toHaveBeenCalled()
    const event = emitEventSafe.mock.calls[0][0]
    expect(event.metadata.signerProvider).toBe('solflare')
    expect(event.metadata.signer).toBe('solflare')
    expect(event.metadata.perk).toBe('solflare-partner')
  })

  it('defaults to solflare attribution when signerProvider is omitted (legacy path)', async () => {
    const draft = await prepareExternalSolTransfer('wallet-1', toAddress, 0.5)
    const signed = signPrepared(draft.transactionBase64)
    await submitExternalSignedTransaction({
      id: draft.id,
      publicKey: fromKeypair.publicKey.toBase58(),
      signedTransactionBase64: signed,
    })

    const event = emitEventSafe.mock.calls[0][0]
    expect(event.metadata.signerProvider).toBe('solflare')
    expect(event.metadata.perk).toBe('solflare-partner')
  })

  it('does not tag a partner perk for a non-partner provider', async () => {
    const draft = await prepareExternalSolTransfer('wallet-1', toAddress, 0.5)
    const signed = signPrepared(draft.transactionBase64)
    await submitExternalSignedTransaction({
      id: draft.id,
      publicKey: fromKeypair.publicKey.toBase58(),
      signedTransactionBase64: signed,
      signerProvider: 'phantom',
    })

    const event = emitEventSafe.mock.calls[0][0]
    expect(event.metadata.signerProvider).toBe('phantom')
    expect(event.metadata.perk).toBeUndefined()
  })
})

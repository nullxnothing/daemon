import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'

const clusterRef = vi.hoisted(() => ({ value: 'mainnet-beta' as 'devnet' | 'mainnet-beta' | 'localnet' }))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: () => ({ cluster: clusterRef.value, executionMode: 'rpc' }),
}))
vi.mock('../../electron/services/VoightService', () => ({
  emitEventSafe: vi.fn(),
  trackError: vi.fn(),
}))
vi.mock('../../electron/services/LogService', () => ({
  LogService: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import {
  assertTransactionAllowed,
  approveTransactionHash,
  hashTransactionMessage,
  resetSignerGuardState,
  setSignerGuardPolicy,
  isAllowedProgram,
} from '../../electron/services/SignerGuardService'

const payer = Keypair.generate()
const recipient = Keypair.generate().publicKey
const blockhash = '11111111111111111111111111111111'

function solTransferTx(lamports: number, from = payer.publicKey): Transaction {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: recipient, lamports }),
  )
  tx.feePayer = from
  tx.recentBlockhash = blockhash
  return tx
}

function unknownProgramTx(): Transaction {
  const tx = new Transaction().add(
    new TransactionInstruction({
      programId: new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'),
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
      data: Buffer.from([1, 2, 3]),
    }),
  )
  tx.feePayer = payer.publicKey
  tx.recentBlockhash = blockhash
  return tx
}

beforeEach(() => {
  resetSignerGuardState()
  clusterRef.value = 'mainnet-beta'
})

describe('program allow-list', () => {
  it('allows System program transfers', () => {
    expect(isAllowedProgram(SystemProgram.programId)).toBe(true)
    expect(() => assertTransactionAllowed(solTransferTx(1_000), [payer])).not.toThrow()
  })

  it('rejects a non-allowlisted program on mainnet without approval', () => {
    expect(() => assertTransactionAllowed(unknownProgramTx(), [payer])).toThrow(/non-allowlisted/i)
  })

  it('permits a non-allowlisted program when a matching approval hash is presented', () => {
    const tx = unknownProgramTx()
    const hash = hashTransactionMessage(tx)
    approveTransactionHash(hash)
    expect(() => assertTransactionAllowed(tx, [payer], { approvalHash: hash })).not.toThrow()
  })

  it('rejects when the approval hash does not match the transaction', () => {
    const tx = unknownProgramTx()
    approveTransactionHash('a'.repeat(64))
    expect(() => assertTransactionAllowed(tx, [payer], { approvalHash: 'a'.repeat(64) })).toThrow(/non-allowlisted/i)
  })

  it('consumes an approval so it cannot be replayed', () => {
    const tx = unknownProgramTx()
    const hash = hashTransactionMessage(tx)
    approveTransactionHash(hash)
    expect(() => assertTransactionAllowed(tx, [payer], { approvalHash: hash })).not.toThrow()
    // second use: approval already consumed
    expect(() => assertTransactionAllowed(tx, [payer], { approvalHash: hash })).toThrow(/non-allowlisted/i)
  })
})

describe('per-transaction SOL cap', () => {
  it('rejects a transfer above the per-tx cap on mainnet', () => {
    setSignerGuardPolicy({ perTxSolCap: 1 })
    expect(() => assertTransactionAllowed(solTransferTx(2 * 1e9), [payer])).toThrow(/per-transaction SOL cap/i)
  })

  it('allows an over-cap transfer with a matching approval', () => {
    setSignerGuardPolicy({ perTxSolCap: 1 })
    const tx = solTransferTx(2 * 1e9)
    const hash = hashTransactionMessage(tx)
    approveTransactionHash(hash)
    expect(() => assertTransactionAllowed(tx, [payer], { approvalHash: hash })).not.toThrow()
  })
})

describe('rate limit + rolling window', () => {
  it('rejects after exceeding the per-minute rate limit', () => {
    setSignerGuardPolicy({ rateLimitPerMin: 3, perTxSolCap: 1000, rollingSolCap: 1_000_000 })
    for (let i = 0; i < 3; i++) {
      expect(() => assertTransactionAllowed(solTransferTx(1_000), [payer])).not.toThrow()
    }
    expect(() => assertTransactionAllowed(solTransferTx(1_000), [payer])).toThrow(/rate limit/i)
  })

  it('rejects when the rolling-window SOL cap is exceeded', () => {
    setSignerGuardPolicy({ rollingSolCap: 5, perTxSolCap: 1000, rateLimitPerMin: 1000 })
    assertTransactionAllowed(solTransferTx(3 * 1e9), [payer])
    expect(() => assertTransactionAllowed(solTransferTx(3 * 1e9), [payer])).toThrow(/rolling-window SOL cap/i)
  })
})

describe('cluster enforcement gate', () => {
  it('does NOT throw on devnet (log-only) even for a violation', () => {
    clusterRef.value = 'devnet'
    expect(() => assertTransactionAllowed(unknownProgramTx(), [payer])).not.toThrow()
  })

  it('does NOT throw on localnet', () => {
    clusterRef.value = 'localnet'
    setSignerGuardPolicy({ perTxSolCap: 0 })
    expect(() => assertTransactionAllowed(solTransferTx(5 * 1e9), [payer])).not.toThrow()
  })
})

describe('approveTransactionHash validation', () => {
  it('rejects an invalid hash', () => {
    expect(() => approveTransactionHash('not-a-hash')).toThrow(/Invalid/i)
  })
})

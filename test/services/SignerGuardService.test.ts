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
  collectProgramIds,
  safeCollectProgramIds,
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

  it('permits a program scoped via allowProgramIds for that transaction only', () => {
    const tx = unknownProgramTx()
    expect(() =>
      assertTransactionAllowed(tx, [payer], { allowProgramIds: ['9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'] }),
    ).not.toThrow()
  })

  it('hash approval admits a reviewed assembled tx without widening program policy', () => {
    const tx = unknownProgramTx()
    const messageHash = hashTransactionMessage(tx)
    approveTransactionHash(messageHash)
    expect(() => assertTransactionAllowed(tx, [payer], { approvalHash: messageHash })).not.toThrow()
  })

  it('does not admit a different program than the one scoped', () => {
    const tx = unknownProgramTx()
    expect(() =>
      assertTransactionAllowed(tx, [payer], { allowProgramIds: ['So11111111111111111111111111111111111111112'] }),
    ).toThrow(/non-allowlisted/i)
  })

  it('scoped allowProgramIds does not bypass the per-transaction SOL cap', () => {
    setSignerGuardPolicy({ perTxSolCap: 1 })
    // A bare SOL transfer over the cap, even with an (irrelevant) scoped program allowance.
    expect(() =>
      assertTransactionAllowed(solTransferTx(5 * 1e9), [payer], {
        allowProgramIds: ['9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'],
      }),
    ).toThrow(/SOL cap/i)
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

describe('externally-signed transactions (signerOverride)', () => {
  it('vets an already-signed transfer (empty signers) using signerOverride for accounting', () => {
    // Simulate a Solflare-signed SOL transfer arriving via submitExternalSignedTransaction.
    setSignerGuardPolicy({ perTxSolCap: 1 })
    const tx = solTransferTx(2 * 1e9)
    expect(() =>
      assertTransactionAllowed(tx, [], { signerOverride: payer.publicKey.toBase58(), source: 'external' }),
    ).toThrow(/per-transaction SOL cap/i)
  })

  it('permits an over-cap external transfer when its hash is pre-approved', () => {
    setSignerGuardPolicy({ perTxSolCap: 1 })
    const tx = solTransferTx(2 * 1e9)
    const hash = hashTransactionMessage(tx)
    approveTransactionHash(hash)
    expect(() =>
      assertTransactionAllowed(tx, [], { signerOverride: payer.publicKey.toBase58(), approvalHash: hash, source: 'external' }),
    ).not.toThrow()
  })
})

describe('uninspectable transactions', () => {
  it('rejects a transaction it cannot inspect when enforcing', () => {
    const broken = {} as unknown as Parameters<typeof assertTransactionAllowed>[0]
    expect(() => assertTransactionAllowed(broken, [payer])).toThrow(/could not be inspected/i)
  })

  it('does not throw on an uninspectable transaction on devnet (log-only)', () => {
    clusterRef.value = 'devnet'
    const broken = {} as unknown as Parameters<typeof assertTransactionAllowed>[0]
    expect(() => assertTransactionAllowed(broken, [payer])).not.toThrow()
  })

  it('returns a safe inspection failure instead of throwing TypeError for malformed versioned messages', () => {
    const broken = { message: {} }

    expect(safeCollectProgramIds(broken)).toEqual({
      ok: false,
      reason: expect.stringMatching(/static account keys are missing/i),
    })
    expect(() => collectProgramIds(broken as Parameters<typeof collectProgramIds>[0])).toThrow(/signer guard/i)
    expect(() => assertTransactionAllowed(broken as Parameters<typeof assertTransactionAllowed>[0], [payer]))
      .toThrow(/static account keys are missing/i)
  })

  it('rejects versioned transactions with unresolved lookup table program accounts', () => {
    const unresolved = {
      message: {
        staticAccountKeys: [],
        compiledInstructions: [{ programIdIndex: 2, data: new Uint8Array() }],
        addressTableLookups: [{ accountKey: recipient }],
        serialize: () => Buffer.from('unresolved-message'),
      },
    }

    expect(safeCollectProgramIds(unresolved)).toEqual({
      ok: false,
      reason: expect.stringMatching(/unresolved address lookup table/i),
    })
    expect(() => assertTransactionAllowed(unresolved as Parameters<typeof assertTransactionAllowed>[0], [payer]))
      .toThrow(/unresolved address lookup table/i)
  })
})

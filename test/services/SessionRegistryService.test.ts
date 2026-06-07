import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { executeInstructionsMock } = vi.hoisted(() => ({
  executeInstructionsMock: vi.fn(async () => ({ signature: 'mock-signature', transport: 'rpc' })),
}))

vi.mock('../../electron/services/SolanaExecutionService', () => ({
  executeInstructions: executeInstructionsMock,
}))

import { Keypair, PublicKey } from '@solana/web3.js'
import { publishExpireTask, publishStartSession } from '../../electron/services/SessionRegistryService'

function buildDiscriminator(name: string): Buffer {
  return crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8)
}

describe('SessionRegistryService', () => {
  beforeEach(() => {
    executeInstructionsMock.mockClear()
  })

  it('rejects session publications with agent counts above the on-chain model capacity', async () => {
    await expect(
      publishStartSession({
        walletKeypair: Keypair.generate(),
        sessionId: 1n,
        projectName: 'daemon',
        agentCount: 5,
        modelsUsed: [1, 2, 3, 4],
      }),
    ).rejects.toThrow(/Agent count must be between 1 and 4/)
  })

  it('rejects zero-agent session publications', async () => {
    await expect(
      publishStartSession({
        walletKeypair: Keypair.generate(),
        sessionId: 1n,
        projectName: 'daemon',
        agentCount: 0,
        modelsUsed: [],
      }),
    ).rejects.toThrow(/Agent count must be between 1 and 4/)
  })

  it('builds expire_task with owner refund account and authority signer', async () => {
    const authorityKeypair = Keypair.generate()
    const owner = Keypair.generate().publicKey

    await expect(
      publishExpireTask({
        authorityKeypair,
        owner,
        taskId: 42n,
      }),
    ).resolves.toBe('mock-signature')

    expect(executeInstructionsMock).toHaveBeenCalledTimes(1)
    const [, instructions, signers, options] = executeInstructionsMock.mock.calls[0]
    expect(signers).toEqual([authorityKeypair])

    const ix = instructions[0]
    expect(ix.programId.toBase58()).toBe('3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc')
    expect(Buffer.from(ix.data)).toEqual(buildDiscriminator('expire_task'))
    expect(options).toEqual(expect.objectContaining({
      payer: authorityKeypair.publicKey,
      guardSource: 'session-registry:expire-task',
      guardAllowProgramIds: ['3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc'],
    }))

    const taskSeed = Buffer.alloc(8)
    taskSeed.writeBigUInt64LE(42n)
    const [taskPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('task'), owner.toBuffer(), taskSeed],
      ix.programId,
    )

    expect(ix.keys).toEqual([
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: false },
    ])
  })
})

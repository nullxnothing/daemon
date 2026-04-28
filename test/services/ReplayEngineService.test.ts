import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PublicKey } from '@solana/web3.js'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/daemon-test' },
  safeStorage: { encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: () => ({ run: vi.fn(), get: vi.fn(), all: vi.fn() }),
    transaction: (fn: () => void) => fn,
  }),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => null),
}))

vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: () => ({
    rpcProvider: 'public',
    quicknodeRpcUrl: '',
    customRpcUrl: '',
    executionMode: 'rpc',
    jitoBlockEngineUrl: '',
  }),
}))

const mockGetParsedTransaction = vi.fn()
const mockGetSignaturesForAddress = vi.fn()

vi.mock('../../electron/services/SolanaService', () => ({
  getConnection: () => ({
    getParsedTransaction: mockGetParsedTransaction,
    getSignaturesForAddress: mockGetSignaturesForAddress,
  }),
  getRpcEndpoint: () => 'https://api.mainnet-beta.solana.com',
}))

import {
  fetchTransactionTrace,
  fetchProgramRecentTraces,
  buildClaudeContext,
  createAgentHandoff,
  __resetCacheForTests,
} from '../../electron/services/ReplayEngineService'

const VALID_SIG = '5j7s4VfixcfTFCMWjcHFsKE7v1TdXh9hBA8WL8GAm6P3WvN3rXYQT34oRZdRdYvE7sqFqW3nCjzYBGHxz4kKsr3z'
const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111')

function makeParsedTx(overrides: Partial<{
  err: unknown
  logs: string[]
  fee: number
  cu: number
  innerInstructions: unknown[]
}> = {}) {
  const accountKey = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
  const recipient = new PublicKey('CZsq4FX6yaRvNgWAqRvWoTKjAQ9aRZJzWyWQDEzMxvxL')
  return {
    slot: 250_000_000,
    blockTime: 1_733_000_000,
    transaction: {
      message: {
        accountKeys: [
          { pubkey: accountKey, signer: true, writable: true, source: 'transaction' },
          { pubkey: recipient, signer: false, writable: true, source: 'transaction' },
          { pubkey: SYSTEM_PROGRAM, signer: false, writable: false, source: 'transaction' },
        ],
        instructions: [
          {
            programId: SYSTEM_PROGRAM,
            program: 'system',
            parsed: {
              type: 'transfer',
              info: { source: accountKey.toBase58(), destination: recipient.toBase58(), lamports: 1_000_000_000 },
            },
          },
        ],
      },
    },
    meta: {
      err: overrides.err ?? null,
      fee: overrides.fee ?? 5000,
      computeUnitsConsumed: overrides.cu ?? 1500,
      preBalances: [10_000_000_000, 0, 1],
      postBalances: [8_999_995_000, 1_000_000_000, 1],
      preTokenBalances: [],
      postTokenBalances: [],
      logMessages: overrides.logs ?? [
        'Program 11111111111111111111111111111111 invoke [1]',
        'Program 11111111111111111111111111111111 success',
      ],
      innerInstructions: overrides.innerInstructions ?? [],
    },
  }
}

describe('ReplayEngineService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetCacheForTests()
  })

  describe('fetchTransactionTrace', () => {
    it('rejects malformed signatures', async () => {
      await expect(fetchTransactionTrace('not-a-real-sig')).rejects.toThrow(/Invalid Solana transaction signature/)
    })

    it('throws when RPC returns null', async () => {
      mockGetParsedTransaction.mockResolvedValueOnce(null)
      await expect(fetchTransactionTrace(VALID_SIG)).rejects.toThrow(/not found/)
    })

    it('parses a successful SOL transfer trace', async () => {
      mockGetParsedTransaction.mockResolvedValueOnce(makeParsedTx())
      const trace = await fetchTransactionTrace(VALID_SIG)

      expect(trace.signature).toBe(VALID_SIG)
      expect(trace.success).toBe(true)
      expect(trace.fee).toBe(5000)
      expect(trace.computeUnitsConsumed).toBe(1500)
      expect(trace.programIds).toContain('11111111111111111111111111111111')
      expect(trace.instructions).toHaveLength(1)
      expect(trace.instructions[0].programLabel).toBe('System Program')
      expect(trace.instructions[0].parsed?.type).toBe('transfer')
      expect(trace.anchorError).toBeNull()
    })

    it('builds writable account diffs for SOL transfers', async () => {
      mockGetParsedTransaction.mockResolvedValueOnce(makeParsedTx())
      const trace = await fetchTransactionTrace(VALID_SIG)
      const writable = trace.accountDiffs.filter((d) => d.isWritable)
      expect(writable).toHaveLength(2)
      const sender = writable.find((d) => d.lamportsDelta < 0)
      const recipient = writable.find((d) => d.lamportsDelta > 0)
      expect(sender?.lamportsDelta).toBe(-1_000_005_000)
      expect(recipient?.lamportsDelta).toBe(1_000_000_000)
    })

    it('decodes Anchor errors from logs', async () => {
      const tx = makeParsedTx({
        err: { InstructionError: [0, { Custom: 6000 }] },
        logs: [
          'Program 5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h invoke [1]',
          'Program log: AnchorError caused by account: vault. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: A seeds constraint was violated.',
          'Program 5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h failed: custom program error: 0x1770',
        ],
      })
      mockGetParsedTransaction.mockResolvedValueOnce(tx)

      const trace = await fetchTransactionTrace(VALID_SIG)
      expect(trace.success).toBe(false)
      expect(trace.anchorError).not.toBeNull()
      expect(trace.anchorError!.errorCode).toBe('ConstraintSeeds')
      expect(trace.anchorError!.errorNumber).toBe(2006)
      expect(trace.anchorError!.errorMessage).toBe('A seeds constraint was violated')
      expect(trace.anchorError!.account).toBe('vault')
      expect(trace.anchorError!.programId).toBe('5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h')
      expect(trace.instructions[0].error).toBeTruthy()
    })

    it('caches results within TTL', async () => {
      mockGetParsedTransaction.mockResolvedValueOnce(makeParsedTx())
      await fetchTransactionTrace(VALID_SIG)
      await fetchTransactionTrace(VALID_SIG)
      expect(mockGetParsedTransaction).toHaveBeenCalledTimes(1)
    })

    it('bypasses cache with force flag', async () => {
      mockGetParsedTransaction.mockResolvedValue(makeParsedTx())
      await fetchTransactionTrace(VALID_SIG)
      await fetchTransactionTrace(VALID_SIG, { force: true })
      expect(mockGetParsedTransaction).toHaveBeenCalledTimes(2)
    })
  })

  describe('fetchProgramRecentTraces', () => {
    it('rejects invalid program IDs', async () => {
      await expect(fetchProgramRecentTraces('garbage')).rejects.toThrow(/Invalid program ID/)
    })

    it('clamps the limit and returns recent signatures', async () => {
      mockGetSignaturesForAddress.mockResolvedValueOnce([
        { signature: 'a'.repeat(64), slot: 1, blockTime: 100, err: null },
        { signature: 'b'.repeat(64), slot: 2, blockTime: 200, err: { Custom: 6000 } },
      ])
      const result = await fetchProgramRecentTraces('11111111111111111111111111111111', 999)
      expect(mockGetSignaturesForAddress).toHaveBeenCalledTimes(1)
      const args = mockGetSignaturesForAddress.mock.calls[0]
      expect(args[1]).toEqual({ limit: 25 })
      expect(result.programId).toBe('11111111111111111111111111111111')
      expect(result.recent).toHaveLength(2)
      expect(result.recent[0].success).toBe(true)
      expect(result.recent[1].success).toBe(false)
      expect(result.recent[1].error).toBe('{"Custom":6000}')
    })
  })

  describe('buildClaudeContext', () => {
    it('renders a markdown handoff for a successful transaction', async () => {
      mockGetParsedTransaction.mockResolvedValueOnce(makeParsedTx())
      const trace = await fetchTransactionTrace(VALID_SIG)
      const handoff = buildClaudeContext(trace)
      expect(handoff.signature).toBe(VALID_SIG)
      expect(handoff.contextMarkdown).toContain('# DAEMON Replay Context')
      expect(handoff.contextMarkdown).toContain('Success: yes')
      expect(handoff.contextMarkdown).toContain('Instruction trace')
      expect(handoff.contextMarkdown).toContain('System Program')
      expect(handoff.contextMarkdown).toContain('Account diffs (writable)')
      expect(handoff.promptHeadline).toMatch(/Replay audit/)
    })

    it('renders a debug handoff for a failed Anchor transaction', async () => {
      const tx = makeParsedTx({
        err: { InstructionError: [0, 'Custom'] },
        logs: [
          'Program log: AnchorError caused by account: vault. Error Code: ConstraintSeeds. Error Number: 2006. Error Message: Bad seeds.',
        ],
      })
      mockGetParsedTransaction.mockResolvedValueOnce(tx)
      const trace = await fetchTransactionTrace(VALID_SIG)
      const handoff = buildClaudeContext(trace)
      expect(handoff.contextMarkdown).toContain('Success: NO')
      expect(handoff.contextMarkdown).toContain('Anchor Error')
      expect(handoff.contextMarkdown).toContain('ConstraintSeeds')
      expect(handoff.promptHeadline).toContain('ConstraintSeeds')
    })

    it('writes a project-scoped agent handoff file and launch command', async () => {
      mockGetParsedTransaction.mockResolvedValueOnce(makeParsedTx())
      const trace = await fetchTransactionTrace(VALID_SIG)
      const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-replay-'))
      const handoff = createAgentHandoff(projectPath, trace)

      expect(handoff.contextPath).toContain(path.join('.daemon', 'replays'))
      expect(fs.existsSync(handoff.contextPath)).toBe(true)
      expect(fs.readFileSync(handoff.contextPath, 'utf8')).toContain(VALID_SIG)
      expect(handoff.promptText).toContain(handoff.contextPath)
      expect(handoff.startupCommand).toContain('claude --dangerously-skip-permissions -p')
    })
  })
})

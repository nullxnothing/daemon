import { createHash } from 'node:crypto'
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type Keypair,
} from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getWalletInfrastructureSettings } from './SettingsService'
import { LogService } from './LogService'
import * as Voight from './VoightService'

/**
 * Signer guard.
 *
 * This is the LAST, non-bypassable line before a transaction is signed inside
 * `SolanaService.executeTransaction`. Every caller — wallet IPC, launch
 * adapters, agent-work settlement, AND any agent/MCP/PTY that manages to reach a
 * signing helper — passes through here. Enforcement lives in the main (signer)
 * process where agent-controlled content cannot edit it.
 *
 * Policy (mainnet-beta, enforced; devnet/localnet, log-only):
 *  - Program allow-list: instructions touching non-allowlisted programs require
 *    an explicit, hash-bound approval token (propose/commit) — reject otherwise.
 *  - Per-transaction outbound SOL cap.
 *  - Rolling-window outbound SOL cap (per signer).
 *  - Rate limit (signed transactions per minute, per signer).
 */

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const REGISTRY_PROGRAM_ID = '3nu6sppjDtAKNoBbUAhvFJ35B2JsxpRY6G4Cg72MCJRc'
const JUPITER_V6_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
const PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'

/** Programs DAEMON's own flows legitimately invoke without per-tx approval. */
const DEFAULT_ALLOWED_PROGRAM_IDS = new Set<string>([
  SystemProgram.programId.toBase58(),
  ComputeBudgetProgram.programId.toBase58(),
  TOKEN_PROGRAM_ID.toBase58(),
  TOKEN_2022_PROGRAM_ID.toBase58(),
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
  MEMO_PROGRAM_ID,
  REGISTRY_PROGRAM_ID,
  JUPITER_V6_PROGRAM_ID,
  PUMP_FUN_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
])

const LAMPORTS_PER_SOL = 1_000_000_000
const DEFAULT_PER_TX_SOL_CAP = 10
const DEFAULT_ROLLING_WINDOW_MS = 60 * 60_000
const DEFAULT_ROLLING_SOL_CAP = 25
const DEFAULT_RATE_LIMIT_PER_MIN = 12
const APPROVAL_TTL_MS = 2 * 60_000

export interface SignerGuardPolicy {
  allowedProgramIds: Set<string>
  perTxSolCap: number
  rollingWindowMs: number
  rollingSolCap: number
  rateLimitPerMin: number
  /** When false (devnet/localnet) violations are logged but not thrown. */
  enforce: boolean
}

let policyOverride: Partial<SignerGuardPolicy> | null = null

/** Test/admin hook to tweak the policy. Returns previous override for restore. */
export function setSignerGuardPolicy(next: Partial<SignerGuardPolicy> | null): Partial<SignerGuardPolicy> | null {
  const prev = policyOverride
  policyOverride = next
  return prev
}

function currentPolicy(): SignerGuardPolicy {
  let enforce = false
  try {
    enforce = getWalletInfrastructureSettings().cluster === 'mainnet-beta'
  } catch {
    enforce = false
  }
  const base: SignerGuardPolicy = {
    allowedProgramIds: DEFAULT_ALLOWED_PROGRAM_IDS,
    perTxSolCap: DEFAULT_PER_TX_SOL_CAP,
    rollingWindowMs: DEFAULT_ROLLING_WINDOW_MS,
    rollingSolCap: DEFAULT_ROLLING_SOL_CAP,
    rateLimitPerMin: DEFAULT_RATE_LIMIT_PER_MIN,
    enforce,
  }
  return { ...base, ...policyOverride }
}

// ----------------------------------------------------------- approval store ---

interface ApprovalRecord {
  hash: string
  expiresAt: number
  reason: string
}

const approvals = new Map<string, ApprovalRecord>()

function pruneApprovals(now = Date.now()): void {
  for (const [hash, record] of approvals) {
    if (record.expiresAt <= now) approvals.delete(hash)
  }
}

/** Hash a transaction's message bytes — the exact bytes that will be signed. */
export function hashTransactionMessage(transaction: Transaction | VersionedTransaction): string {
  const bytes = transaction instanceof Transaction
    ? transaction.serializeMessage()
    : Buffer.from(transaction.message.serialize())
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Record a human approval bound to the EXACT serialized message. The token is
 * the message hash; signing consumes it once. This prevents an agent from
 * swapping the payload between approval and signing.
 */
export function approveTransactionHash(hash: string, reason = 'user-approved'): void {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('Invalid transaction message hash')
  pruneApprovals()
  approvals.set(hash, { hash, expiresAt: Date.now() + APPROVAL_TTL_MS, reason })
}

function consumeApproval(hash: string): boolean {
  pruneApprovals()
  const record = approvals.get(hash)
  if (!record) return false
  approvals.delete(hash)
  return true
}

// ------------------------------------------------------------- spend window ---

interface SpendEntry {
  at: number
  lamports: number
}

const spendWindow = new Map<string, SpendEntry[]>()

export function resetSignerGuardState(): void {
  spendWindow.clear()
  approvals.clear()
  policyOverride = null
}

/** Canonical per-signer spend log, pruned to the longest window we care about. */
function getSpendLog(signer: string, now: number, maxWindowMs: number): SpendEntry[] {
  const entries = (spendWindow.get(signer) ?? []).filter((entry) => now - entry.at < maxWindowMs)
  spendWindow.set(signer, entries)
  return entries
}

// --------------------------------------------------------------- inspection ---

interface TxInspection {
  programIds: string[]
  outboundLamports: number
}

export type ProgramInspectionResult =
  | { ok: true; programIds: string[] }
  | { ok: false; reason: string }

type InspectableCompiledInstruction = {
  programIdIndex: number
  data?: Uint8Array | number[] | Buffer
}

type InspectableVersionedMessage = {
  staticAccountKeys?: PublicKey[]
  compiledInstructions?: InspectableCompiledInstruction[]
  addressTableLookups?: unknown[]
}

function assertInspectableVersionedMessage(message: unknown): asserts message is InspectableVersionedMessage {
  if (!message || typeof message !== 'object') {
    throw new Error('versioned transaction message is missing')
  }
  const candidate = message as InspectableVersionedMessage
  if (!Array.isArray(candidate.staticAccountKeys)) {
    throw new Error('versioned transaction static account keys are missing')
  }
  if (!Array.isArray(candidate.compiledInstructions)) {
    throw new Error('versioned transaction compiled instructions are missing')
  }
}

function collectInstructions(transaction: Transaction | VersionedTransaction): { programIds: string[]; transfers: number } {
  let outboundLamports = 0
  const programIds: string[] = []

  if (transaction instanceof Transaction) {
    for (const ix of transaction.instructions) {
      programIds.push(ix.programId.toBase58())
      if (ix.programId.equals(SystemProgram.programId)) {
        outboundLamports += decodeSystemTransferLamports(ix.data)
      }
    }
  } else if ('message' in Object(transaction)) {
    const message = transaction.message
    assertInspectableVersionedMessage(message)
    const keys = message.staticAccountKeys
    for (const ci of message.compiledInstructions) {
      if (typeof ci.programIdIndex !== 'number') {
        throw new Error('versioned transaction contains a malformed instruction program index')
      }
      const programId = keys[ci.programIdIndex]
      if (!programId) {
        if ((message.addressTableLookups?.length ?? 0) > 0) {
          throw new Error('versioned transaction uses unresolved address lookup table account keys')
        }
        throw new Error('versioned transaction instruction references an unknown program account')
      }
      programIds.push(programId.toBase58())
      if (programId.equals(SystemProgram.programId)) {
        outboundLamports += decodeSystemTransferLamports(Buffer.from(ci.data ?? []))
      }
    }
  } else {
    throw new Error('transaction type is not inspectable')
  }

  return { programIds, transfers: outboundLamports }
}

/**
 * System program transfer (instruction tag 2) carries a u64 little-endian
 * lamports field at offset 4. Other System instructions (createAccount, etc.)
 * are ignored for the outbound-SOL tally — they are covered by the program
 * allow-list rather than the spend cap.
 */
function decodeSystemTransferLamports(data: Buffer | Uint8Array): number {
  const buf = Buffer.from(data)
  if (buf.length < 12) return 0
  const tag = buf.readUInt32LE(0)
  if (tag !== 2) return 0
  try {
    const lamports = buf.readBigUInt64LE(4)
    return lamports > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(lamports)
  } catch {
    return 0
  }
}

function inspect(transaction: Transaction | VersionedTransaction): TxInspection {
  const { programIds, transfers } = collectInstructions(transaction)
  return { programIds: [...new Set(programIds)], outboundLamports: transfers }
}

/**
 * Deduped program IDs a transaction invokes, using the SAME extraction the guard
 * enforces with. Lets a caller that received a transaction from a trusted assembler
 * (e.g. a Jupiter swap order) scope a per-tx `allowProgramIds` to exactly the programs
 * that transaction contains — without widening the global allow-list. The SOL caps and
 * rate limit in `assertTransactionAllowed` still apply.
 */
export function collectProgramIds(transaction: Transaction | VersionedTransaction): string[] {
  const result = safeCollectProgramIds(transaction)
  if (!result.ok) throw new Error(`Signer guard: ${result.reason}`)
  return result.programIds
}

export function safeCollectProgramIds(transaction: unknown): ProgramInspectionResult {
  try {
    return { ok: true, programIds: inspect(transaction as Transaction | VersionedTransaction).programIds }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `transaction could not be inspected: ${reason}` }
  }
}

// ----------------------------------------------------------------- enforce ---

export interface SignerGuardOptions {
  /** Pre-approved message hash (propose/commit) for non-allowlisted programs / large transfers. */
  approvalHash?: string
  /** Caller label for audit. */
  source?: string
  /** Signer pubkey when the transaction is already externally signed (signers array is empty). */
  signerOverride?: string
  /**
   * Programs this specific, code-authored flow legitimately invokes — admitted for
   * THIS transaction only, without widening the global default allow-list. Use for
   * vetted protocol programs a feature must touch (e.g. the PumpFees program in the
   * Flywheel configure/claim flows). Does not bypass the SOL caps or rate limits.
   */
  allowProgramIds?: string[]
}

function fail(policy: SignerGuardPolicy, signer: string, reason: string, detail: Record<string, unknown>): void {
  LogService.warn('SignerGuard', reason, { signer, enforce: policy.enforce, ...detail })
  Voight.emitEventSafe({
    agentId: 'daemon-signer-guard',
    type: 'decision',
    outcome: policy.enforce ? 'failed' : 'pending',
    metadata: {
      sessionId: `signer-guard:${signer}`,
      policyDecision: policy.enforce ? 'rejected' : 'flagged',
      detail: reason,
      ...detail,
    },
  })
  if (policy.enforce) throw new Error(`Signer guard: ${reason}`)
}

/**
 * Assert a transaction is allowed to be signed. Throws on mainnet when policy is
 * violated and no valid approval token is presented. Must be called immediately
 * before signing, after the final message has been assembled.
 */
export function assertTransactionAllowed(
  transaction: Transaction | VersionedTransaction,
  signers: Keypair[],
  options: SignerGuardOptions = {},
): void {
  const policy = currentPolicy()
  const signer = signers[0]?.publicKey?.toBase58() ?? options.signerOverride ?? 'unknown'
  const now = Date.now()

  let programIds: string[]
  let outboundLamports: number
  let messageHash: string
  try {
    ;({ programIds, outboundLamports } = inspect(transaction))
    messageHash = hashTransactionMessage(transaction)
  } catch (err) {
    // A transaction we cannot inspect cannot be vetted. Reject when enforcing,
    // otherwise log and allow (devnet/test).
    const error = err instanceof Error ? err.message : String(err)
    fail(policy, signer, `transaction could not be inspected for the signer guard: ${error}`, {
      error,
      source: options.source,
    })
    return
  }

  const outboundSol = outboundLamports / LAMPORTS_PER_SOL
  const hasApproval = options.approvalHash === messageHash && consumeApproval(messageHash)

  // 1) Program allow-list — non-allowlisted programs require a hash-bound approval,
  //    unless the calling flow scoped an explicit per-transaction allowance for them.
  const callScopedAllow = new Set(options.allowProgramIds ?? [])
  const unknownPrograms = programIds.filter(
    (id) => !policy.allowedProgramIds.has(id) && !callScopedAllow.has(id),
  )
  if (unknownPrograms.length > 0 && !hasApproval) {
    fail(policy, signer, 'transaction touches non-allowlisted program(s) without approval', {
      unknownPrograms,
      messageHash,
      source: options.source,
    })
  }

  // 2) Per-transaction outbound SOL cap — large transfers require approval.
  if (outboundSol > policy.perTxSolCap && !hasApproval) {
    fail(policy, signer, `per-transaction SOL cap exceeded (${outboundSol} > ${policy.perTxSolCap})`, {
      outboundSol,
      messageHash,
      source: options.source,
    })
  }

  const maxWindowMs = Math.max(policy.rollingWindowMs, 60_000)
  const log = getSpendLog(signer, now, maxWindowMs)

  // 3) Rate limit (per signer, per minute).
  const minuteCount = log.filter((entry) => now - entry.at < 60_000).length
  if (minuteCount >= policy.rateLimitPerMin) {
    fail(policy, signer, `signing rate limit exceeded (${policy.rateLimitPerMin}/min)`, {
      recent: minuteCount,
      source: options.source,
    })
  }

  // 4) Rolling-window outbound SOL cap (per signer).
  const rollingLamports = log
    .filter((entry) => now - entry.at < policy.rollingWindowMs)
    .reduce((sum, entry) => sum + entry.lamports, 0)
  const projectedSol = (rollingLamports + outboundLamports) / LAMPORTS_PER_SOL
  if (projectedSol > policy.rollingSolCap && !hasApproval) {
    fail(policy, signer, `rolling-window SOL cap exceeded (${projectedSol} > ${policy.rollingSolCap})`, {
      projectedSol,
      windowMs: policy.rollingWindowMs,
      source: options.source,
    })
  }

  // Passed (or log-only): record the spend for window accounting.
  log.push({ at: now, lamports: outboundLamports })
  spendWindow.set(signer, log)
}

export function isAllowedProgram(programId: string | PublicKey): boolean {
  const id = typeof programId === 'string' ? programId : programId.toBase58()
  return currentPolicy().allowedProgramIds.has(id)
}

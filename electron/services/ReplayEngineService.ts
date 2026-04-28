import fs from 'node:fs'
import path from 'node:path'
import { Connection, type ParsedTransactionWithMeta, type ParsedInstruction, type PartiallyDecodedInstruction, PublicKey, type ConfirmedSignatureInfo } from '@solana/web3.js'
import { getConnection, getRpcEndpoint } from './SolanaService'
import { isPathWithinBase } from '../shared/pathValidation'
import type {
  ReplayTrace,
  ReplayInstruction,
  ReplayAccountDiff,
  ReplayAccountRef,
  ReplayAnchorError,
  ReplayProgramSummary,
  ReplayContextHandoff,
  ReplayAgentHandoff,
} from '../shared/types'

const TRACE_TTL_MS = 5 * 60 * 1000
const TRACE_CACHE_MAX = 64
const traceCache = new Map<string, { value: ReplayTrace; expiresAt: number }>()

const PROGRAM_LABELS: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'SPL Token',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token',
  ComputeBudget111111111111111111111111111111: 'Compute Budget',
  BPFLoaderUpgradeab1e11111111111111111111111: 'BPF Loader',
  Sysvar1nstructions1111111111111111111111111: 'Instructions Sysvar',
  Stake11111111111111111111111111111111111111: 'Stake Program',
  Vote111111111111111111111111111111111111111: 'Vote Program',
  Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo: 'Memo',
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: 'Memo v2',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter Aggregator',
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca Whirlpool',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM v4',
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: 'Raydium CLMM',
  PROXyrx2D4u4yA85uKwGGVqaLNS2BZRq2gXawkWaThE: 'Pump.fun',
}

const ANCHOR_ERROR_REGEX = /AnchorError\s+(?:caused by account:\s+(?<account>[^.]+)\.\s+)?Error Code:\s+(?<code>\w+)\.\s+Error Number:\s+(?<number>-?\d+)\.\s+Error Message:\s+(?<message>.+?)\./

function pruneCache(): void {
  const now = Date.now()
  for (const [key, entry] of traceCache.entries()) {
    if (entry.expiresAt <= now) traceCache.delete(key)
  }
  while (traceCache.size > TRACE_CACHE_MAX) {
    const oldest = traceCache.keys().next().value
    if (!oldest) break
    traceCache.delete(oldest)
  }
}

function programLabel(programId: string): string | null {
  return PROGRAM_LABELS[programId] ?? null
}

function isParsed(instr: ParsedInstruction | PartiallyDecodedInstruction): instr is ParsedInstruction {
  return 'parsed' in instr
}

function normalizeInstruction(
  instr: ParsedInstruction | PartiallyDecodedInstruction,
  index: number,
  errorByIndex: Map<number, string>,
): ReplayInstruction {
  if (isParsed(instr)) {
    const programId = instr.programId.toBase58()
    const parsed = instr.parsed as { type?: string; info?: Record<string, unknown> } | string | null
    let parsedShape: { type: string | null; info: Record<string, unknown> | null } | null = null
    if (parsed && typeof parsed === 'object') {
      parsedShape = {
        type: parsed.type ?? null,
        info: parsed.info ?? null,
      }
    } else if (typeof parsed === 'string') {
      parsedShape = { type: parsed, info: null }
    }
    return {
      index,
      programId,
      programLabel: programLabel(programId) ?? instr.program ?? null,
      accounts: [],
      rawData: '',
      parsed: parsedShape,
      innerInstructions: [],
      error: errorByIndex.get(index) ?? null,
    }
  }

  const programId = instr.programId.toBase58()
  const accounts: ReplayAccountRef[] = instr.accounts.map((account) => ({
    pubkey: account.toBase58(),
    isSigner: false,
    isWritable: false,
  }))
  return {
    index,
    programId,
    programLabel: programLabel(programId),
    accounts,
    rawData: instr.data,
    parsed: null,
    innerInstructions: [],
    error: errorByIndex.get(index) ?? null,
  }
}

function buildAccountDiffs(tx: ParsedTransactionWithMeta): ReplayAccountDiff[] {
  const meta = tx.meta
  if (!meta) return []
  const accountKeys = tx.transaction.message.accountKeys
  const writable = new Set<string>()
  for (const key of accountKeys) {
    if (key.writable) writable.add(key.pubkey.toBase58())
  }

  const tokenIndex = new Map<number, { mint: string; owner: string; amount: string }[]>()
  for (const balance of meta.preTokenBalances ?? []) {
    if (!tokenIndex.has(balance.accountIndex)) tokenIndex.set(balance.accountIndex, [])
    tokenIndex.get(balance.accountIndex)!.push({
      mint: balance.mint,
      owner: balance.owner ?? '',
      amount: `pre:${balance.uiTokenAmount.uiAmountString ?? '0'}`,
    })
  }
  for (const balance of meta.postTokenBalances ?? []) {
    if (!tokenIndex.has(balance.accountIndex)) tokenIndex.set(balance.accountIndex, [])
    tokenIndex.get(balance.accountIndex)!.push({
      mint: balance.mint,
      owner: balance.owner ?? '',
      amount: `post:${balance.uiTokenAmount.uiAmountString ?? '0'}`,
    })
  }

  return accountKeys.map((entry, idx) => {
    const pubkey = entry.pubkey.toBase58()
    const preLamports = meta.preBalances[idx] ?? 0
    const postLamports = meta.postBalances[idx] ?? 0
    const tokens = tokenIndex.get(idx) ?? []
    const mint = tokens.find((t) => t.mint)?.mint ?? null
    const preTok = tokens.find((t) => t.amount.startsWith('pre:'))?.amount.slice(4) ?? null
    const postTok = tokens.find((t) => t.amount.startsWith('post:'))?.amount.slice(5) ?? null
    return {
      pubkey,
      owner: entry.source ?? null,
      preLamports,
      postLamports,
      lamportsDelta: postLamports - preLamports,
      preTokenAmount: preTok,
      postTokenAmount: postTok,
      tokenMint: mint,
      isWritable: writable.has(pubkey),
    }
  })
}

function decodeAnchorError(logs: string[]): ReplayAnchorError | null {
  let activeProgramId: string | null = null
  for (const log of logs) {
    const programMatch = /Program\s+(\w{32,44})\s+/.exec(log)
    if (programMatch?.[1]) activeProgramId = programMatch[1]

    const match = ANCHOR_ERROR_REGEX.exec(log)
    if (!match || !match.groups) continue
    return {
      errorCode: match.groups.code ?? null,
      errorNumber: match.groups.number ? Number.parseInt(match.groups.number, 10) : null,
      errorMessage: match.groups.message?.trim() ?? null,
      account: match.groups.account?.trim() ?? null,
      programId: activeProgramId,
      raw: log,
    }
  }
  return null
}

function buildErrorByIndex(meta: ParsedTransactionWithMeta['meta']): Map<number, string> {
  const map = new Map<number, string>()
  if (!meta?.err || typeof meta.err !== 'object') return map
  const err = meta.err as Record<string, unknown>
  const inner = err.InstructionError
  if (Array.isArray(inner) && inner.length >= 2) {
    const idx = Number(inner[0])
    if (Number.isInteger(idx)) {
      const detail = inner[1]
      map.set(idx, typeof detail === 'string' ? detail : JSON.stringify(detail))
    }
  }
  return map
}

function isValidSignature(value: string): boolean {
  if (!value) return false
  if (value.length < 64 || value.length > 96) return false
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
}

function isValidPubkey(value: string): boolean {
  try {
    new PublicKey(value)
    return true
  } catch {
    return false
  }
}

export async function fetchTransactionTrace(
  signature: string,
  options?: { connection?: Connection; force?: boolean },
): Promise<ReplayTrace> {
  if (!isValidSignature(signature)) {
    throw new Error('Invalid Solana transaction signature')
  }

  pruneCache()
  if (!options?.force) {
    const cached = traceCache.get(signature)
    if (cached && cached.expiresAt > Date.now()) return cached.value
  }

  const connection = options?.connection ?? getConnection()
  const tx = await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  })
  if (!tx) {
    throw new Error(`Transaction ${signature.slice(0, 8)}... not found on this RPC. Confirm the signature and that your RPC indexes the slot.`)
  }

  const errorByIndex = buildErrorByIndex(tx.meta)
  const accountKeys = tx.transaction.message.accountKeys
  const writable = new Set<string>()
  const signers = new Set<string>()
  for (const key of accountKeys) {
    const pubkey = key.pubkey.toBase58()
    if (key.writable) writable.add(pubkey)
    if (key.signer) signers.add(pubkey)
  }

  const instructions = tx.transaction.message.instructions.map((instr, idx) => {
    const normalized = normalizeInstruction(instr, idx, errorByIndex)
    if (!isParsed(instr)) {
      normalized.accounts = normalized.accounts.map((account) => ({
        ...account,
        isSigner: signers.has(account.pubkey),
        isWritable: writable.has(account.pubkey),
      }))
    } else {
      normalized.accounts = []
    }
    return normalized
  })

  for (const inner of tx.meta?.innerInstructions ?? []) {
    const parent = instructions[inner.index]
    if (!parent) continue
    parent.innerInstructions = inner.instructions.map((sub, subIdx) => {
      const normalized = normalizeInstruction(sub, subIdx, new Map())
      if (!isParsed(sub)) {
        normalized.accounts = normalized.accounts.map((account) => ({
          ...account,
          isSigner: signers.has(account.pubkey),
          isWritable: writable.has(account.pubkey),
        }))
      }
      return normalized
    })
  }

  const accountDiffs = buildAccountDiffs(tx)
  const logs = tx.meta?.logMessages ?? []
  const programIdSet = new Set<string>()
  for (const instr of instructions) {
    programIdSet.add(instr.programId)
    for (const sub of instr.innerInstructions) programIdSet.add(sub.programId)
  }

  const trace: ReplayTrace = {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    success: !tx.meta?.err,
    fee: tx.meta?.fee ?? 0,
    computeUnitsConsumed: tx.meta?.computeUnitsConsumed ?? null,
    feePayer: accountKeys[0]?.pubkey.toBase58() ?? null,
    programIds: Array.from(programIdSet),
    instructions,
    accountDiffs,
    logs,
    errorRaw: tx.meta?.err ?? null,
    anchorError: decodeAnchorError(logs),
    fetchedAt: Date.now(),
  }

  traceCache.set(signature, { value: trace, expiresAt: Date.now() + TRACE_TTL_MS })
  return trace
}

export async function fetchProgramRecentTraces(
  programId: string,
  limit = 10,
  options?: { connection?: Connection },
): Promise<ReplayProgramSummary> {
  if (!isValidPubkey(programId)) {
    throw new Error('Invalid program ID')
  }
  const safeLimit = Math.max(1, Math.min(limit, 25))
  const connection = options?.connection ?? getConnection()
  const sigs: ConfirmedSignatureInfo[] = await connection.getSignaturesForAddress(
    new PublicKey(programId),
    { limit: safeLimit },
    'confirmed',
  )
  return {
    programId,
    recent: sigs.map((entry) => ({
      signature: entry.signature,
      slot: entry.slot,
      blockTime: entry.blockTime ?? null,
      success: !entry.err,
      error: entry.err ? JSON.stringify(entry.err) : null,
    })),
  }
}

export function buildClaudeContext(trace: ReplayTrace): ReplayContextHandoff {
  const lines: string[] = []
  lines.push(`# DAEMON Replay Context — ${trace.signature.slice(0, 12)}…`)
  lines.push('')
  lines.push(`- Signature: \`${trace.signature}\``)
  lines.push(`- Slot: ${trace.slot}`)
  lines.push(`- Block time: ${trace.blockTime ? new Date(trace.blockTime * 1000).toISOString() : 'n/a'}`)
  lines.push(`- Success: ${trace.success ? 'yes' : 'NO'}`)
  lines.push(`- Fee: ${trace.fee} lamports`)
  if (trace.computeUnitsConsumed != null) {
    lines.push(`- Compute units consumed: ${trace.computeUnitsConsumed.toLocaleString()}`)
  }
  if (trace.feePayer) lines.push(`- Fee payer: \`${trace.feePayer}\``)
  if (trace.programIds.length > 0) {
    lines.push(`- Programs touched: ${trace.programIds.map((p) => `\`${p}\``).join(', ')}`)
  }

  if (trace.anchorError) {
    lines.push('')
    lines.push('## Anchor Error')
    lines.push(`- Code: \`${trace.anchorError.errorCode ?? 'unknown'}\` (#${trace.anchorError.errorNumber ?? '?'})`)
    if (trace.anchorError.errorMessage) lines.push(`- Message: ${trace.anchorError.errorMessage}`)
    if (trace.anchorError.account) lines.push(`- Account: \`${trace.anchorError.account}\``)
    if (trace.anchorError.programId) lines.push(`- Program: \`${trace.anchorError.programId}\``)
  }

  lines.push('')
  lines.push('## Instruction trace')
  for (const instr of trace.instructions) {
    const label = instr.programLabel ? `${instr.programLabel} (\`${instr.programId.slice(0, 8)}…\`)` : `\`${instr.programId}\``
    lines.push(`- [${instr.index}] ${label}${instr.error ? ` — ERROR: ${instr.error}` : ''}`)
    if (instr.parsed?.type) lines.push(`    - parsed: \`${instr.parsed.type}\``)
    for (const sub of instr.innerInstructions) {
      const subLabel = sub.programLabel ? `${sub.programLabel} (\`${sub.programId.slice(0, 8)}…\`)` : `\`${sub.programId}\``
      lines.push(`    - inner[${sub.index}] ${subLabel}`)
    }
  }

  const writableDiffs = trace.accountDiffs.filter((d) => d.isWritable && (d.lamportsDelta !== 0 || d.tokenMint))
  if (writableDiffs.length > 0) {
    lines.push('')
    lines.push('## Account diffs (writable)')
    for (const diff of writableDiffs) {
      const lamportDelta = diff.lamportsDelta === 0 ? '' : ` lamports Δ=${diff.lamportsDelta}`
      const tokenInfo = diff.tokenMint ? ` token=\`${diff.tokenMint.slice(0, 8)}…\` ${diff.preTokenAmount ?? '?'} → ${diff.postTokenAmount ?? '?'}` : ''
      lines.push(`- \`${diff.pubkey}\`${lamportDelta}${tokenInfo}`)
    }
  }

  if (trace.logs.length > 0) {
    lines.push('')
    lines.push('## Program logs')
    lines.push('```')
    for (const log of trace.logs.slice(0, 80)) lines.push(log)
    if (trace.logs.length > 80) lines.push(`… ${trace.logs.length - 80} more lines`)
    lines.push('```')
  }

  lines.push('')
  lines.push('## Your task')
  if (!trace.success) {
    lines.push('This transaction failed. Use the trace and logs above to identify the root cause and propose a concrete fix in the program code or client call. If the failure points at a specific account, walk through the relevant Anchor constraints or PDA derivation.')
  } else {
    lines.push('This transaction succeeded. Audit the instruction trace and account diffs for unexpected behavior, missing checks, or optimization opportunities.')
  }

  const headline = trace.success
    ? `Replay audit ${trace.signature.slice(0, 8)}…`
    : `Replay debug ${trace.signature.slice(0, 8)}… (${trace.anchorError?.errorCode ?? 'failed'})`

  return {
    contextMarkdown: lines.join('\n'),
    promptHeadline: headline,
    signature: trace.signature,
  }
}

function safeReplayFileName(signature: string): string {
  return `${signature.replace(/[^1-9A-HJ-NP-Za-km-z]/g, '').slice(0, 24)}.md`
}

function quoteForPowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function createAgentHandoff(projectPath: string, trace: ReplayTrace): ReplayAgentHandoff {
  const resolvedProjectPath = path.resolve(projectPath)
  const handoff = buildClaudeContext(trace)
  const replayDir = path.join(resolvedProjectPath, '.daemon', 'replays')
  const contextPath = path.join(replayDir, safeReplayFileName(trace.signature))

  if (!isPathWithinBase(contextPath, resolvedProjectPath)) {
    throw new Error('Replay handoff path escaped the project directory')
  }

  fs.mkdirSync(replayDir, { recursive: true })
  fs.writeFileSync(contextPath, handoff.contextMarkdown, 'utf8')

  const promptText = [
    `Use the DAEMON replay context in ${contextPath}.`,
    trace.success
      ? 'Audit the transaction for unsafe behavior, missed checks, account-diff surprises, and compute optimizations. Open the relevant files in this repo before recommending changes.'
      : 'Debug the failed Solana transaction. Identify the root cause, inspect the relevant program/client files, propose the smallest fix, and include the verification steps needed to prove it.',
  ].join(' ')

  return {
    ...handoff,
    contextPath,
    promptText,
    startupCommand: `claude --dangerously-skip-permissions -p ${quoteForPowerShell(promptText)}`,
  }
}

export function getCurrentRpcLabel(): string {
  return getRpcEndpoint()
}

// --- Test hooks ---

export function __resetCacheForTests(): void {
  traceCache.clear()
}

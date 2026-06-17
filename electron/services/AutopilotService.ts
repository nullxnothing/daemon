import crypto from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { getDb } from '../db/db'
import { getConnectionStrict } from './SolanaService'
import { getSwapQuote, executeSwap, getMintDecimals } from './WalletService'
import { quoteExecutionFee } from './FeeService'
import { getWalletInfrastructureSettings } from './SettingsService'
import type {
  Mandate,
  MandateAction,
  MandateDecision,
  MandateRule,
  MandateStrategy,
  MandatePositionLive,
  AutopilotState,
} from '../shared/types'

// ARIA Autopilot.
// A mandate is a standing, structured trading strategy (parsed from natural language by
// ARIA) that the scheduler evaluates on a fixed cadence and executes UNATTENDED on mainnet.
// Arming a mandate is the human authorization; from then on the scheduler reproduces a
// reviewed Jupiter quote server-side and runs it through the SAME guarded executeSwap path
// a manual trade uses — so the signer guard and execution fee meter both fire. No guard is
// bypassed. Every tick writes one autopilot_actions row (BUY/SELL/HOLD/SKIP), uniquely keyed
// by (mandate_id, tick_seq), so a restart mid-tick never double-fires and the Desk can replay
// exactly what the agent did.

const SOL_MINT = 'So11111111111111111111111111111111111111112'
// A mandate's exposure cap is a hard ceiling; never let a single clip exceed what remains.
const LAMPORTS_PER_SOL = 1e9
// Keep a little SOL back so a buy never drains the wallet below rent + tx fees.
const WALLET_SOL_RESERVE_LAMPORTS = 10_000_000 // 0.01 SOL

// ----------------------------------------------------------------- helpers ---

interface MandateRow {
  id: string
  label: string
  wallet_id: string
  cluster: string
  mandate_text: string
  strategy_json: string
  max_exposure_lamports: number
  interval_seconds: number
  status: Mandate['status']
  armed: number
  spent_lamports: number
  realized_pnl_lamports: number
  last_tick_at: number | null
  next_tick_at: number | null
  last_error: string | null
  armed_at: number | null
  created_at: number
  updated_at: number
}

function rowToMandate(row: MandateRow): Mandate {
  return {
    id: row.id,
    label: row.label,
    walletId: row.wallet_id,
    cluster: row.cluster,
    mandateText: row.mandate_text,
    strategy: JSON.parse(row.strategy_json) as MandateStrategy,
    maxExposureLamports: row.max_exposure_lamports,
    intervalSeconds: row.interval_seconds,
    status: row.status,
    armed: row.armed === 1,
    spentLamports: row.spent_lamports,
    realizedPnlLamports: row.realized_pnl_lamports,
    lastTickAt: row.last_tick_at,
    nextTickAt: row.next_tick_at,
    lastError: row.last_error,
    armedAt: row.armed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface ActionRow {
  id: string
  mandate_id: string
  tick_seq: number
  decision: MandateDecision
  reason: string | null
  input_mint: string | null
  output_mint: string | null
  notional_lamports: number | null
  fee_lamports: number | null
  signature: string | null
  status: MandateAction['status']
  error: string | null
  created_at: number
}

function rowToAction(row: ActionRow): MandateAction {
  return {
    id: row.id,
    mandateId: row.mandate_id,
    tickSeq: row.tick_seq,
    decision: row.decision,
    reason: row.reason,
    inputMint: row.input_mint,
    outputMint: row.output_mint,
    notionalLamports: row.notional_lamports,
    feeLamports: row.fee_lamports,
    signature: row.signature,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
  }
}

function walletAddress(walletId: string): string {
  const row = getDb().prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as
    | { address: string }
    | undefined
  if (!row) throw new Error(`Wallet ${walletId} not found`)
  return row.address
}

function requireMint(mint: string, label: string): void {
  try {
    new PublicKey(mint)
  } catch {
    throw new Error(`Invalid ${label}: ${mint}`)
  }
}

/** A mandate may only arm on mainnet — the whole point is unattended live execution. */
function assertMainnet(): void {
  const cluster = getWalletInfrastructureSettings().cluster
  if (cluster !== 'mainnet-beta') {
    throw new Error(`Autopilot mandates run on mainnet-beta; current cluster is "${cluster}". Switch in Wallet settings.`)
  }
}

// ----------------------------------------------------------------- reads ---

export function getMandateOrThrow(id: string): Mandate {
  const row = getDb().prepare('SELECT * FROM autopilot_mandates WHERE id = ?').get(id) as MandateRow | undefined
  if (!row) throw new Error('Mandate not found')
  return rowToMandate(row)
}

export function listMandates(): Mandate[] {
  const rows = getDb().prepare('SELECT * FROM autopilot_mandates ORDER BY created_at DESC').all() as MandateRow[]
  return rows.map(rowToMandate)
}

export function listArmedMandates(): Mandate[] {
  const rows = getDb()
    .prepare('SELECT * FROM autopilot_mandates WHERE armed = 1 ORDER BY next_tick_at ASC')
    .all() as MandateRow[]
  return rows.map(rowToMandate)
}

function listRecentActions(limit = 100): MandateAction[] {
  const rows = getDb()
    .prepare('SELECT * FROM autopilot_actions ORDER BY created_at DESC LIMIT ?')
    .all(limit) as ActionRow[]
  return rows.map(rowToAction)
}

/**
 * Desk state. Prices each ARMED mandate's open position live (reverse quote) so cards can show
 * unrealized P&L. Pricing is best-effort and concurrent — a slow or failed quote yields no
 * position entry rather than blocking the whole state read.
 */
export async function getAutopilotState(running: boolean): Promise<AutopilotState> {
  const mandates = listMandates()
  const armed = mandates.filter((m) => m.armed && m.spentLamports > 0)
  const settled = await Promise.allSettled(
    armed.map(async (m): Promise<MandatePositionLive> => {
      const p = await valuePosition(m)
      return { mandateId: m.id, valueLamports: p.valueLamports, unrealizedLamports: p.unrealizedLamports, pnlPct: p.pnlPct }
    }),
  )
  const positions = settled
    .filter((r): r is PromiseFulfilledResult<MandatePositionLive> => r.status === 'fulfilled' && r.value.valueLamports > 0)
    .map((r) => r.value)
  return { mandates, recentActions: listRecentActions(), positions, running }
}

// --------------------------------------------------------------- validation ---

/** Throws on any structurally invalid strategy/guardrail before a mandate is saved. */
export function validateStrategy(strategy: MandateStrategy, maxExposureLamports: number): void {
  requireMint(strategy.targetMint, 'target mint')
  if (strategy.targetMint === SOL_MINT) throw new Error('Target mint cannot be wrapped SOL')
  if (!Number.isInteger(strategy.clipLamports) || strategy.clipLamports <= 0) {
    throw new Error('clipLamports must be a positive integer (lamports per DCA buy)')
  }
  if (strategy.clipLamports > maxExposureLamports) {
    throw new Error('A single clip cannot exceed the mandate exposure cap')
  }
  if (!Number.isInteger(strategy.slippageBps) || strategy.slippageBps <= 0 || strategy.slippageBps > 5_000) {
    throw new Error('slippageBps must be between 1 and 5000')
  }
  if (!Number.isInteger(maxExposureLamports) || maxExposureLamports <= 0) {
    throw new Error('maxExposureLamports must be a positive integer')
  }
}

// --------------------------------------------------------------- mutations ---

export interface CreateMandateInput {
  label: string
  walletId: string
  mandateText: string
  strategy: MandateStrategy
  maxExposureLamports: number
  intervalSeconds: number
}

export function createMandate(input: CreateMandateInput): Mandate {
  validateStrategy(input.strategy, input.maxExposureLamports)
  walletAddress(input.walletId) // throws if the wallet is unknown
  if (!Number.isInteger(input.intervalSeconds) || input.intervalSeconds < 30) {
    throw new Error('intervalSeconds must be at least 30')
  }
  const id = crypto.randomUUID()
  const cluster = getWalletInfrastructureSettings().cluster
  getDb()
    .prepare(
      `INSERT INTO autopilot_mandates
         (id, label, wallet_id, cluster, mandate_text, strategy_json, max_exposure_lamports, interval_seconds, status, armed)
       VALUES (?,?,?,?,?,?,?,?,'draft',0)`,
    )
    .run(
      id,
      input.label,
      input.walletId,
      cluster,
      input.mandateText,
      JSON.stringify(input.strategy),
      input.maxExposureLamports,
      input.intervalSeconds,
    )
  return getMandateOrThrow(id)
}

/**
 * Arm a mandate: flip it live so the scheduler picks it up on the next tick. Mainnet-only,
 * and the exposure cap must already be set (it's NOT NULL at the schema level). Arming is the
 * single human authorization for all subsequent unattended execution.
 */
export function armMandate(id: string): Mandate {
  assertMainnet()
  const mandate = getMandateOrThrow(id)
  if (mandate.spentLamports >= mandate.maxExposureLamports) {
    throw new Error('Mandate has already spent its full exposure cap; raise the cap or create a new mandate')
  }
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE autopilot_mandates
         SET armed = 1, status = 'armed', armed_at = ?, next_tick_at = ?, last_error = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .run(now, now, now, id)
  return getMandateOrThrow(id)
}

export function disarmMandate(id: string): Mandate {
  getMandateOrThrow(id)
  const now = Date.now()
  getDb()
    .prepare("UPDATE autopilot_mandates SET armed = 0, status = 'paused', next_tick_at = NULL, updated_at = ? WHERE id = ?")
    .run(now, id)
  return getMandateOrThrow(id)
}

/** Kill switch: disarm every mandate at once. Returns how many were live. */
export function disarmAll(): number {
  const now = Date.now()
  const res = getDb()
    .prepare("UPDATE autopilot_mandates SET armed = 0, status = 'paused', next_tick_at = NULL, updated_at = ? WHERE armed = 1")
    .run(now)
  return res.changes
}

export function deleteMandate(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM autopilot_actions WHERE mandate_id = ?').run(id)
  db.prepare('DELETE FROM autopilot_mandates WHERE id = ?').run(id)
}

// ----------------------------------------------------------------- ledger ---

/** Monotonic next tick number for a mandate (one row per tick, unique-indexed). */
function nextTickSeq(mandateId: string): number {
  const row = getDb()
    .prepare('SELECT MAX(tick_seq) as m FROM autopilot_actions WHERE mandate_id = ?')
    .get(mandateId) as { m: number | null }
  return (row.m ?? 0) + 1
}

function recordAction(action: Omit<MandateAction, 'id' | 'createdAt'>): void {
  getDb()
    .prepare(
      `INSERT INTO autopilot_actions
         (id, mandate_id, tick_seq, decision, reason, input_mint, output_mint, notional_lamports, fee_lamports, signature, status, error)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      crypto.randomUUID(),
      action.mandateId,
      action.tickSeq,
      action.decision,
      action.reason,
      action.inputMint,
      action.outputMint,
      action.notionalLamports,
      action.feeLamports,
      action.signature,
      action.status,
      action.error,
    )
}

// ----------------------------------------------------------------- position ---

/** Live snapshot of a mandate's open position, priced in SOL via a reverse Jupiter quote. */
export interface PositionValue {
  /** Raw token balance the wallet holds of the target mint. */
  rawTokens: bigint
  /** Human token amount (rawTokens / 10^decimals). */
  tokenAmount: number
  /** What the position is worth right now in lamports, per a reverse quote. 0 if unpriceable. */
  valueLamports: number
  /** Unrealized P&L vs. spent lamports (value - spent). Can be negative. */
  unrealizedLamports: number
  /** Percent return vs. spend ((value/spent - 1) * 100). 0 when nothing spent. */
  pnlPct: number
}

async function resolveTokenProgram(connection: ReturnType<typeof getConnectionStrict>, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint)
  if (info && info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID
  return TOKEN_PROGRAM_ID
}

/** The wallet's raw balance of a mint (0 when no ATA / nothing held). */
async function readTokenBalance(
  connection: ReturnType<typeof getConnectionStrict>,
  owner: PublicKey,
  mint: string,
): Promise<bigint> {
  const mintPk = new PublicKey(mint)
  const tokenProgram = await resolveTokenProgram(connection, mintPk)
  const ata = await getAssociatedTokenAddress(mintPk, owner, false, tokenProgram)
  try {
    const account = await getAccount(connection, ata, undefined, tokenProgram)
    return account.amount
  } catch {
    return 0n
  }
}

/**
 * Price a mandate's open position in SOL by reverse-quoting the held token balance back to SOL
 * (target → SOL). No separate price oracle — the same Jupiter route that buys also values. A
 * failed/empty quote yields a zero value (treated as unpriceable, not a loss) so a transient
 * route failure never trips a stop-loss spuriously.
 */
export async function valuePosition(mandate: Mandate): Promise<PositionValue> {
  const connection = getConnectionStrict()
  const owner = new PublicKey(walletAddress(mandate.walletId))
  const rawTokens = await readTokenBalance(connection, owner, mandate.strategy.targetMint)
  if (rawTokens <= 0n) {
    return { rawTokens: 0n, tokenAmount: 0, valueLamports: 0, unrealizedLamports: -mandate.spentLamports, pnlPct: 0 }
  }
  const decimals = await getMintDecimals(mandate.strategy.targetMint, connection)
  const tokenAmount = Number(rawTokens) / 10 ** decimals

  let valueLamports = 0
  try {
    // Reverse quote: how much SOL the whole position would fetch right now.
    const quote = await getSwapQuote(mandate.walletId, mandate.strategy.targetMint, SOL_MINT, tokenAmount, mandate.strategy.slippageBps)
    valueLamports = Math.round(Number(quote.outAmount) * LAMPORTS_PER_SOL)
  } catch {
    valueLamports = 0
  }
  const unrealizedLamports = valueLamports - mandate.spentLamports
  const pnlPct = mandate.spentLamports > 0 ? (valueLamports / mandate.spentLamports - 1) * 100 : 0
  return { rawTokens, tokenAmount, valueLamports, unrealizedLamports, pnlPct }
}

// ----------------------------------------------------------------- exits ---

export interface ExitDecision {
  triggered: boolean
  rule?: MandateRule['kind']
  reason: string
}

/**
 * Check a mandate's exit rules against a live position value. Only fires once the position is
 * actually priceable (valueLamports > 0) and something has been spent — an unpriceable position
 * never triggers a stop-loss. liquidity_floor compares the position's current SOL value against
 * the threshold (in SOL): if the whole position can no longer be sold for that much, the route
 * has thinned out and we exit.
 */
export function evaluateExits(mandate: Mandate, position: PositionValue): ExitDecision {
  if (position.valueLamports <= 0 || mandate.spentLamports <= 0) {
    return { triggered: false, reason: 'No priceable position' }
  }
  for (const rule of mandate.strategy.rules) {
    if (rule.kind === 'take_profit' && position.pnlPct >= rule.threshold) {
      return { triggered: true, rule: 'take_profit', reason: `Take-profit hit (+${position.pnlPct.toFixed(1)}% ≥ ${rule.threshold}%)` }
    }
    if (rule.kind === 'stop_loss' && position.pnlPct <= -rule.threshold) {
      return { triggered: true, rule: 'stop_loss', reason: `Stop-loss hit (${position.pnlPct.toFixed(1)}% ≤ -${rule.threshold}%)` }
    }
    if (rule.kind === 'liquidity_floor') {
      const floorLamports = rule.threshold * LAMPORTS_PER_SOL
      if (position.valueLamports < floorLamports) {
        return { triggered: true, rule: 'liquidity_floor', reason: `Liquidity floor breached (sellable ${(position.valueLamports / LAMPORTS_PER_SOL).toFixed(3)} < ${rule.threshold} SOL)` }
      }
    }
  }
  return { triggered: false, reason: 'No exit rule met' }
}

// --------------------------------------------------------------- evaluation ---

export interface MandateDecisionResult {
  decision: MandateDecision
  reason: string
  /** Lamports of SOL to spend on a buy (only set when decision === 'buy'). */
  clipLamports?: number
}

/**
 * Pure decision: given a mandate's current spend and live wallet balance, decide whether this
 * tick should BUY a clip, HOLD, or SKIP. Exit rules (TP/SL/liquidity) are evaluated by the
 * scheduler against live price; this function owns the DCA accumulation + exposure-cap logic.
 * No side effects — the scheduler performs the swap and writes the ledger.
 */
export function evaluateMandate(mandate: Mandate, walletLamports: number): MandateDecisionResult {
  const remaining = mandate.maxExposureLamports - mandate.spentLamports
  if (remaining <= 0) {
    return { decision: 'skip', reason: 'Exposure cap reached' }
  }
  const clip = Math.min(mandate.strategy.clipLamports, remaining)
  const spendable = walletLamports - WALLET_SOL_RESERVE_LAMPORTS
  if (spendable < clip) {
    return { decision: 'hold', reason: `Wallet SOL too low for a ${(clip / LAMPORTS_PER_SOL).toFixed(4)} SOL clip` }
  }
  return { decision: 'buy', reason: `DCA clip ${(clip / LAMPORTS_PER_SOL).toFixed(4)} SOL`, clipLamports: clip }
}

// --------------------------------------------------------------- execution ---

/**
 * Run one tick of an armed mandate. Idempotent on (mandateId, tickSeq): the unique index
 * makes a duplicate insert throw, so a crash-replay of the same tick can't double-spend.
 * The buy goes through getSwapQuote + executeSwap — the same guarded, fee-metered path as a
 * manual trade. Returns the action it recorded (or null when nothing happened this tick).
 */
export async function tickMandate(mandateId: string): Promise<MandateAction | null> {
  const mandate = getMandateOrThrow(mandateId)
  if (!mandate.armed) return null

  const connection = getConnectionStrict()
  const owner = new PublicKey(walletAddress(mandate.walletId))
  const walletLamports = await connection.getBalance(owner)
  const now = Date.now()
  const nextTickAt = now + mandate.intervalSeconds * 1000

  // Exit rules run FIRST each tick: value the open position and, if any rule fires, sell the
  // whole position back to SOL, book realized P&L, and close the mandate. Only mandates with
  // rules AND prior spend can exit (a fresh draft has nothing to sell).
  if (mandate.strategy.rules.length > 0 && mandate.spentLamports > 0) {
    const position = await valuePosition(mandate)
    const exit = evaluateExits(mandate, position)
    if (exit.triggered) {
      return sellPosition(mandate, position, exit, now)
    }
  }

  const decision = evaluateMandate(mandate, walletLamports)
  const tickSeq = nextTickSeq(mandateId)

  // Non-buy decisions: record the tick and reschedule, nothing on-chain.
  if (decision.decision !== 'buy' || !decision.clipLamports) {
    recordAction({
      mandateId,
      tickSeq,
      decision: decision.decision,
      reason: decision.reason,
      inputMint: null,
      outputMint: null,
      notionalLamports: null,
      feeLamports: null,
      signature: null,
      status: 'decided',
      error: null,
    })
    getDb()
      .prepare('UPDATE autopilot_mandates SET last_tick_at = ?, next_tick_at = ?, last_error = NULL, updated_at = ? WHERE id = ?')
      .run(now, nextTickAt, now, mandateId)
    return latestAction(mandateId, tickSeq)
  }

  const clipLamports = decision.clipLamports
  const amountSol = clipLamports / LAMPORTS_PER_SOL
  const feeQuote = quoteExecutionFee(clipLamports)

  try {
    // Reproduce the human review server-side: a fresh, hash-pinned Jupiter quote draft,
    // then execute it through the signer guard. Arming the mandate was the authorization.
    const quote = await getSwapQuote(mandate.walletId, SOL_MINT, mandate.strategy.targetMint, amountSol, mandate.strategy.slippageBps)
    const result = await executeSwap(
      mandate.walletId,
      SOL_MINT,
      mandate.strategy.targetMint,
      amountSol,
      mandate.strategy.slippageBps,
      quote.rawQuoteResponse,
      { restrictIntermediateTokens: true },
    )
    recordAction({
      mandateId,
      tickSeq,
      decision: 'buy',
      reason: decision.reason,
      inputMint: SOL_MINT,
      outputMint: mandate.strategy.targetMint,
      notionalLamports: clipLamports,
      feeLamports: feeQuote?.lamports ?? 0,
      signature: result.signature,
      status: 'executed',
      error: null,
    })
    const spent = mandate.spentLamports + clipLamports
    const exhausted = spent >= mandate.maxExposureLamports
    getDb()
      .prepare(
        `UPDATE autopilot_mandates
           SET spent_lamports = ?, last_tick_at = ?, next_tick_at = ?, last_error = NULL,
               armed = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        spent,
        now,
        exhausted ? null : nextTickAt,
        exhausted ? 0 : 1,
        exhausted ? 'exhausted' : 'armed',
        now,
        mandateId,
      )
    return latestAction(mandateId, tickSeq)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    recordAction({
      mandateId,
      tickSeq,
      decision: 'buy',
      reason: decision.reason,
      inputMint: SOL_MINT,
      outputMint: mandate.strategy.targetMint,
      notionalLamports: clipLamports,
      feeLamports: null,
      signature: null,
      status: 'failed',
      error: message,
    })
    // A failed buy reschedules (transient RPC/route failures shouldn't kill the mandate),
    // but the error is surfaced on the card so the operator can disarm.
    getDb()
      .prepare('UPDATE autopilot_mandates SET last_tick_at = ?, next_tick_at = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .run(now, nextTickAt, message, now, mandateId)
    return latestAction(mandateId, tickSeq)
  }
}

/**
 * Close a mandate's position: sell the entire held token balance back to SOL through the same
 * guarded, fee-metered path, book realized P&L (SOL received − total spent), and disarm. Called
 * only when an exit rule has triggered. A failed sell does NOT disarm — it reschedules and
 * surfaces the error so the operator can intervene (the position stays open, exit retries).
 */
async function sellPosition(
  mandate: Mandate,
  position: PositionValue,
  exit: ExitDecision,
  now: number,
): Promise<MandateAction | null> {
  const tickSeq = nextTickSeq(mandate.id)
  const nextTickAt = now + mandate.intervalSeconds * 1000
  const feeQuote = quoteExecutionFee(position.valueLamports)

  try {
    const quote = await getSwapQuote(mandate.walletId, mandate.strategy.targetMint, SOL_MINT, position.tokenAmount, mandate.strategy.slippageBps)
    const result = await executeSwap(
      mandate.walletId,
      mandate.strategy.targetMint,
      SOL_MINT,
      position.tokenAmount,
      mandate.strategy.slippageBps,
      quote.rawQuoteResponse,
      { restrictIntermediateTokens: true },
    )
    // Realized P&L = SOL actually received this sale − everything the mandate ever spent.
    const receivedLamports = Math.round(Number(quote.outAmount) * LAMPORTS_PER_SOL)
    const realized = receivedLamports - mandate.spentLamports
    recordAction({
      mandateId: mandate.id,
      tickSeq,
      decision: 'sell',
      reason: exit.reason,
      inputMint: mandate.strategy.targetMint,
      outputMint: SOL_MINT,
      notionalLamports: receivedLamports,
      feeLamports: feeQuote?.lamports ?? 0,
      signature: result.signature,
      status: 'executed',
      error: null,
    })
    // Position closed → disarm. realized_pnl accumulates across exit cycles.
    getDb()
      .prepare(
        `UPDATE autopilot_mandates
           SET armed = 0, status = 'exhausted', next_tick_at = NULL,
               realized_pnl_lamports = realized_pnl_lamports + ?, last_tick_at = ?, last_error = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(realized, now, now, mandate.id)
    return latestAction(mandate.id, tickSeq)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    recordAction({
      mandateId: mandate.id,
      tickSeq,
      decision: 'sell',
      reason: exit.reason,
      inputMint: mandate.strategy.targetMint,
      outputMint: SOL_MINT,
      notionalLamports: position.valueLamports,
      feeLamports: null,
      signature: null,
      status: 'failed',
      error: message,
    })
    getDb()
      .prepare('UPDATE autopilot_mandates SET last_tick_at = ?, next_tick_at = ?, last_error = ?, updated_at = ? WHERE id = ?')
      .run(now, nextTickAt, `Exit sell failed: ${message}`, now, mandate.id)
    return latestAction(mandate.id, tickSeq)
  }
}

function latestAction(mandateId: string, tickSeq: number): MandateAction | null {
  const row = getDb()
    .prepare('SELECT * FROM autopilot_actions WHERE mandate_id = ? AND tick_seq = ?')
    .get(mandateId, tickSeq) as ActionRow | undefined
  return row ? rowToAction(row) : null
}

import nacl from 'tweetnacl'
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import { broadcast } from './EventBus'
import { LogService } from './LogService'
import { executeInstructions, getConnection, withKeypair } from './SolanaService'
import { getDb } from '../db/db'

const BASE = 'https://spawnagents.fun/v1'
const EVENT_POLL_INTERVAL_MS = 5000
const SPAWN_STATUS_POLL_INTERVAL_MS = 3500
const SPAWN_STATUS_TIMEOUT_MS = 5 * 60 * 1000

// ------------------------------------------------------------------ types ---

export interface SpawnAgentDna {
  trades_memecoins?: boolean
  trades_prediction?: boolean
  aggression?: number
  patience?: number
  risk_tolerance?: number
  sell_profit_pct?: number
  sell_loss_pct?: number
  max_position_pct?: number
  sniper?: boolean
  launchpads?: string[]
  max_trade_sol?: number
  buy_threshold_holders?: number
  buy_threshold_volume?: number
  buy_threshold_volume_1h?: number
  max_positions_memecoin?: number
  min_mcap?: number
  max_mcap?: number
  max_pair_age_hours?: number
  trailing_stop_pct?: number
  buy_cooldown_min?: number
  require_dex_paid?: boolean
  require_socials?: boolean
  reproduction_cost_sol?: number
  royalty_pct?: number
  pm_categories?: string[]
  pm_edge_threshold?: number
  pm_max_position_pct?: number
  pm_max_positions?: number
  pm_sell_strategy?: 'target' | 'trail' | 'hold'
  pm_target_pct?: number
  pm_trail_pct?: number
  pm_max_days_to_resolution?: number
  pm_min_liquidity_usd?: number
  pm_stop_loss_pct?: number
  pm_price_zone?: 'any' | 'balanced' | 'cheap' | 'premium'
  pm_min_confidence?: 'any' | 'medium' | 'high'
  pm_max_trade_usd?: number
}

export interface SpawnAgentRecord {
  id: string
  name: string
  owner_wallet: string
  agent_wallet: string
  status: 'alive' | 'dead'
  generation: number
  parent_id: string | null
  born_at: string
  died_at: string | null
  death_reason: string | null
  total_pnl_sol: number
  total_trades: number
  initial_capital_sol: number
  total_withdrawn_sol: number
  total_deposited_sol: number
  pnl_mode: string
  paused: boolean
  signing_mode: string
  metaplex_asset_address: string
  avatar: string | null
  bio: string | null
  dna: SpawnAgentDna
}

export interface SpawnDepositInstruction {
  payment_id: string
  agent_id: string
  agent_name: string
  amount: number
  reference: string
  recipient: string
  dna: SpawnAgentDna
}

export interface SpawnStatusResult {
  status: 'pending' | 'confirmed' | 'funding_failed' | 'expired'
  tx_signature: string | null
  buyer_wallet: string
  agent_id: string
  amount: number
  agent_wallet: string | null
}

export interface SpawnTrade {
  id: number
  agent_id: string
  token_address: string
  action: 'buy' | 'sell'
  amount_sol: number
  token_amount: number
  pnl_sol: number | null
  tx_signature: string
  timestamp: string
}

export interface SpawnMemePosition {
  type: 'memecoin'
  token_address: string
  symbol: string
  token_amount: number
  value_sol: number
  cost_basis_sol: number
  unrealized_pnl_sol: number
  unrealized_pnl_pct: number
}

export interface SpawnPmPosition {
  type: 'prediction'
  id: string
  market_id: string
  event_title: string
  market_title: string
  side: 'YES' | 'NO'
  contracts: number
  contracts_remaining: number
  cost_basis_usd: number
  buy_price_cents: number
  peak_price_cents: number
  tp_level_sold: number
  realized_pnl_usd: number
  opened_at: string
  force_close_pending: boolean
}

export interface SpawnAgentPositions {
  memecoin: SpawnMemePosition[]
  prediction: SpawnPmPosition[]
}

export interface SpawnEvent {
  id: number
  type: string
  agent_id: string
  data: Record<string, unknown>
  timestamp: number
}

export interface SpawnEventsResult {
  events: SpawnEvent[]
  cursor: number
  has_more: boolean
}

export interface SpawnChildInput {
  name: string
  sol_amount: number
}

export interface SpawnInput {
  owner_wallet: string
  name: string
  sol_amount: number
  dna: SpawnAgentDna
  meta?: { avatar?: string; bio?: string }
}

export interface WithdrawResult {
  tx_signature: string
  amount_sol: number
  new_balance_sol: number
}

export interface KillResult {
  killed: boolean
  refund_sol: number
  tx_signature: string
}

// ----------------------------------------------------------------- helpers ---

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  return body
}

function nonce(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function sign(walletId: string, message: string): Promise<{ owner_wallet: string; signature: string; message: string }> {
  return withKeypair(walletId, async (keypair) => {
    const db = getDb()
    const row = db.prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as { address: string } | undefined
    if (!row) throw new Error('Wallet not found')
    const messageBytes = new TextEncoder().encode(message)
    const sig = nacl.sign.detached(messageBytes, keypair.secretKey)
    const signature = Buffer.from(sig).toString('base64')
    return { owner_wallet: row.address, signature, message }
  })
}

// ------------------------------------------------------------------- reads ---

export async function listAgents(ownerPubkey: string): Promise<SpawnAgentRecord[]> {
  const data = await apiFetch<{ agents: SpawnAgentRecord[] }>(`/agents?owner=${ownerPubkey}`)
  return data.agents
}

export async function getAgent(agentId: string): Promise<SpawnAgentRecord> {
  const data = await apiFetch<{ agent: SpawnAgentRecord }>(`/agents/${agentId}`)
  return data.agent
}

export async function getTrades(agentId: string, limit = 100, offset = 0): Promise<{ trades: SpawnTrade[]; limit: number; offset: number }> {
  return apiFetch(`/agents/${agentId}/trades?limit=${limit}&offset=${offset}`)
}

export async function getPositions(agentId: string): Promise<SpawnAgentPositions> {
  return apiFetch(`/agents/${agentId}/positions`)
}

export async function getEvents(since: number, agentId?: string, limit = 200): Promise<SpawnEventsResult> {
  const params = new URLSearchParams({ since: String(since), limit: String(limit) })
  if (agentId) params.set('agent_id', agentId)
  return apiFetch(`/events?${params}`)
}

export async function pollSpawnStatus(ref: string): Promise<SpawnStatusResult> {
  return apiFetch(`/spawn/status?ref=${encodeURIComponent(ref)}`)
}

// ------------------------------------------------------------------ writes ---

export async function initiateSpawn(input: SpawnInput): Promise<SpawnDepositInstruction> {
  return apiFetch('/agents', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function initiateSpawnChild(parentAgentId: string, walletId: string, input: SpawnChildInput): Promise<SpawnDepositInstruction> {
  const msg = `spawn-child:${parentAgentId}:${nonce()}`
  const auth = await sign(walletId, msg)
  return apiFetch(`/agents/${parentAgentId}/spawn-child`, {
    method: 'POST',
    body: JSON.stringify({ ...auth, ...input }),
  })
}

export async function withdraw(agentId: string, walletId: string, amountSol: number): Promise<WithdrawResult> {
  const msg = `withdraw:${agentId}:${amountSol}:${nonce()}`
  const auth = await sign(walletId, msg)
  return apiFetch(`/agents/${agentId}/withdraw`, {
    method: 'POST',
    body: JSON.stringify({ ...auth, amount_sol: amountSol, method: 'phantom' }),
  })
}

export async function killAgent(agentId: string, walletId: string): Promise<KillResult> {
  const msg = `kill:${agentId}:${nonce()}`
  const auth = await sign(walletId, msg)
  return apiFetch(`/agents/${agentId}`, {
    method: 'DELETE',
    body: JSON.stringify({ ...auth, death_reason: 'manual' }),
  })
}

// ----------------------------------------------------- funded spawn (saga) ---

export interface SpawnAndFundResult {
  agent: SpawnAgentRecord
  deposit: SpawnDepositInstruction
  funding_tx_signature: string
}

async function sendFundingDeposit(
  walletId: string,
  recipient: string,
  reference: string,
  amountSol: number,
): Promise<string> {
  const recipientPk = new PublicKey(recipient)
  const referencePk = new PublicKey(reference)
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL)
  if (lamports <= 0) throw new Error('Invalid deposit amount')

  return withKeypair(walletId, async (kp) => {
    const transfer = SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: recipientPk,
      lamports,
    })
    // Solana Pay pattern — embed reference as a readonly key so the indexer can match
    const ix = new TransactionInstruction({
      programId: transfer.programId,
      keys: [...transfer.keys, { pubkey: referencePk, isSigner: false, isWritable: false }],
      data: transfer.data,
    })
    const result = await executeInstructions(getConnection(), [ix], [kp], { timeoutMs: 60_000 })
    return result.signature
  })
}

async function pollUntilConfirmed(ref: string): Promise<SpawnStatusResult> {
  const deadline = Date.now() + SPAWN_STATUS_TIMEOUT_MS
  while (Date.now() < deadline) {
    const status = await pollSpawnStatus(ref)
    if (status.status === 'confirmed') return status
    if (status.status === 'funding_failed' || status.status === 'expired') {
      throw new Error(`Spawn ${status.status}`)
    }
    await new Promise((r) => setTimeout(r, SPAWN_STATUS_POLL_INTERVAL_MS))
  }
  throw new Error('Timed out waiting for spawn confirmation')
}

export async function spawnAndFund(walletId: string, input: SpawnInput): Promise<SpawnAndFundResult> {
  const deposit = await initiateSpawn(input)
  const funding_tx_signature = await sendFundingDeposit(walletId, deposit.recipient, deposit.reference, deposit.amount)
  await pollUntilConfirmed(deposit.reference)
  const agent = await getAgent(deposit.agent_id)
  return { agent, deposit, funding_tx_signature }
}

export async function spawnChildAndFund(
  parentAgentId: string,
  walletId: string,
  input: SpawnChildInput,
): Promise<SpawnAndFundResult> {
  const deposit = await initiateSpawnChild(parentAgentId, walletId, input)
  const funding_tx_signature = await sendFundingDeposit(walletId, deposit.recipient, deposit.reference, deposit.amount)
  await pollUntilConfirmed(deposit.reference)
  const agent = await getAgent(deposit.agent_id)
  return { agent, deposit, funding_tx_signature }
}

// ------------------------------------------------------- event poll stream ---

let eventTimer: ReturnType<typeof setInterval> | null = null
let eventCursor = Date.now()

async function tickEvents(): Promise<void> {
  try {
    const res = await getEvents(eventCursor, undefined, 200)
    if (res.events.length > 0) {
      for (const ev of res.events) {
        broadcast('spawnagents:event', ev)
      }
      eventCursor = res.cursor
      broadcast('spawnagents:cursor', eventCursor)
    }
  } catch (err) {
    LogService.warn('spawnagents', `event poll failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export function startEventStream(): void {
  if (eventTimer) return
  eventCursor = Date.now()
  eventTimer = setInterval(() => { void tickEvents() }, EVENT_POLL_INTERVAL_MS)
}

export function stopEventStream(): void {
  if (eventTimer) {
    clearInterval(eventTimer)
    eventTimer = null
  }
}

// --------------------------------------------------- client-side gate utils ---

export interface AgentGateStatus {
  can_kill: boolean
  can_withdraw: boolean
  kill_reason?: string
  withdraw_reason?: string
}

const KILL_COOLDOWN_MS = 24 * 60 * 60 * 1000
const CHILD_ACTIVITY_GATE_TRADES = 10
const CHILD_ACTIVITY_GATE_MS = 7 * 24 * 60 * 60 * 1000

export function computeGate(agent: SpawnAgentRecord): AgentGateStatus {
  const out: AgentGateStatus = { can_kill: true, can_withdraw: true }
  if (agent.status !== 'alive') {
    return { can_kill: false, can_withdraw: false, kill_reason: 'Agent is dead', withdraw_reason: 'Agent is dead' }
  }
  const bornMs = Date.parse(agent.born_at.replace(' ', 'T') + 'Z')
  if (Number.isFinite(bornMs) && Date.now() - bornMs < KILL_COOLDOWN_MS) {
    out.can_kill = false
    const hoursLeft = Math.ceil((KILL_COOLDOWN_MS - (Date.now() - bornMs)) / (60 * 60 * 1000))
    out.kill_reason = `24h post-spawn cooldown — ${hoursLeft}h left`
  }
  if (agent.parent_id) {
    const ageOk = Number.isFinite(bornMs) && Date.now() - bornMs >= CHILD_ACTIVITY_GATE_MS
    const tradesOk = agent.total_trades >= CHILD_ACTIVITY_GATE_TRADES
    if (!ageOk && !tradesOk) {
      const reason = `Child agents need ${CHILD_ACTIVITY_GATE_TRADES} trades or 7 days (${agent.total_trades}/${CHILD_ACTIVITY_GATE_TRADES} trades)`
      out.can_withdraw = false
      out.withdraw_reason = reason
      if (out.can_kill) {
        out.can_kill = false
        out.kill_reason = reason
      }
    }
  }
  return out
}

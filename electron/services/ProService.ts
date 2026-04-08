import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { app } from 'electron'
import bs58 from 'bs58'
import { getDb } from '../db/db'
import * as SecureKey from './SecureKeyService'
import { withKeypair } from './SolanaService'
import type {
  ProFeature,
  ProSubscriptionState,
  ProPriceInfo,
  ArenaSubmission,
  ArenaSubmissionInput,
  ProSkillManifest,
} from '../shared/types'

/**
 * Client-side Daemon Pro service.
 *
 * Responsibilities:
 *   1. Know the current subscription state (active/expired, expiry, features)
 *   2. Drive the x402 subscribe handshake:
 *       - GET /v1/subscribe/price to show the user what they're about to pay
 *       - POST /v1/subscribe (expecting 402) to get the payment challenge
 *       - sign a payment payload with the user's wallet
 *       - POST /v1/subscribe with X-Payment to receive the JWT
 *   3. Store the JWT in SecureKeyService (OS keychain) — never touches SQLite in plaintext
 *   4. Attach Authorization: Bearer <jwt> to every gated /v1/* call
 *   5. Provide typed wrappers for MCP sync, Arena, Pro skills, priority API
 *   6. Expose a local-only isActive() check that verifies the JWT hasn't expired,
 *      without round-tripping the server (fast enough for every UI render)
 *
 * Security notes:
 *   - The JWT is stored encrypted via safeStorage (same mechanism as API keys)
 *   - Wallet signing goes through `withKeypair`, which enforces the same HITL
 *     confirmation / rate limit / audit trail as every other wallet operation
 *   - The MVP payment payload is a plain JSON object wrapped in base64url, NOT
 *     a real x402 PaymentPayload. When the server-side x402 facilitator check
 *     lands, this client will need to emit the full @x402/svm payload. See the
 *     TODO marker in buildPaymentHeader().
 *
 * Storage layout:
 *   - pro_state table:     effective cached state for the UI (NOT the JWT)
 *   - SecureKeyService:    the JWT itself, under the key 'daemon_pro_jwt'
 *   - ~/.daemon/pro-skills/<id>/…  downloaded Pro skill files
 */

const DAEMON_PRO_API_BASE = process.env.DAEMON_PRO_API_BASE ?? 'http://127.0.0.1:4021'
const JWT_KEY = 'daemon_pro_jwt'

// ---------------------------------------------------------------------------
// Local state (persistence)
// ---------------------------------------------------------------------------

function localProStateRow(): {
  wallet_id: string | null
  wallet_address: string | null
  expires_at: number | null
  features: string | null
  tier: string | null
} | null {
  const db = getDb()
  const row = db.prepare('SELECT wallet_id, wallet_address, expires_at, features, tier FROM pro_state WHERE id = 1').get() as
    | { wallet_id: string | null; wallet_address: string | null; expires_at: number | null; features: string | null; tier: string | null }
    | undefined
  return row ?? null
}

function writeLocalProState(params: {
  walletId: string | null
  walletAddress: string | null
  expiresAt: number | null
  features: ProFeature[]
  tier: 'pro' | null
}): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(`
    INSERT INTO pro_state (id, wallet_id, wallet_address, expires_at, features, tier, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      wallet_id = excluded.wallet_id,
      wallet_address = excluded.wallet_address,
      expires_at = excluded.expires_at,
      features = excluded.features,
      tier = excluded.tier,
      updated_at = excluded.updated_at
  `).run(
    params.walletId,
    params.walletAddress,
    params.expiresAt,
    JSON.stringify(params.features),
    params.tier,
    now,
  )
}

function clearLocalProState(): void {
  getDb().prepare('DELETE FROM pro_state WHERE id = 1').run()
  try { SecureKey.deleteKey(JWT_KEY) } catch { /* nothing to delete */ }
}

/**
 * Derive the UI-facing subscription state from local storage.
 * Does NOT hit the network — called synchronously from IPC on startup and
 * whenever the UI needs a fresh snapshot.
 */
export function getLocalSubscriptionState(): ProSubscriptionState {
  const row = localProStateRow()
  if (!row) {
    return {
      active: false,
      walletId: null,
      walletAddress: null,
      expiresAt: null,
      features: [],
      tier: null,
      priceUsdc: null,
      durationDays: null,
    }
  }
  const features = row.features ? (JSON.parse(row.features) as ProFeature[]) : []
  const active = row.expires_at !== null && row.expires_at > Date.now()
  return {
    active,
    walletId: row.wallet_id,
    walletAddress: row.wallet_address,
    expiresAt: row.expires_at,
    features: active ? features : [],
    tier: active ? (row.tier as 'pro' | null) : null,
    priceUsdc: null,
    durationDays: null,
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

class ProApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function authHeaders(): Record<string, string> {
  const jwt = SecureKey.getKey(JWT_KEY)
  if (!jwt) throw new ProApiError(401, 'Not subscribed to Daemon Pro')
  return { Authorization: `Bearer ${jwt}` }
}

async function proFetch<T>(pathSuffix: string, init: RequestInit = {}): Promise<T> {
  const url = `${DAEMON_PRO_API_BASE}${pathSuffix}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  type Body = { ok?: boolean; data?: T; error?: string }
  let body: Body | null = null
  try {
    body = (await res.json()) as Body
  } catch {
    // Non-JSON body (e.g. 402 challenge that's raw JSON but sometimes plain text)
  }

  if (!res.ok) {
    throw new ProApiError(res.status, body?.error ?? `HTTP ${res.status}`)
  }
  if (body && body.ok === false) {
    throw new ProApiError(res.status, body.error ?? 'API error')
  }
  return (body?.data ?? body) as T
}

// ---------------------------------------------------------------------------
// Price / status
// ---------------------------------------------------------------------------

export async function fetchPrice(): Promise<ProPriceInfo> {
  return proFetch<ProPriceInfo>('/v1/subscribe/price')
}

export async function refreshStatusFromServer(walletAddress: string): Promise<ProSubscriptionState> {
  type StatusResponse = {
    active: boolean
    expiresAt: number | null
    features: ProFeature[]
    quotaRemaining: number | null
    tier: 'pro' | null
  }
  const data = await proFetch<StatusResponse>(`/v1/subscribe/status?wallet=${encodeURIComponent(walletAddress)}`)

  const existing = localProStateRow()
  writeLocalProState({
    walletId: existing?.wallet_id ?? null,
    walletAddress,
    expiresAt: data.expiresAt,
    features: data.features,
    tier: data.tier,
  })

  return getLocalSubscriptionState()
}

// ---------------------------------------------------------------------------
// Subscribe handshake
// ---------------------------------------------------------------------------

export interface SubscribeResult {
  state: ProSubscriptionState
  price: ProPriceInfo
}

/**
 * Run the full x402 subscribe flow end to end.
 *
 * Called with the wallet id the user picked in the Pro panel. That wallet
 * signs the payment payload via withKeypair — same HITL gate as any other
 * wallet action.
 *
 * Flow:
 *   1. Fetch price (for display + amount enforcement)
 *   2. POST /v1/subscribe with no body → expect 402 challenge
 *   3. Build a signed payment payload for the exact terms
 *   4. POST /v1/subscribe with X-Payment header → expect 200 with JWT
 *   5. Persist the JWT in the OS keychain + the effective state in SQLite
 */
export async function subscribe(walletId: string): Promise<SubscribeResult> {
  const price = await fetchPrice()

  // Step 1: trigger the 402 challenge (we don't need to read it — we already
  // know price + payTo from the /price endpoint, and the nonce is client-generated)
  const challengeRes = await fetch(`${DAEMON_PRO_API_BASE}/v1/subscribe`, { method: 'POST' })
  if (challengeRes.status !== 402) {
    throw new ProApiError(
      challengeRes.status,
      `Expected 402 Payment Required, got ${challengeRes.status}`,
    )
  }

  // Step 2: get the wallet address + signed payment payload via withKeypair
  const { walletAddress, paymentHeader } = await withKeypair(walletId, async (keypair) => {
    const walletAddress = keypair.publicKey.toBase58()
    const nonce = crypto.randomUUID()
    const amount = String(Math.round(price.priceUsdc * 1_000_000)) // µUSDC

    // MVP payment payload — hand-rolled JSON wrapped in base64url.
    // The signature here is a placeholder generated by signing a canonical
    // digest of the payload fields with the wallet's keypair. When the server
    // swaps to real @x402/express middleware, this call site will be replaced
    // with `createPaymentPayload` from @x402/svm which emits the full x402
    // PaymentPayload shape the facilitator expects.
    const digest = Buffer.from(`${walletAddress}|${nonce}|${amount}|${price.network}|${price.payTo}`, 'utf8')
    const signature = crypto.createHash('sha256').update(digest).update(keypair.secretKey).digest()

    // Use bs58 (already a runtime dep) to encode the signature in a form the
    // server can round-trip through its future facilitator call.
    const signatureBase58 = bs58.encode(signature)

    const payload = {
      wallet: walletAddress,
      signature: signatureBase58,
      nonce,
      amount,
      network: price.network,
    }
    const header = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    return { walletAddress, paymentHeader: header }
  })

  // Step 3: resend with the X-Payment header
  const paidRes = await fetch(`${DAEMON_PRO_API_BASE}/v1/subscribe`, {
    method: 'POST',
    headers: { 'X-Payment': paymentHeader },
  })
  if (!paidRes.ok) {
    const errBody = await paidRes.json().catch(() => ({ error: `HTTP ${paidRes.status}` })) as { error?: string }
    throw new ProApiError(paidRes.status, errBody.error ?? 'Subscribe failed')
  }

  const body = await paidRes.json() as {
    ok: boolean
    jwt: string
    expiresAt: number
    features: ProFeature[]
    tier: 'pro'
  }
  if (!body.ok || !body.jwt) {
    throw new ProApiError(500, 'Server returned malformed subscribe response')
  }

  // Step 4: persist
  SecureKey.storeKey(JWT_KEY, body.jwt)
  writeLocalProState({
    walletId,
    walletAddress,
    expiresAt: body.expiresAt,
    features: body.features,
    tier: body.tier,
  })

  return {
    state: getLocalSubscriptionState(),
    price,
  }
}

/**
 * Clear the local subscription state + JWT. The server-side subscription row
 * is left intact — this is a "sign out" not a "cancel," and re-subscribing
 * from the same wallet within the 30-day window is a no-op (no new payment).
 */
export function signOut(): void {
  clearLocalProState()
}

// ---------------------------------------------------------------------------
// MCP sync
// ---------------------------------------------------------------------------

interface McpSyncPayload {
  version: 1
  updatedAt: number
  mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>
}

export async function pushMcpSync(payload: Omit<McpSyncPayload, 'version' | 'updatedAt'>): Promise<void> {
  const body: McpSyncPayload = {
    version: 1,
    updatedAt: Date.now(),
    mcpServers: payload.mcpServers,
  }
  await proFetch<{ updatedAt: number }>('/v1/sync/mcp', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
}

export async function pullMcpSync(): Promise<McpSyncPayload | null> {
  return proFetch<McpSyncPayload | null>('/v1/sync/mcp', {
    headers: authHeaders(),
  })
}

/** Read the local ~/.claude.json mcpServers and push it to the server. */
export async function pushLocalClaudeConfig(): Promise<number> {
  const claudeJsonPath = path.join(os.homedir(), '.claude.json')
  if (!fs.existsSync(claudeJsonPath)) return 0
  const json = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8')) as {
    mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>
  }
  const mcpServers = json.mcpServers ?? {}
  await pushMcpSync({ mcpServers })
  return Object.keys(mcpServers).length
}

/** Pull the server's copy and merge into ~/.claude.json (server wins). */
export async function pullMcpConfigToLocal(): Promise<number> {
  const remote = await pullMcpSync()
  if (!remote) return 0
  const claudeJsonPath = path.join(os.homedir(), '.claude.json')
  let current: Record<string, unknown> = {}
  if (fs.existsSync(claudeJsonPath)) {
    try {
      current = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'))
    } catch {
      current = {}
    }
  }
  current.mcpServers = remote.mcpServers
  fs.writeFileSync(claudeJsonPath, JSON.stringify(current, null, 2), 'utf8')
  return Object.keys(remote.mcpServers).length
}

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

export async function listArenaSubmissions(): Promise<ArenaSubmission[]> {
  return proFetch<ArenaSubmission[]>('/v1/arena/submissions', {
    headers: authHeaders(),
  })
}

export async function submitToArena(input: ArenaSubmissionInput): Promise<{ id: string }> {
  return proFetch<{ id: string }>('/v1/arena/submit', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
}

export async function voteArenaSubmission(submissionId: string): Promise<void> {
  await proFetch<{ voted: true }>(`/v1/arena/vote/${encodeURIComponent(submissionId)}`, {
    method: 'POST',
    headers: authHeaders(),
  })
}

// ---------------------------------------------------------------------------
// Pro skills
// ---------------------------------------------------------------------------

function proSkillsLocalDir(): string {
  return path.join(app?.getPath?.('userData') ?? os.homedir(), 'daemon-pro-skills')
}

export async function fetchProSkillsManifest(): Promise<ProSkillManifest> {
  return proFetch<ProSkillManifest>('/v1/pro-skills/manifest', {
    headers: authHeaders(),
  })
}

interface SkillFilesResponse {
  skillId: string
  files: Array<{ path: string; sha256: string; content: string }>
}

/**
 * Download + install a Pro skill locally.
 *
 * Writes to userData/daemon-pro-skills/<id>/ and stores the combined sha256
 * in userData/daemon-pro-skills/<id>/.sha so the next sync can skip unchanged
 * skills without re-downloading.
 */
export async function downloadProSkill(skillId: string): Promise<{ fileCount: number; path: string }> {
  if (!/^[a-zA-Z0-9_-]+$/.test(skillId)) throw new Error('Invalid skill id')

  const data = await proFetch<SkillFilesResponse>(`/v1/pro-skills/${skillId}/files`, {
    headers: authHeaders(),
  })

  const targetDir = path.join(proSkillsLocalDir(), skillId)
  fs.mkdirSync(targetDir, { recursive: true })

  // Clean the directory first so deleted files on the server are reflected locally
  for (const existing of fs.readdirSync(targetDir)) {
    const abs = path.join(targetDir, existing)
    const stat = fs.statSync(abs)
    if (stat.isFile()) fs.unlinkSync(abs)
  }

  for (const file of data.files) {
    // Path traversal guard — reject any file whose resolved path escapes the target dir
    const abs = path.resolve(targetDir, file.path)
    if (!abs.startsWith(targetDir + path.sep) && abs !== targetDir) {
      throw new Error(`Rejected unsafe file path: ${file.path}`)
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, Buffer.from(file.content, 'base64'))
  }

  return { fileCount: data.files.length, path: targetDir }
}

export async function syncAllProSkills(): Promise<{ installed: string[]; skipped: string[] }> {
  const manifest = await fetchProSkillsManifest()
  const installed: string[] = []
  const skipped: string[] = []

  for (const skill of manifest.skills) {
    const shaFile = path.join(proSkillsLocalDir(), skill.id, '.sha')
    const currentSha = fs.existsSync(shaFile) ? fs.readFileSync(shaFile, 'utf8').trim() : null
    if (currentSha === skill.sha256) {
      skipped.push(skill.id)
      continue
    }
    await downloadProSkill(skill.id)
    fs.mkdirSync(path.join(proSkillsLocalDir(), skill.id), { recursive: true })
    fs.writeFileSync(shaFile, skill.sha256)
    installed.push(skill.id)
  }

  return { installed, skipped }
}

// ---------------------------------------------------------------------------
// Priority API
// ---------------------------------------------------------------------------

export interface QuotaInfo {
  quota: number
  used: number
  remaining: number
}

export async function getPriorityApiQuota(): Promise<QuotaInfo> {
  return proFetch<QuotaInfo>('/v1/priority/quota', {
    headers: authHeaders(),
  })
}

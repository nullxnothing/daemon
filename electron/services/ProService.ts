import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { getDb } from '../db/db'
import type {
  ArenaSubmission,
  ArenaSubmissionInput,
  ProFeature,
  ProPriceInfo,
  ProSkillManifest,
  ProSubscriptionState,
} from '../shared/types'
import * as SecureKey from './SecureKeyService'
import { withKeypair } from './SolanaService'
import { transferToken } from './WalletService'
import { getPlanFeatures, normalizePlan } from './EntitlementService'
import { DAEMON_AI_DEFAULT_API_BASE } from './DaemonAICloudClient'

const DEFAULT_PRO_API_BASE =
  process.env.NODE_ENV === 'production'
    ? process.env.DAEMON_AI_API_BASE?.trim() || DAEMON_AI_DEFAULT_API_BASE
    : 'http://127.0.0.1:4021'

const DAEMON_PRO_API_BASE = (process.env.DAEMON_PRO_API_BASE ?? DEFAULT_PRO_API_BASE).replace(/\/+$/, '')
const DEV_BYPASS_ENABLED =
  process.env.NODE_ENV !== 'production' && process.env.DAEMON_PRO_DEV_BYPASS === '1'
const DEV_BYPASS_FEATURES: ProFeature[] = getPlanFeatures('pro')
const DEV_BYPASS_PRICE: ProPriceInfo = {
  priceUsdc: 20,
  durationDays: 30,
  network: 'solana:mainnet',
  payTo: 'GNVxk3sn4iJ2iUaqEUskWQ1KNy9Mmcee3WF3AMtRjN7W',
  holderMint: '4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump',
  holderMinAmount: 1_000_000,
}
const JWT_KEY = 'daemon_pro_jwt'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

const EMPTY_HOLDER_STATUS: ProSubscriptionState['holderStatus'] = {
  enabled: false,
  eligible: false,
  mint: null,
  minAmount: null,
  currentAmount: null,
  symbol: 'DAEMON',
}

function devBypassState(overrides: Partial<ProSubscriptionState> = {}): ProSubscriptionState {
  const expiresAt = Date.now() + DEV_BYPASS_PRICE.durationDays * 24 * 60 * 60 * 1000
  return {
    active: true,
    plan: 'pro',
    walletId: null,
    walletAddress: null,
    expiresAt,
    features: DEV_BYPASS_FEATURES,
    tier: 'pro',
    accessSource: 'dev_bypass',
    holderStatus: {
      enabled: true,
      eligible: true,
      mint: DEV_BYPASS_PRICE.holderMint ?? null,
      minAmount: DEV_BYPASS_PRICE.holderMinAmount ?? null,
      currentAmount: DEV_BYPASS_PRICE.holderMinAmount ?? null,
      symbol: 'DAEMON',
    },
    priceUsdc: DEV_BYPASS_PRICE.priceUsdc,
    durationDays: DEV_BYPASS_PRICE.durationDays,
    ...overrides,
  }
}

function getLocalRow() {
  const row = getDb()
    .prepare('SELECT wallet_id, wallet_address, expires_at, features, tier FROM pro_state WHERE id = 1')
    .get() as
    | {
        wallet_id: string | null
        wallet_address: string | null
        expires_at: number | null
        features: string | null
        tier: string | null
      }
    | undefined
  return row ?? null
}

function writeLocalProState(params: {
  walletId: string | null
  walletAddress: string | null
  expiresAt: number | null
  features: ProFeature[]
  tier: Exclude<ProSubscriptionState['plan'], 'light'> | null
}) {
  getDb()
    .prepare(`
      INSERT INTO pro_state (id, wallet_id, wallet_address, expires_at, features, tier, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        wallet_id = excluded.wallet_id,
        wallet_address = excluded.wallet_address,
        expires_at = excluded.expires_at,
        features = excluded.features,
        tier = excluded.tier,
        updated_at = excluded.updated_at
    `)
    .run(
      params.walletId,
      params.walletAddress,
      params.expiresAt,
      JSON.stringify(params.features),
      params.tier,
      Date.now(),
    )
}

function clearLocalProState() {
  getDb().prepare('DELETE FROM pro_state WHERE id = 1').run()
  try {
    SecureKey.deleteKey(JWT_KEY)
  } catch {
    // no-op
  }
}

export function getLocalSubscriptionState(): ProSubscriptionState {
  if (DEV_BYPASS_ENABLED) {
    const row = getLocalRow()
    if (!row) return devBypassState()
    return devBypassState({
      walletId: row.wallet_id,
      walletAddress: row.wallet_address,
      expiresAt: row.expires_at,
      features: row.features ? (JSON.parse(row.features) as ProFeature[]) : DEV_BYPASS_FEATURES,
      tier: normalizePlan(row.tier) === 'light' ? 'pro' : normalizePlan(row.tier) as Exclude<ProSubscriptionState['plan'], 'light'>,
    })
  }

  const row = getLocalRow()
  if (!row) {
    return {
      active: false,
      plan: 'light',
      walletId: null,
      walletAddress: null,
      expiresAt: null,
      features: [],
      tier: null,
      accessSource: 'free',
      holderStatus: EMPTY_HOLDER_STATUS,
      priceUsdc: null,
      durationDays: null,
    }
  }

  const active = row.expires_at !== null && row.expires_at > Date.now()
  return {
    active,
    plan: active ? normalizePlan(row.tier) : 'light',
    walletId: row.wallet_id,
    walletAddress: row.wallet_address,
    expiresAt: row.expires_at,
    features: active && row.features ? (JSON.parse(row.features) as ProFeature[]) : [],
    tier: active ? (normalizePlan(row.tier) === 'light' ? null : normalizePlan(row.tier) as Exclude<ProSubscriptionState['plan'], 'light'>) : null,
    accessSource: active ? 'payment' : 'free',
    holderStatus: EMPTY_HOLDER_STATUS,
    priceUsdc: null,
    durationDays: null,
  }
}

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
  const response = await fetch(`${DAEMON_PRO_API_BASE}${pathSuffix}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  type ApiBody = { ok?: boolean; data?: T; error?: string }
  let body: ApiBody | null = null
  try {
    body = (await response.json()) as ApiBody
  } catch {
    body = null
  }

  if (!response.ok) {
    throw new ProApiError(response.status, body?.error ?? `HTTP ${response.status}`)
  }
  if (body && body.ok === false) {
    throw new ProApiError(response.status, body.error ?? 'API error')
  }

  return (body?.data ?? body) as T
}

export async function fetchPrice(): Promise<ProPriceInfo> {
  if (DEV_BYPASS_ENABLED) return DEV_BYPASS_PRICE
  return proFetch<ProPriceInfo>('/v1/subscribe/price')
}

export async function refreshStatusFromServer(walletAddress: string): Promise<ProSubscriptionState> {
  if (DEV_BYPASS_ENABLED) {
    const row = getLocalRow()
    writeLocalProState({
      walletId: row?.wallet_id ?? null,
      walletAddress,
      expiresAt: row?.expires_at ?? Date.now() + DEV_BYPASS_PRICE.durationDays * 24 * 60 * 60 * 1000,
      features: row?.features ? (JSON.parse(row.features) as ProFeature[]) : DEV_BYPASS_FEATURES,
      tier: 'pro',
    })
    return getLocalSubscriptionState()
  }

  const data = await proFetch<{
    active: boolean
    expiresAt: number | null
    features: ProFeature[]
    tier: Exclude<ProSubscriptionState['plan'], 'light'> | null
    plan?: ProSubscriptionState['plan']
    accessSource: ProSubscriptionState['accessSource']
    holderStatus: ProSubscriptionState['holderStatus']
  }>(`/v1/subscribe/status?wallet=${encodeURIComponent(walletAddress)}`)

  const row = getLocalRow()
  writeLocalProState({
    walletId: row?.wallet_id ?? null,
    walletAddress,
    expiresAt: data.expiresAt,
    features: data.features,
    tier: normalizePlan(data.plan ?? data.tier) === 'light' ? null : normalizePlan(data.plan ?? data.tier) as Exclude<ProSubscriptionState['plan'], 'light'>,
  })

  return {
    ...getLocalSubscriptionState(),
    plan: normalizePlan(data.plan ?? data.tier),
    accessSource: data.accessSource,
    holderStatus: data.holderStatus,
  }
}

export async function subscribe(walletId: string): Promise<{ state: ProSubscriptionState; price: ProPriceInfo }> {
  if (DEV_BYPASS_ENABLED) {
    const price = await fetchPrice()
    const walletAddress = await withKeypair(walletId, async (keypair) => keypair.publicKey.toBase58())
    writeLocalProState({
      walletId,
      walletAddress,
      expiresAt: Date.now() + price.durationDays * 24 * 60 * 60 * 1000,
      features: DEV_BYPASS_FEATURES,
      tier: 'pro',
    })
    return { state: getLocalSubscriptionState(), price }
  }

  const price = await fetchPrice()
  const challengeRes = await fetch(`${DAEMON_PRO_API_BASE}/v1/subscribe`, { method: 'POST' })
  if (challengeRes.status !== 402) {
    throw new ProApiError(challengeRes.status, `Expected 402 Payment Required, got ${challengeRes.status}`)
  }

  const walletAddress = await withKeypair(walletId, async (keypair) => keypair.publicKey.toBase58())
  const payment = await transferToken(
    walletId,
    price.payTo,
    price.paymentMint ?? USDC_MINT,
    price.priceUsdc,
  )
  const paymentHeader = Buffer.from(
    JSON.stringify({
      wallet: walletAddress,
      txSignature: payment.signature,
      amount: price.priceUsdc,
      network: price.network,
      payTo: price.payTo,
      mint: price.paymentMint ?? USDC_MINT,
    }),
    'utf8',
  ).toString('base64url')

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
    plan?: ProSubscriptionState['plan']
  }
  if (!body.ok || !body.jwt) throw new ProApiError(500, 'Server returned malformed subscribe response')

  SecureKey.storeKey(JWT_KEY, body.jwt)
  writeLocalProState({
    walletId,
    walletAddress,
    expiresAt: body.expiresAt,
    features: body.features,
    tier: normalizePlan(body.plan ?? body.tier) === 'light' ? 'pro' : normalizePlan(body.plan ?? body.tier) as Exclude<ProSubscriptionState['plan'], 'light'>,
  })

  return { state: getLocalSubscriptionState(), price }
}

export async function claimHolderAccess(walletId: string): Promise<{ state: ProSubscriptionState }> {
  if (DEV_BYPASS_ENABLED) {
    const walletAddress = await withKeypair(walletId, async (keypair) => keypair.publicKey.toBase58())
    writeLocalProState({
      walletId,
      walletAddress,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
      features: DEV_BYPASS_FEATURES,
      tier: 'pro',
    })
    return { state: devBypassState({ walletId, walletAddress }) }
  }

  const { walletAddress, challenge, signature } = await withKeypair(walletId, async (keypair) => {
    const walletAddress = keypair.publicKey.toBase58()
    const challenge = await proFetch<{
      nonce: string
      message: string
      holderStatus: ProSubscriptionState['holderStatus']
    }>('/v1/subscribe/holder/challenge', {
      method: 'POST',
      body: JSON.stringify({ wallet: walletAddress }),
    })
    const messageBytes = Buffer.from(challenge.message, 'utf8')
    return {
      walletAddress,
      challenge,
      signature: bs58.encode(nacl.sign.detached(messageBytes, keypair.secretKey)),
    }
  })

  const body = await proFetch<{
    jwt: string
    expiresAt: number
    features: ProFeature[]
    tier: 'pro'
    plan?: ProSubscriptionState['plan']
  }>('/v1/subscribe/holder/claim', {
    method: 'POST',
    body: JSON.stringify({
      wallet: walletAddress,
      nonce: challenge.nonce,
      signature,
    }),
  })

  SecureKey.storeKey(JWT_KEY, body.jwt)
  writeLocalProState({
    walletId,
    walletAddress,
    expiresAt: body.expiresAt,
    features: body.features,
    tier: normalizePlan(body.plan ?? body.tier) === 'light' ? 'pro' : normalizePlan(body.plan ?? body.tier) as Exclude<ProSubscriptionState['plan'], 'light'>,
  })

  return {
    state: {
      ...getLocalSubscriptionState(),
      plan: normalizePlan(body.plan ?? body.tier),
      accessSource: 'holder',
      holderStatus: challenge.holderStatus,
    },
  }
}

export function signOut(): void {
  clearLocalProState()
}

function devArenaFilePath(): string {
  return path.join(app?.getPath?.('userData') ?? os.homedir(), 'daemon-pro-dev-arena.json')
}

function readDevArenaSubmissions(): ArenaSubmission[] {
  const filePath = devArenaFilePath()
  if (!fs.existsSync(filePath)) {
    const seed: ArenaSubmission[] = [
      {
        id: 'arena-seed-1',
        title: 'Discord research copilot',
        pitch: 'Turns winning research threads into concrete DAEMON tasks.',
        author: { handle: 'daemon', wallet: 'dev-wallet' },
        description: 'Cross-posts high-signal research into Discord and turns winning threads into actionable DAEMON tasks.',
        category: 'agent',
        themeWeek: 'spring-build',
        submittedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        status: 'featured',
        votes: 9,
        githubUrl: 'https://github.com/daemon/example-discord-copilot',
        demoUrl: 'https://example.com/discord-copilot-demo',
        xHandle: 'daemon',
        discordHandle: 'daemonteam',
        contestSlug: 'build-week-01',
      },
    ]
    fs.writeFileSync(filePath, JSON.stringify(seed, null, 2), 'utf8')
    return seed
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ArenaSubmission[]
  } catch {
    return []
  }
}

function writeDevArenaSubmissions(submissions: ArenaSubmission[]) {
  fs.writeFileSync(devArenaFilePath(), JSON.stringify(submissions, null, 2), 'utf8')
}

export async function listArenaSubmissions(): Promise<ArenaSubmission[]> {
  if (DEV_BYPASS_ENABLED) return readDevArenaSubmissions()
  return proFetch<ArenaSubmission[]>('/v1/arena/submissions', { headers: authHeaders() })
}

export async function submitToArena(input: ArenaSubmissionInput): Promise<{ id: string }> {
  if (DEV_BYPASS_ENABLED) {
    const next: ArenaSubmission = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      pitch: input.pitch.trim(),
      author: { handle: 'you', wallet: getLocalRow()?.wallet_address ?? 'dev-wallet' },
      description: input.description.trim(),
      category: input.category,
      themeWeek: 'spring-build',
      submittedAt: Date.now(),
      status: 'submitted',
      votes: 0,
      githubUrl: input.githubUrl.trim(),
      demoUrl: input.demoUrl?.trim() || undefined,
      xHandle: input.xHandle?.trim().replace(/^@/, '') || undefined,
      discordHandle: input.discordHandle?.trim() || undefined,
      contestSlug: 'build-week-01',
    }
    writeDevArenaSubmissions([next, ...readDevArenaSubmissions()])
    return { id: next.id }
  }

  return proFetch<{ id: string }>('/v1/arena/submit', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input),
  })
}

export async function voteArenaSubmission(submissionId: string): Promise<void> {
  if (DEV_BYPASS_ENABLED) {
    const submissions = readDevArenaSubmissions()
    const index = submissions.findIndex((submission) => submission.id === submissionId)
    if (index >= 0) {
      submissions[index] = { ...submissions[index], votes: submissions[index].votes + 1 }
      writeDevArenaSubmissions(submissions)
    }
    return
  }

  await proFetch<{ voted: true }>(`/v1/arena/vote/${encodeURIComponent(submissionId)}`, {
    method: 'POST',
    headers: authHeaders(),
  })
}

function proSkillsLocalDir(): string {
  return path.join(app?.getPath?.('userData') ?? os.homedir(), 'daemon-pro-skills')
}

function claudeConfigPath(): string {
  const homeDir = process.env.DAEMON_MCP_HOME_DIR?.trim() || os.homedir()
  return path.join(homeDir, '.claude.json')
}

export async function fetchProSkillsManifest(): Promise<ProSkillManifest> {
  if (DEV_BYPASS_ENABLED) return { version: 1, skills: [] }
  return proFetch<ProSkillManifest>('/v1/pro-skills/manifest', { headers: authHeaders() })
}

export async function downloadProSkill(skillId: string): Promise<{ fileCount: number; path: string }> {
  if (!/^[a-zA-Z0-9_-]+$/.test(skillId)) throw new Error('Invalid skill id')
  if (DEV_BYPASS_ENABLED) {
    const targetDir = path.join(proSkillsLocalDir(), skillId)
    fs.mkdirSync(targetDir, { recursive: true })
    return { fileCount: 0, path: targetDir }
  }

  const data = await proFetch<{
    skillId: string
    files: Array<{ path: string; sha256: string; content: string }>
  }>(`/v1/pro-skills/${skillId}/files`, { headers: authHeaders() })

  const targetDir = path.join(proSkillsLocalDir(), skillId)
  fs.mkdirSync(targetDir, { recursive: true })
  for (const file of data.files) {
    const absolutePath = path.resolve(targetDir, file.path)
    if (!absolutePath.startsWith(targetDir + path.sep) && absolutePath !== targetDir) {
      throw new Error(`Rejected unsafe file path: ${file.path}`)
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, Buffer.from(file.content, 'base64'))
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

export async function getPriorityApiQuota(): Promise<{ quota: number; used: number; remaining: number }> {
  if (DEV_BYPASS_ENABLED) return { quota: 500, used: 0, remaining: 500 }
  return proFetch<{ quota: number; used: number; remaining: number }>('/v1/priority/quota', {
    headers: authHeaders(),
  })
}

export async function pushLocalClaudeConfig(): Promise<number> {
  if (DEV_BYPASS_ENABLED) return 0
  const claudeJsonPath = claudeConfigPath()
  if (!fs.existsSync(claudeJsonPath)) return 0
  const json = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8')) as {
    mcpServers?: Record<string, { command: string; args: string[]; env?: Record<string, string> }>
  }
  const mcpServers = json.mcpServers ?? {}
  await proFetch<{ updatedAt: number }>('/v1/sync/mcp', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ version: 1, updatedAt: Date.now(), mcpServers }),
  })
  return Object.keys(mcpServers).length
}

export async function pullMcpConfigToLocal(): Promise<number> {
  if (DEV_BYPASS_ENABLED) return 0
  const remote = await proFetch<{
    version: 1
    updatedAt: number
    mcpServers: Record<string, { command: string; args: string[]; env?: Record<string, string> }>
  } | null>('/v1/sync/mcp', { headers: authHeaders() })
  if (!remote) return 0

  const claudeJsonPath = claudeConfigPath()
  let current: Record<string, unknown> = {}
  if (fs.existsSync(claudeJsonPath)) {
    try {
      current = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'))
    } catch {
      current = {}
    }
  }
  current.mcpServers = remote.mcpServers
  fs.mkdirSync(path.dirname(claudeJsonPath), { recursive: true })
  fs.writeFileSync(claudeJsonPath, JSON.stringify(current, null, 2), 'utf8')
  return Object.keys(remote.mcpServers).length
}

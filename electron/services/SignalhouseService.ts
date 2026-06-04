import type {
  SignalhouseHealth,
  SignalhouseStatus,
  SignalhouseStrategy,
  SignalhouseStrategyDetail,
  SignalhouseEquityPoint,
  SignalhouseVerdict,
  SignalhousePosition,
} from '../shared/types'

export type {
  SignalhouseHealth,
  SignalhouseStatus,
  SignalhouseStrategy,
  SignalhouseStrategyDetail,
  SignalhouseEquityPoint,
  SignalhouseVerdict,
  SignalhousePosition,
}

// Signalhouse — copy-trading intelligence for Solana perps on Drift.
// Phase 1 is read-only: leaderboard, strategy detail, equity history, and live activity feeds.
// Follow/copy/delegation signing is money-affecting and must go behind SignerGuardService + a
// transaction preview before being wired here.
const SIGNALHOUSE_API_BASE = process.env.DAEMON_SIGNALHOUSE_API_URL || 'https://signalhouse-api.onrender.com'
const REQUEST_TIMEOUT_MS = 12_000
const MAX_FEED_LIMIT = 50

export type LeaderboardWindow = '24h' | '7d' | '30d' | 'all'
export type LeaderboardSort = 'proof_of_edge' | 'realized_pnl' | 'drawdown' | 'copy_safety' | 'stake'

export interface LeaderboardOptions {
  window?: LeaderboardWindow
  sort?: LeaderboardSort
  market?: string
  riskLevel?: string
  limit?: number
}

// ----------------------------------------------------------------- helpers ---

async function fetchJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const url = `${SIGNALHOUSE_API_BASE}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (response.status === 404) return { status: 404, body: null }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Signalhouse request failed (${response.status}): ${text.slice(0, 180)}`)
    }
    const body = (await response.json()) as T
    return { status: response.status, body }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Signalhouse request timed out')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function requireId(id: string): string {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Strategy id is required')
  return encodeURIComponent(id.trim())
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return fallback
  return Math.min(Math.floor(limit), MAX_FEED_LIMIT)
}

function asArray(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value
  const wrapped = (value as Record<string, unknown> | null)?.[key]
  return Array.isArray(wrapped) ? wrapped : []
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

// ---------------------------------------------------------------- mappers ---

function mapStrategy(raw: Record<string, unknown>): SignalhouseStrategy {
  return {
    id: str(raw.id) ?? '',
    name: str(raw.name),
    status: str(raw.status),
    creatorType: str(raw.creatorType),
    market: str(raw.market),
    riskLevel: str(raw.riskLevel),
    proofOfEdge: num(raw.proofOfEdge),
    proofOfEdgeVerificationStatus: str(raw.proofOfEdgeVerificationStatus),
    realizedPnlUsd: num(raw.realizedPnlUsd),
    drawdownBps: num(raw.drawdownBps),
    followerCount: num(raw.followerCount),
  }
}

function mapPosition(raw: Record<string, unknown>): SignalhousePosition {
  return {
    id: str(raw.id) ?? '',
    market: str(raw.market),
    side: str(raw.side),
    sizeUsd: num(raw.sizeUsd),
    unrealizedPnlUsd: num(raw.unrealizedPnlUsd),
  }
}

function mapVerdict(raw: Record<string, unknown>): SignalhouseVerdict {
  return {
    id: str(raw.id) ?? '',
    market: str(raw.market),
    side: str(raw.side),
    sizeUsd: num(raw.sizeUsd),
    approved: Boolean(raw.approved),
    verdict: str(raw.verdict),
    at: str(raw.at),
  }
}

// ------------------------------------------------------------------ reads ---

export async function getHealth(): Promise<SignalhouseHealth> {
  const { body } = await fetchJson<Record<string, unknown>>('/health')
  return {
    ok: Boolean(body?.ok),
    service: str(body?.service),
    time: str(body?.time),
  }
}

export async function getStatus(): Promise<SignalhouseStatus> {
  const { body } = await fetchJson<Record<string, unknown>>('/status')
  if (!body) return { indexerFresh: null, indexerLagSeconds: null, globalExecutionPaused: null }
  return {
    indexerFresh: typeof body.indexerFresh === 'boolean' ? body.indexerFresh : null,
    indexerLagSeconds: num(body.indexerLagSeconds),
    globalExecutionPaused: typeof body.globalExecutionPaused === 'boolean' ? body.globalExecutionPaused : null,
  }
}

export async function getLeaderboard(opts: LeaderboardOptions = {}): Promise<SignalhouseStrategy[]> {
  const params = new URLSearchParams()
  if (opts.window) params.set('window', opts.window)
  if (opts.sort) params.set('sort', opts.sort)
  if (opts.market) params.set('market', opts.market)
  if (opts.riskLevel) params.set('riskLevel', opts.riskLevel)
  params.set('limit', String(clampLimit(opts.limit, 25)))
  const { body } = await fetchJson<unknown>(`/leaderboards/strategies?${params.toString()}`)
  return asArray(body, 'items').map((row) => mapStrategy(row as Record<string, unknown>))
}

export async function getStrategy(id: string): Promise<SignalhouseStrategyDetail | null> {
  const { status, body } = await fetchJson<Record<string, unknown>>(`/strategies/${requireId(id)}`)
  if (status === 404 || !body) return null
  const detail = (body.strategy ?? body) as Record<string, unknown>
  return {
    ...mapStrategy(detail),
    description: str(detail.description),
    allowedMarkets: strArray(detail.allowedMarkets),
    maxLeverage: num(detail.maxLeverage),
    positions: asArray(body.positions ?? detail.positions, 'positions').map((p) =>
      mapPosition(p as Record<string, unknown>),
    ),
  }
}

export async function getStrategyHistory(id: string): Promise<SignalhouseEquityPoint[]> {
  const { body } = await fetchJson<unknown>(`/strategies/${requireId(id)}/history`)
  return asArray(body, 'points').map((p) => {
    const raw = p as Record<string, unknown>
    return { at: str(raw.at), equityUsd: num(raw.equityUsd), realizedPnlUsd: num(raw.realizedPnlUsd) }
  })
}

export async function getVerdicts(limit = 12): Promise<SignalhouseVerdict[]> {
  const { body } = await fetchJson<unknown>(`/activity/verdicts?limit=${clampLimit(limit, 12)}`)
  return asArray(body, 'items').map((row) => mapVerdict(row as Record<string, unknown>))
}

export async function getPositions(limit = 12): Promise<SignalhousePosition[]> {
  const { body } = await fetchJson<unknown>(`/activity/positions?limit=${clampLimit(limit, 12)}`)
  return asArray(body, 'items').map((row) => mapPosition(row as Record<string, unknown>))
}

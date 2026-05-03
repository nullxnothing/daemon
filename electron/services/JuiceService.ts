import * as SecureKey from './SecureKeyService'

const JUICE_API_KEY_NAME = 'JUICE_API_KEY'
const JUICE_BASE_URL = 'https://api.juiceeverything.com'
const JUICE_MM_API_BASE = `${JUICE_BASE_URL}/api/mm-api`
const JUICE_KEY_RE = /^[a-f0-9]{96}$/i

export interface JuiceApiEnvelope<T> {
  success: boolean
  data?: T
  message?: string
}

export interface JuiceWallet {
  id: string
  publicKey: string
  mint: string | null
  symbol?: string | null
  name?: string | null
  isActive: boolean
  deactivatedAt?: string | null
  deactivationReason?: string | null
  deactivationPrice?: number | null
  strategyId?: string | null
  stopLossPrice?: number | null
  takeProfitPrice?: number | null
  tpOnly?: boolean
  accumulation?: boolean
  lowSpeed?: boolean
  createdAt?: string
}

export interface JuiceBalance {
  mint: string
  balance: number
  decimals: number
}

export interface JuiceWalletBalances {
  mmTokenId: string
  publicKey: string
  mint: string | null
  solBalance: number
  tokenBalances: JuiceBalance[]
}

export interface JuicePnlSummary {
  totalUsd: number
  totalPercent: number
  realizedUsd: number
  realizedPercent: number
  unrealizedUsd: number
  unrealizedPercent: number
  avgProfitPerTradeUsd?: number
}

export interface JuiceWalletPnl {
  mmTokenId: string
  mint: string
  symbol?: string
  walletAddress: string
  pnl: JuicePnlSummary
  fetchedAt?: string
}

export interface JuiceMintDetails {
  mint: string
  wallets: number
  totalSolBalance: number
  totalSolValueUsd: number
  totalTokenBalance: number
  totalTokenValueUsd: number
  totalPositionUsd: number
  tokenPrice: number
  solPrice: number
  liquidity: number
  marketCap: number
  volume24h: number
  positionToLiquidity: number
  walletMultiplier: number
  overcrowdingLevel: number
}

export interface JuiceScoutToken {
  mint: string
  symbol: string
  name: string
  logoURI?: string | null
  decimals?: number
  price: number
  marketCap: number
  liquidity: number
  holder?: number
  volume1hUsd?: number
  volume1hChangePercent?: number
  volume24hUsd?: number
  volume24hChangePercent?: number
  priceChange1hPercent?: number
  priceChange24hPercent?: number
  trade1hCount?: number
  trade24hCount?: number
  score: number
  maxScore: number
  grade: string
  momentumSignal?: number
  priceAction?: Record<string, unknown>
  security?: Record<string, unknown>
  liquidityAnalysis?: Record<string, unknown>
}

export interface JuiceScoutingReport {
  tokens: JuiceScoutToken[]
  tokenCount: number
  scannedAt: string
}

export function validateJuiceApiKey(value: string) {
  const trimmed = value.trim()
  if (!JUICE_KEY_RE.test(trimmed)) {
    throw new Error('Juice API key must be a 96-character hex string')
  }
  return trimmed
}

export function hasJuiceKey() {
  return Boolean(SecureKey.getKey(JUICE_API_KEY_NAME))
}

export function deleteJuiceKey() {
  SecureKey.deleteKey(JUICE_API_KEY_NAME)
}

export async function storeJuiceKey(value: string) {
  const apiKey = validateJuiceApiKey(value)
  await juiceRequest<JuiceWallet[]>('/tokens', { apiKey })
  SecureKey.storeKey(JUICE_API_KEY_NAME, apiKey)
}

export function listWallets() {
  return juiceRequest<JuiceWallet[]>('/tokens')
}

export function getBalances(walletId: string) {
  return juiceRequest<JuiceWalletBalances>(`/tokens/${encodeURIComponent(walletId)}/balances`)
}

export function getPnl(walletId: string) {
  return juiceRequest<JuiceWalletPnl>(`/tokens/${encodeURIComponent(walletId)}/pnl`)
}

export function getMintDetails(mint: string) {
  return juiceRequest<JuiceMintDetails>(`/mints/${encodeURIComponent(mint)}`)
}

export function getScoutingReport() {
  return juiceRequest<JuiceScoutingReport>('/scouting-report')
}

async function juiceRequest<T>(path: string, opts: { method?: 'GET'; apiKey?: string } = {}): Promise<T> {
  const apiKey = opts.apiKey ?? SecureKey.getKey(JUICE_API_KEY_NAME)
  if (!apiKey) {
    throw new Error('JUICE_API_KEY is not configured')
  }

  const res = await fetch(`${JUICE_MM_API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
  })

  const json = await res.json().catch(() => null) as JuiceApiEnvelope<T> | null
  if (!res.ok || !json?.success) {
    throw new Error(json?.message ?? `Juice API request failed with status ${res.status}`)
  }
  if (typeof json.data === 'undefined') {
    throw new Error('Juice API response did not include a data payload')
  }

  return json.data
}

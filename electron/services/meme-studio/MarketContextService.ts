import { getKey } from '../SecureKeyService'
import type { MemeMarketSnapshot, TokenRiskPreflight } from './types'

const BIRDEYE_BASE_URL = 'https://public-api.birdeye.so'
const DEXSCREENER_BASE_URL = 'https://api.dexscreener.com'
const CACHE_TTL_MS = 30_000
const REQUEST_TIMEOUT_MS = 8_000
const BASE58_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const snapshotCache = new Map<string, { expiresAt: number; value: MemeMarketSnapshot }>()
type JsonRecord = Record<string, unknown>

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

async function requestJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`)
  return response.json()
}

function birdeyeKey(): string | null {
  return process.env.BIRDEYE_API_KEY?.trim() || getKey('BIRDEYE_API_KEY')?.trim() || null
}

function validateMint(mint: string): string {
  const value = mint?.trim()
  if (!BASE58_MINT.test(value)) throw new Error('Enter a valid Solana mint address')
  return value
}

async function fetchBirdeye(mint: string): Promise<{ overview: JsonRecord; trade: JsonRecord }> {
  const apiKey = birdeyeKey()
  if (!apiKey) throw new Error('Birdeye is not configured. Add BIRDEYE_API_KEY in Lite Settings.')
  const headers = { 'X-API-KEY': apiKey, 'x-chain': 'solana', accept: 'application/json' }
  const encoded = encodeURIComponent(mint)
  const [overviewResponse, tradeResponse] = await Promise.all([
    requestJson(`${BIRDEYE_BASE_URL}/defi/token_overview?address=${encoded}`, headers),
    requestJson(`${BIRDEYE_BASE_URL}/defi/v3/token/trade-data/single?address=${encoded}`, headers),
  ])
  return {
    overview: recordValue(recordValue(overviewResponse).data),
    trade: recordValue(recordValue(tradeResponse).data),
  }
}

async function fetchDexScreener(mint: string): Promise<JsonRecord> {
  const response = await requestJson(`${DEXSCREENER_BASE_URL}/token-pairs/v1/solana/${encodeURIComponent(mint)}`)
  const pairs = Array.isArray(response) ? response : []
  return pairs.reduce<JsonRecord>((best, candidate, index) => {
    const row = recordValue(candidate)
    const rowLiquidity = numberValue(recordValue(row.liquidity).usd) ?? 0
    const bestLiquidity = numberValue(recordValue(best.liquidity).usd) ?? 0
    return index === 0 || rowLiquidity > bestLiquidity ? row : best
  }, {})
}

function relativeDivergence(left: number | null, right: number | null): number | null {
  if (left === null || right === null || left === 0) return null
  return Math.abs(left - right) / Math.abs(left)
}

export async function readMemeMarketContext(rawMint: string): Promise<MemeMarketSnapshot> {
  const mint = validateMint(rawMint)
  const cached = snapshotCache.get(mint)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const observedAt = Date.now()
  const [birdeyeResult, dexResult] = await Promise.allSettled([fetchBirdeye(mint), fetchDexScreener(mint)])
  if (birdeyeResult.status === 'rejected' && dexResult.status === 'rejected') throw new Error('Birdeye and DEX Screener are unavailable. Check the API key, connection, and mint address.')
  const overview = birdeyeResult.status === 'fulfilled' ? birdeyeResult.value.overview : {}
  const trade = birdeyeResult.status === 'fulfilled' ? birdeyeResult.value.trade : {}
  const dex = dexResult.status === 'fulfilled' ? dexResult.value : {}
  const dexLiquidity = numberValue(recordValue(dex.liquidity).usd)
  const dexPrice = numberValue(dex.priceUsd)
  const birdeyeLiquidity = numberValue(overview.liquidity)
  const birdeyePrice = numberValue(overview.price)
  const divergences: string[] = []
  if ((relativeDivergence(birdeyePrice, dexPrice) ?? 0) > 0.05) divergences.push('Price differs by more than 5% across providers.')
  if ((relativeDivergence(birdeyeLiquidity, dexLiquidity) ?? 0) > 0.35) divergences.push('Liquidity differs by more than 35% across providers.')
  const h1Transactions = recordValue(recordValue(dex.txns).h1)
  const dexTradeCount = (numberValue(h1Transactions.buys) ?? 0) + (numberValue(h1Transactions.sells) ?? 0)
  const snapshot: MemeMarketSnapshot = {
    mint,
    symbol: typeof overview.symbol === 'string' ? overview.symbol : typeof recordValue(dex.baseToken).symbol === 'string' ? String(recordValue(dex.baseToken).symbol) : null,
    name: typeof overview.name === 'string' ? overview.name : typeof recordValue(dex.baseToken).name === 'string' ? String(recordValue(dex.baseToken).name) : null,
    observedAt,
    priceUsd: birdeyePrice ?? dexPrice,
    liquidityUsd: birdeyeLiquidity ?? dexLiquidity,
    marketCapUsd: numberValue(overview.mc) ?? numberValue(dex.marketCap) ?? numberValue(dex.fdv),
    volume1hUsd: numberValue(trade.volume_1h_usd) ?? numberValue(recordValue(dex.volume).h1),
    volume24hUsd: numberValue(overview.v24hUSD) ?? numberValue(recordValue(dex.volume).h24),
    trades1h: numberValue(trade.trade_1h) ?? (dexTradeCount || null),
    uniqueWallets1h: numberValue(trade.unique_wallet_1h),
    holders: numberValue(overview.holder),
    priceChange1hPercent: numberValue(trade.price_change_1h_percent) ?? numberValue(recordValue(dex.priceChange).h1),
    boosts: numberValue(recordValue(dex.boosts).active),
    divergences,
    sources: [
      ...(birdeyeResult.status === 'fulfilled' ? [{ provider: 'birdeye' as const, fetchedAt: observedAt, stale: false }] : []),
      ...(dexResult.status === 'fulfilled' ? [{ provider: 'dexscreener' as const, fetchedAt: observedAt, stale: false }] : []),
    ],
    degraded: birdeyeResult.status === 'rejected' || dexResult.status === 'rejected',
  }
  snapshotCache.set(mint, { expiresAt: observedAt + CACHE_TTL_MS, value: snapshot })
  return snapshot
}

function authorityFact(label: string, value: unknown): TokenRiskPreflight['facts'][number] {
  if (value === null || value === undefined || value === '') return { label, value: 'Unknown', status: 'unknown' }
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : value
  const enabled = normalized === true || (typeof normalized === 'string' && !['false', '0', 'disabled', 'none', 'null'].includes(normalized) && normalized.length > 0)
  return { label, value: enabled ? 'Enabled' : 'Disabled', status: enabled ? 'danger' : 'good' }
}

export async function readTokenRiskPreflight(rawMint: string): Promise<TokenRiskPreflight> {
  const mint = validateMint(rawMint)
  const apiKey = birdeyeKey()
  if (!apiKey) throw new Error('Birdeye is not configured. Add BIRDEYE_API_KEY in Lite Settings.')
  const response = recordValue(await requestJson(`${BIRDEYE_BASE_URL}/defi/token_security?address=${encodeURIComponent(mint)}`, {
    'X-API-KEY': apiKey, 'x-chain': 'solana', accept: 'application/json',
  }))
  const security = recordValue(response.data)
  const facts: TokenRiskPreflight['facts'] = [
    authorityFact('Mint authority', security.mintAuthority),
    authorityFact('Freeze authority', security.freezeAuthority),
    authorityFact('Transfer fee', security.transferFeeEnable),
    authorityFact('Non-transferable', security.nonTransferable),
  ]
  const topTenRaw = numberValue(security.top10HolderPercent)
  const topTenPercent = topTenRaw === null ? null : topTenRaw <= 1 ? topTenRaw * 100 : topTenRaw
  facts.push(topTenPercent === null
    ? { label: 'Top 10 holders', value: 'Unknown', status: 'unknown' }
    : { label: 'Top 10 holders', value: `${topTenPercent.toFixed(1)}%`, status: topTenPercent > 40 ? 'danger' : topTenPercent > 20 ? 'warning' : 'good' })
  const dangerous = facts.some((fact) => fact.status === 'danger')
  const unknowns = facts.filter((fact) => fact.status === 'unknown').map((fact) => `${fact.label} could not be verified.`)
  return { mint, observedAt: Date.now(), risk: dangerous ? 'high' : unknowns.length ? 'unknown' : 'review', facts, unknowns, attentionIsNotTrust: true, sources: ['Birdeye token security'] }
}

export function clearMemeMarketCache(): void { snapshotCache.clear() }

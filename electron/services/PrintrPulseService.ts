const PRINTR_PULSE_CHAINS = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
const PRINTR_PULSE_BASE_URL = 'https://app.printr.money/api/v2/getPulseTokens'
const CACHE_TTL_MS = 30_000

export type PulseCategory = 'newly-created' | 'almost-graduated' | 'graduated'

type PrintrPulseTokenRecord = {
  id?: string
  name?: string
  symbol?: string
  imageUrl?: string | null
  creator?: string | null
  createdAt?: number | string | null
  deployments?: number | null
  contractAddress?: string | null
  externalUrlX?: string | null
  externalUrlWebsite?: string | null
  metrics?: {
    trend?: number | null
    aggregatedGraduationProgressPercentage?: number | null
    combinedCirculatingMarketCap?: number | null
    combinedVolume24?: number | null
    combinedHolders?: number | null
    combinedTxnCount24?: number | null
    combinedBuyCount24?: number | null
    combinedSellCount24?: number | null
  } | null
  contractAddressByChain?: Record<string, string> | null
  graduatedChains?: string[] | null
}

type CacheEntry = {
  ts: number
  data: PulseTokenFeed
}

const cache = new Map<string, CacheEntry>()

export interface PulseTokenMetrics {
  trend: number | null
  graduationProgress: number | null
  marketCapUsd: number | null
  volume24Usd: number | null
  holders: number | null
  txnCount24: number | null
  buyCount24: number | null
  sellCount24: number | null
}

export interface PulseToken {
  id: string
  category: PulseCategory
  name: string
  symbol: string
  imageUrl: string | null
  creator: string | null
  createdAt: number | null
  deployments: number | null
  contractAddress: string
  contractAddressByChain: Record<string, string>
  graduatedChains: string[]
  externalUrlX: string | null
  externalUrlWebsite: string | null
  metrics: PulseTokenMetrics
}

export interface PulseTokenFeed {
  category: PulseCategory
  pageNumber: number
  pageSize: number
  fetchedAt: number
  tokens: PulseToken[]
}

export async function listPulseTokens(
  category: PulseCategory,
  options: { pageNumber?: number; pageSize?: number } = {},
): Promise<PulseTokenFeed> {
  const pageNumber = clampInteger(options.pageNumber, 1, 1)
  const pageSize = clampInteger(options.pageSize, 20, 100)
  const cacheKey = `${category}:${pageNumber}:${pageSize}`
  const cached = cache.get(cacheKey)
  const now = Date.now()

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cached.data
  }

  const url = new URL(`${PRINTR_PULSE_BASE_URL}/${category}`)
  url.searchParams.set('pageNumber', String(pageNumber))
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('chains', PRINTR_PULSE_CHAINS)
  url.searchParams.set('chainMatch', 'any')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Pulse request failed with status ${response.status}`)
  }

  const raw = await response.json()
  const records = Array.isArray(raw) ? raw as PrintrPulseTokenRecord[] : []
  const data: PulseTokenFeed = {
    category,
    pageNumber,
    pageSize,
    fetchedAt: now,
    tokens: records
      .map((token) => normalizeToken(category, token))
      .filter((token): token is PulseToken => token !== null),
  }

  cache.set(cacheKey, { ts: now, data })
  return data
}

function clampInteger(value: number | undefined, fallback: number, max: number): number {
  const candidate = Number.isFinite(value) ? Math.trunc(value as number) : fallback
  if (candidate < 1) return fallback
  return Math.min(candidate, max)
}

function normalizeToken(category: PulseCategory, token: PrintrPulseTokenRecord): PulseToken | null {
  const contractAddress = typeof token.contractAddress === 'string' ? token.contractAddress : ''
  const symbol = typeof token.symbol === 'string' ? token.symbol : ''
  const name = typeof token.name === 'string' ? token.name : symbol

  if (!contractAddress || !symbol) {
    return null
  }

  return {
    id: typeof token.id === 'string' ? token.id : `${category}:${contractAddress}`,
    category,
    name,
    symbol,
    imageUrl: typeof token.imageUrl === 'string' ? token.imageUrl : null,
    creator: typeof token.creator === 'string' ? token.creator : null,
    createdAt: toTimestamp(token.createdAt),
    deployments: typeof token.deployments === 'number' ? token.deployments : null,
    contractAddress,
    contractAddressByChain: token.contractAddressByChain && typeof token.contractAddressByChain === 'object'
      ? token.contractAddressByChain
      : {},
    graduatedChains: Array.isArray(token.graduatedChains) ? token.graduatedChains.filter((value): value is string => typeof value === 'string') : [],
    externalUrlX: typeof token.externalUrlX === 'string' ? token.externalUrlX : null,
    externalUrlWebsite: typeof token.externalUrlWebsite === 'string' ? token.externalUrlWebsite : null,
    metrics: {
      trend: toNumber(token.metrics?.trend),
      graduationProgress: toNumber(token.metrics?.aggregatedGraduationProgressPercentage),
      marketCapUsd: toNumber(token.metrics?.combinedCirculatingMarketCap),
      volume24Usd: toNumber(token.metrics?.combinedVolume24),
      holders: toNumber(token.metrics?.combinedHolders),
      txnCount24: toNumber(token.metrics?.combinedTxnCount24),
      buyCount24: toNumber(token.metrics?.combinedBuyCount24),
      sellCount24: toNumber(token.metrics?.combinedSellCount24),
    },
  }
}

function toTimestamp(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function toNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

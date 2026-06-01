import { getDb } from '../db/db'
import { API_ENDPOINTS } from '../config/constants'
import { getJupiterApiKey } from './SolanaService'

interface PriceResult {
  mint: string
  priceUsd: number
  priceSol: number
  source: string
  confidenceLevel?: string | null
}

interface JupiterPriceResult {
  priceUsd: number
  confidenceLevel: string | null
}

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const PRICE_CACHE_TTL = 10_000 // 10s in-memory TTL
const JUPITER_PRICE_BATCH_SIZE = 50
const memoryCache = new Map<string, { price: PriceResult; ts: number }>()
const jupiterPriceBatchInflight = new Map<string, Promise<PriceResult[]>>()

let solPriceUsd = 0
let solPriceTs = 0

function getJupiterHeaders(): HeadersInit {
  const key = getJupiterApiKey()
  return key ? { 'x-api-key': key } : {}
}

function optionalNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readJupiterPrice(json: unknown, mint: string): JupiterPriceResult | null {
  if (!json || typeof json !== 'object') return null
  const root = json as Record<string, unknown>

  const direct = root[mint]
  if (direct && typeof direct === 'object') {
    const entry = direct as Record<string, unknown>
    const priceUsd = optionalNumber(entry.usdPrice)
    if (!priceUsd) return null
    return {
      priceUsd,
      confidenceLevel: optionalString(entry.confidenceLevel),
    }
  }

  const data = root.data
  if (data && typeof data === 'object') {
    const entry = (data as Record<string, unknown>)[mint]
    if (entry && typeof entry === 'object') {
      const legacy = entry as Record<string, unknown>
      const priceUsd = optionalNumber(legacy.price)
      if (!priceUsd) return null
      return {
        priceUsd,
        confidenceLevel: optionalString(legacy.confidenceLevel),
      }
    }
  }

  return null
}

async function fetchSolPrice(): Promise<number> {
  if (solPriceUsd > 0 && Date.now() - solPriceTs < 30_000) return solPriceUsd
  try {
    const res = await fetch(`${API_ENDPOINTS.JUPITER_PRICE}?ids=${SOL_MINT}`, {
      headers: getJupiterHeaders(),
    })
    if (!res.ok) return solPriceUsd || 150
    const json = await res.json()
    const p = readJupiterPrice(json, SOL_MINT)?.priceUsd ?? 0
    if (p > 0) { solPriceUsd = p; solPriceTs = Date.now() }
    return solPriceUsd || 150
  } catch {
    return solPriceUsd || 150
  }
}

async function fetchJupiterPriceBatch(batch: string[], solPrice: number, now: number): Promise<PriceResult[]> {
  const batchKey = batch.slice().sort().join(',')
  const inflight = jupiterPriceBatchInflight.get(batchKey)
  if (inflight) return inflight

  const request = (async () => {
    const results: PriceResult[] = []
    const res = await fetch(`${API_ENDPOINTS.JUPITER_PRICE}?ids=${batch.join(',')}`, {
      headers: getJupiterHeaders(),
    })
    if (!res.ok) return results

    const json = await res.json()
    for (const mint of batch) {
      const price = readJupiterPrice(json, mint)
      if (price) {
        const result: PriceResult = {
          mint,
          priceUsd: price.priceUsd,
          priceSol: solPrice > 0 ? price.priceUsd / solPrice : 0,
          source: 'jupiter',
          confidenceLevel: price.confidenceLevel,
        }
        results.push(result)
        memoryCache.set(mint, { price: result, ts: now })
      }
    }
    return results
  })().finally(() => {
    jupiterPriceBatchInflight.delete(batchKey)
  })

  jupiterPriceBatchInflight.set(batchKey, request)
  return request
}

export async function getPrices(mints: string[]): Promise<PriceResult[]> {
  if (mints.length === 0) return []

  const now = Date.now()
  const resultMap = new Map<string, PriceResult>()
  const needFetch: string[] = []
  const uniqueMints = Array.from(new Set(mints))

  // Check memory cache first
  for (const mint of uniqueMints) {
    const cached = memoryCache.get(mint)
    if (cached && now - cached.ts < PRICE_CACHE_TTL) {
      resultMap.set(mint, cached.price)
    } else {
      needFetch.push(mint)
    }
  }

  if (needFetch.length === 0) return mints.map((mint) => resultMap.get(mint)).filter((result): result is PriceResult => Boolean(result))

  const solPrice = await fetchSolPrice()

  // Jupiter Price API V3 supports up to 50 mints per request.
  for (let i = 0; i < needFetch.length; i += JUPITER_PRICE_BATCH_SIZE) {
    const batch = needFetch.slice(i, i + JUPITER_PRICE_BATCH_SIZE)
    try {
      const batchResults = await fetchJupiterPriceBatch(batch, solPrice, now)
      for (const result of batchResults) {
        resultMap.set(result.mint, result)
      }
    } catch { /* fallback below */ }
  }

  // DexScreener fallback for tokens Jupiter didn't price (PumpFun bonding curve)
  const unpriced = needFetch.filter((m) => !resultMap.has(m))
  if (unpriced.length > 0) {
    // DexScreener supports batching up to 30 addresses
    for (let i = 0; i < unpriced.length; i += 30) {
      const batch = unpriced.slice(i, i + 30)
      try {
        const res = await fetch(`${API_ENDPOINTS.DEXSCREENER_TOKEN}/${batch.join(',')}`)
        if (res.ok) {
          const pairs = await res.json() as Array<{ baseToken?: { address?: string }; priceUsd?: string }>
          if (Array.isArray(pairs)) {
            for (const pair of pairs) {
              const mint = pair.baseToken?.address
              const priceUsd = parseFloat(pair.priceUsd ?? '0')
              if (mint && priceUsd > 0 && batch.includes(mint)) {
                const result: PriceResult = {
                  mint,
                  priceUsd,
                  priceSol: solPrice > 0 ? priceUsd / solPrice : 0,
                  source: 'dexscreener',
                }
                resultMap.set(mint, result)
                memoryCache.set(mint, { price: result, ts: now })
              }
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  // Fill remaining with $0
  for (const mint of needFetch) {
    if (!resultMap.has(mint)) {
      const result: PriceResult = { mint, priceUsd: 0, priceSol: 0, source: 'none' }
      resultMap.set(mint, result)
      memoryCache.set(mint, { price: result, ts: now })
    }
  }

  // Persist to DB cache
  persistPriceCache(Array.from(resultMap.values()).filter((r) => r.priceUsd > 0))

  return mints.map((mint) => resultMap.get(mint)).filter((result): result is PriceResult => Boolean(result))
}

export function getCachedPrice(mint: string): PriceResult | null {
  const cached = memoryCache.get(mint)
  if (cached) return cached.price

  const db = getDb()
  const row = db.prepare('SELECT price_usd, price_sol, source FROM pnl_price_cache WHERE mint = ?').get(mint) as
    { price_usd: number; price_sol: number; source: string } | undefined
  if (row) {
    return { mint, priceUsd: row.price_usd, priceSol: row.price_sol, source: row.source }
  }
  return null
}

export function getSolPriceUsd(): number {
  return solPriceUsd || 150
}

function persistPriceCache(prices: PriceResult[]) {
  if (prices.length === 0) return
  const db = getDb()
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO pnl_price_cache (mint, price_usd, price_sol, source, updated_at) VALUES (?,?,?,?,?)'
  )
  const now = Date.now()
  db.transaction(() => {
    for (const p of prices) {
      stmt.run(p.mint, p.priceUsd, p.priceSol, p.source, now)
    }
  })()
}

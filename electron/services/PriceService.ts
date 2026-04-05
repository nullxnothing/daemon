import { getDb } from '../db/db'
import { API_ENDPOINTS } from '../config/constants'

interface PriceResult {
  mint: string
  priceUsd: number
  priceSol: number
  source: string
}

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const PRICE_CACHE_TTL = 10_000 // 10s in-memory TTL
const memoryCache = new Map<string, { price: PriceResult; ts: number }>()

let solPriceUsd = 0
let solPriceTs = 0

async function fetchSolPrice(): Promise<number> {
  if (solPriceUsd > 0 && Date.now() - solPriceTs < 30_000) return solPriceUsd
  try {
    const res = await fetch(`${API_ENDPOINTS.JUPITER_PRICE}?ids=${SOL_MINT}&vsToken=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
    if (!res.ok) return solPriceUsd || 150
    const json = await res.json() as { data?: Record<string, { price?: string }> }
    const p = parseFloat(json.data?.[SOL_MINT]?.price ?? '0')
    if (p > 0) { solPriceUsd = p; solPriceTs = Date.now() }
    return solPriceUsd || 150
  } catch {
    return solPriceUsd || 150
  }
}

export async function getPrices(mints: string[]): Promise<PriceResult[]> {
  if (mints.length === 0) return []

  const now = Date.now()
  const results: PriceResult[] = []
  const needFetch: string[] = []

  // Check memory cache first
  for (const mint of mints) {
    const cached = memoryCache.get(mint)
    if (cached && now - cached.ts < PRICE_CACHE_TTL) {
      results.push(cached.price)
    } else {
      needFetch.push(mint)
    }
  }

  if (needFetch.length === 0) return results

  const solPrice = await fetchSolPrice()

  // Batch Jupiter Price API (up to 100 at a time)
  const jupiterPriced = new Set<string>()
  for (let i = 0; i < needFetch.length; i += 100) {
    const batch = needFetch.slice(i, i + 100)
    try {
      const res = await fetch(`${API_ENDPOINTS.JUPITER_PRICE}?ids=${batch.join(',')}&showExtraInfo=true`)
      if (res.ok) {
        const json = await res.json() as { data?: Record<string, { price?: string }> }
        if (json.data) {
          for (const mint of batch) {
            const entry = json.data[mint]
            if (entry?.price) {
              const priceUsd = parseFloat(entry.price)
              if (priceUsd > 0) {
                const result: PriceResult = {
                  mint,
                  priceUsd,
                  priceSol: solPrice > 0 ? priceUsd / solPrice : 0,
                  source: 'jupiter',
                }
                results.push(result)
                memoryCache.set(mint, { price: result, ts: now })
                jupiterPriced.add(mint)
              }
            }
          }
        }
      }
    } catch { /* fallback below */ }
  }

  // DexScreener fallback for tokens Jupiter didn't price (PumpFun bonding curve)
  const unpriced = needFetch.filter((m) => !jupiterPriced.has(m))
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
                results.push(result)
                memoryCache.set(mint, { price: result, ts: now })
              }
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  // Fill remaining with $0
  const pricedMints = new Set(results.map((r) => r.mint))
  for (const mint of needFetch) {
    if (!pricedMints.has(mint)) {
      const result: PriceResult = { mint, priceUsd: 0, priceSol: 0, source: 'none' }
      results.push(result)
      memoryCache.set(mint, { price: result, ts: now })
    }
  }

  // Persist to DB cache
  persistPriceCache(results.filter((r) => r.priceUsd > 0))

  return results
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

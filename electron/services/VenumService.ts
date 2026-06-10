import * as SecureKey from './SecureKeyService'

const BASE = 'https://api.venum.dev/v1'
const API_TIMEOUT_MS = 15_000
const API_KEY_NAME = 'VENUM_API_KEY'

// ------------------------------------------------------------------ types ---

export interface VenumPrice {
  token: string
  priceUsd: number
  bestBid?: number
  bestAsk?: number
  bestBidDex?: string
  bestAskDex?: string
  poolCacheAgeMs?: number
  confidence?: string
  poolCount?: number
  timestamp?: number
  route?: string
  change24h?: number
  [key: string]: unknown
}

export interface VenumBatchPrices {
  prices: Record<string, VenumPrice>
  timestamp?: number
  [key: string]: unknown
}

export interface VenumQuoteInput {
  inputMint: string
  outputMint: string
  amount: string
  slippageBps?: number
}

export interface VenumRoute {
  dex: string
  poolAddress: string
  outputAmount: string
  priceImpactBps: number
  feeBps: number
  poolCacheAgeMs?: number
  confidence?: string
  [key: string]: unknown
}

export interface VenumQuote {
  routes: VenumRoute[]
  bestRoute: VenumRoute | null
  inputMint: string
  outputMint: string
  amount: string
  slippageBps: number
  poolsScanned?: number
  [key: string]: unknown
}

// ----------------------------------------------------------------- helpers ---

function getApiKey(): string {
  const key = SecureKey.getKey(API_KEY_NAME)
  if (!key) throw new Error('Venum API key not configured')
  return key
}

export function isConfigured(): boolean {
  return !!SecureKey.getKey(API_KEY_NAME)
}

export function storeApiKey(key: string): void {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('API key is empty')
  SecureKey.storeKey(API_KEY_NAME, trimmed)
}

export function clearApiKey(): void {
  SecureKey.deleteKey(API_KEY_NAME)
}

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': getApiKey(),
        ...(init?.headers ?? {}),
      },
    })
    const rawBody = await res.text()
    let body: (T & { error?: string }) | Record<string, never> = {}

    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody) as T & { error?: string }
      } catch {
        throw new Error(`Invalid JSON response from Venum API (${res.status})`)
      }
    }

    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
    return body as T
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Venum API timed out after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// ------------------------------------------------------------------- reads ---

export async function getPrice(token: string): Promise<VenumPrice> {
  const symbol = token.trim()
  if (!symbol) throw new Error('A token symbol is required')
  return fetchJson<VenumPrice>(`/price/${encodeURIComponent(symbol)}`)
}

export async function getPrices(tokens: string[]): Promise<VenumBatchPrices> {
  const symbols = tokens.map((token) => token.trim()).filter(Boolean)
  if (symbols.length === 0) throw new Error('At least one token symbol is required')
  return fetchJson<VenumBatchPrices>(`/prices?tokens=${encodeURIComponent(symbols.join(','))}`)
}

export async function getQuote(input: VenumQuoteInput): Promise<VenumQuote> {
  const inputMint = input.inputMint.trim()
  const outputMint = input.outputMint.trim()
  const amount = input.amount.trim()
  if (!inputMint || !outputMint) throw new Error('inputMint and outputMint are required')
  if (!/^\d+$/.test(amount)) throw new Error('amount must be an integer string in smallest units')
  const slippageBps = input.slippageBps ?? 100
  if (slippageBps < 1 || slippageBps > 5000) throw new Error('slippageBps must be between 1 and 5000')

  return fetchJson<VenumQuote>('/quote', {
    method: 'POST',
    body: JSON.stringify({ inputMint, outputMint, amount, slippageBps }),
  })
}

import { API_ENDPOINTS, RETRY_CONFIG } from '@daemon/shared'
import type { HeliusBalancesResponse, HeliusHistoryEvent, SolanaConfig } from './types'

async function fetchWithRetry(url: string, retries = RETRY_CONFIG.MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url)
    if (response.ok) return response

    if (response.status === 429 && attempt < retries - 1) {
      const retryAfter = response.headers.get('retry-after')
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt)
      await new Promise((r) => setTimeout(r, delay))
      continue
    }

    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  throw new Error('Max retries exceeded')
}

export async function fetchBalances(address: string, config: SolanaConfig): Promise<HeliusBalancesResponse> {
  if (!config.heliusApiKey) throw new Error('Helius API key required for balance fetch')

  const url = `${API_ENDPOINTS.HELIUS_BASE}/addresses/${address}/balances?api-key=${config.heliusApiKey}`
  const response = await fetchWithRetry(url)
  return response.json() as Promise<HeliusBalancesResponse>
}

export async function fetchTransactionHistory(
  address: string,
  config: SolanaConfig,
  limit = 20,
): Promise<HeliusHistoryEvent[]> {
  if (!config.heliusApiKey) throw new Error('Helius API key required for history fetch')

  const url = `${API_ENDPOINTS.HELIUS_BASE}/addresses/${address}/transactions?api-key=${config.heliusApiKey}&limit=${limit}`
  const response = await fetchWithRetry(url)
  return response.json() as Promise<HeliusHistoryEvent[]>
}

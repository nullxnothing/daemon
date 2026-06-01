import { getHeliusApiKey } from '../SolanaService'

export interface HeliusNativeTransfer {
  fromUserAccount: string
  toUserAccount: string
  amount: number
}

export interface HeliusTokenTransfer {
  fromUserAccount: string
  toUserAccount: string
  mint: string
  tokenAmount: number
}

export interface HeliusTransaction {
  signature: string
  timestamp: number
  slot: number
  type: string
  source: string
  description?: string
  nativeTransfers?: HeliusNativeTransfer[]
  tokenTransfers?: HeliusTokenTransfer[]
  accountData?: Array<{
    account: string
    tokenBalanceChanges?: Array<{
      mint: string
      userAccount: string
      rawTokenAmount?: { tokenAmount: string; decimals: number }
    }>
  }>
  events?: {
    swap?: {
      tokenOutputs?: Array<{ userAccount: string; mint: string }>
    }
  }
}

export interface HeliusAsset {
  id: string
  interface?: string
  mutable?: boolean
  authorities?: Array<{ address: string; scopes: string[] }>
  content?: {
    metadata?: { name?: string; symbol?: string; description?: string }
    links?: { image?: string }
    files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>
  }
  token_info?: {
    supply?: number
    decimals?: number
  }
}

export interface TokenHolder {
  owner: string
  amount: number
  tokenAccount?: string
}

export interface FunderInfo {
  address: string
  amount: number
  timestamp: number
  txSignature: string
  txType: string
  txSource: string
}

export interface WalletIdentity {
  address: string
  type: string | null
  name: string | null
  category: string | null
  tags: string[]
}

export interface WalletTransfer {
  signature: string
  timestamp: number
  direction: 'in' | 'out'
  counterparty: string
  mint: string
  symbol: string | null
  amount: number
}

const HELIUS_RPC_BASE = 'https://mainnet.helius-rpc.com'
const HELIUS_API_V0 = 'https://api.helius.xyz/v0'
const HELIUS_API_V1 = 'https://api.helius.xyz/v1'

function apiKey(): string {
  const key = getHeliusApiKey()
  if (!key) throw new Error('Helius API key not configured')
  return key
}

function urlWithKey(base: string, params: Record<string, string | number | undefined> = {}): string {
  const url = new URL(base)
  url.searchParams.set('api-key', apiKey())
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function fetchJson<T>(url: string, options?: RequestInit & { retries?: number; allowNotFound?: boolean }): Promise<T | null> {
  const retries = options?.retries ?? 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options).catch((err) => {
      lastError = err instanceof Error ? err : new Error(String(err))
      return null
    })
    if (!response) continue
    if (options?.allowNotFound && response.status === 404) return null
    if (response.ok) return await response.json() as T
    if (response.status !== 429 && response.status < 500) {
      const body = await response.text().catch(() => '')
      throw new Error(`Helius request failed (${response.status}): ${body.slice(0, 180)}`)
    }
    lastError = new Error(`Helius request failed (${response.status})`)
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
  }

  throw lastError ?? new Error('Helius request failed')
}

export async function rpc<T>(method: string, params: unknown): Promise<T> {
  const payload = await fetchJson<{ result?: T; error?: { message?: string } }>(urlWithKey(`${HELIUS_RPC_BASE}/`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
  })
  if (payload?.error) throw new Error(payload.error.message ?? `Helius ${method} failed`)
  if (!payload || payload.result === undefined) throw new Error(`Helius ${method} returned no result`)
  return payload.result
}

export async function getAsset(address: string): Promise<HeliusAsset | null> {
  try {
    return await rpc<HeliusAsset>('getAsset', { id: address })
  } catch {
    return null
  }
}

export async function getTokenAccounts(mint: string, maxPages = 2): Promise<TokenHolder[]> {
  const holders = new Map<string, TokenHolder>()

  for (let page = 1; page <= maxPages; page++) {
    const result = await rpc<{ cursor?: string | null; token_accounts?: Array<{ owner: string; amount: string | number; address?: string }> }>(
      'getTokenAccounts',
      { mint, page, limit: 1000 },
    )
    for (const account of result.token_accounts ?? []) {
      const amount = Number(account.amount)
      if (!Number.isFinite(amount) || amount <= 0) continue
      const existing = holders.get(account.owner)
      holders.set(account.owner, {
        owner: account.owner,
        amount: (existing?.amount ?? 0) + amount,
        tokenAccount: existing?.tokenAccount ?? account.address,
      })
    }
    if ((result.token_accounts ?? []).length < 1000) break
  }

  return [...holders.values()]
}

export async function getWalletFundedBy(address: string): Promise<FunderInfo | null> {
  const data = await fetchJson<{
    funder?: string
    amount?: number
    timestamp?: number
    signature?: string
    funderType?: string | null
  }>(urlWithKey(`${HELIUS_API_V1}/wallet/${address}/funded-by`), { allowNotFound: true, retries: 1 })
  if (!data?.funder || !data.signature) return null
  return {
    address: data.funder,
    amount: data.amount ?? 0,
    timestamp: data.timestamp ?? 0,
    txSignature: data.signature,
    txType: 'TRANSFER',
    txSource: data.funderType ?? 'UNKNOWN',
  }
}

export async function getWalletTransfers(address: string, limit = 100): Promise<WalletTransfer[]> {
  const data = await fetchJson<{ data?: WalletTransfer[] }>(
    urlWithKey(`${HELIUS_API_V1}/wallet/${address}/transfers`, { limit }),
    { retries: 1 },
  )
  return data?.data ?? []
}

export async function getTransactionsForAddress(address: string, limit = 10): Promise<HeliusTransaction[]> {
  const data = await fetchJson<HeliusTransaction[]>(
    urlWithKey(`${HELIUS_API_V0}/addresses/${address}/transactions`, { limit }),
    { retries: 1 },
  )
  return Array.isArray(data) ? data.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)) : []
}

export async function batchIdentifyWallets(addresses: string[]): Promise<Map<string, WalletIdentity>> {
  const result = new Map<string, WalletIdentity>()
  const unique = [...new Set(addresses)].filter(Boolean)

  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100)
    const identities = await fetchJson<WalletIdentity[]>(urlWithKey(`${HELIUS_API_V1}/wallet/batch-identity`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: batch }),
      retries: 1,
    }).catch(() => null)
    if (!Array.isArray(identities)) continue
    for (const identity of identities) {
      if (identity.address) result.set(identity.address, identity)
    }
  }

  return result
}

export async function getTokenLaunchInfo(mint: string): Promise<{ mintTimestamp: number; mintSlot: number; mintSignature: string } | null> {
  const signatures = await rpc<Array<{ signature: string; slot: number; blockTime?: number | null }>>(
    'getSignaturesForAddress',
    [mint, { limit: 100 }],
  ).catch(() => [])
  const oldest = signatures[signatures.length - 1]
  if (!oldest) return null
  return {
    mintTimestamp: oldest.blockTime ?? 0,
    mintSlot: oldest.slot,
    mintSignature: oldest.signature,
  }
}

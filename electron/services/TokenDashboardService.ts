import * as SecureKey from './SecureKeyService'

const JUPITER_PRICE_URL = 'https://api.jup.ag/price/v2'
const HELIUS_RPC_BASE = 'https://mainnet.helius-rpc.com'

export interface TokenPrice {
  price: number
  priceChange24h: number | null
}

export interface TokenMetadata {
  name: string
  symbol: string
  image: string | null
  supply: number
  decimals: number
}

export interface TokenHolder {
  address: string
  amount: number
}

export interface TokenHolders {
  count: number
  topHolders: TokenHolder[]
}

function getHeliusKey(): string {
  const key = SecureKey.getKey('HELIUS_API_KEY')
  if (!key) throw new Error('Helius API key not configured')
  return key
}

export async function getTokenPrice(mint: string): Promise<TokenPrice> {
  const url = `${JUPITER_PRICE_URL}?ids=${mint}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Jupiter price fetch failed: ${response.status}`)

  const json = await response.json() as { data: Record<string, { price: string } | null> }
  const entry = json.data[mint]
  if (!entry) throw new Error(`No price data for mint ${mint}`)

  return {
    price: parseFloat(entry.price),
    priceChange24h: null,
  }
}

export async function getTokenMetadata(mint: string): Promise<TokenMetadata> {
  const key = getHeliusKey()
  const url = `${HELIUS_RPC_BASE}/?api-key=${key}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-asset',
      method: 'getAsset',
      params: { id: mint },
    }),
  })

  if (!response.ok) throw new Error(`Helius getAsset failed: ${response.status}`)

  const json = await response.json() as {
    result?: {
      content?: {
        metadata?: { name?: string; symbol?: string }
        links?: { image?: string }
        files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>
      }
      token_info?: { supply?: number; decimals?: number }
    }
    error?: { message: string }
  }

  if (json.error) throw new Error(json.error.message)
  if (!json.result) throw new Error('No result from getAsset')

  const content = json.result.content
  const tokenInfo = json.result.token_info

  const name = content?.metadata?.name ?? 'Unknown'
  const symbol = content?.metadata?.symbol ?? '???'
  const supply = tokenInfo?.supply ?? 0
  const decimals = tokenInfo?.decimals ?? 6

  // Prefer files[0] CDN URI, fall back to links.image
  const imageFile = content?.files?.find((f) => f.mime?.startsWith('image/'))
  const image = imageFile?.cdn_uri ?? imageFile?.uri ?? content?.links?.image ?? null

  return { name, symbol, image, supply, decimals }
}

export async function getTokenHolders(mint: string): Promise<TokenHolders> {
  const key = getHeliusKey()
  const url = `${HELIUS_RPC_BASE}/?api-key=${key}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-token-accounts',
      method: 'getTokenAccounts',
      params: {
        mint,
        limit: 100,
        options: { showZeroBalance: false },
      },
    }),
  })

  if (!response.ok) throw new Error(`Helius getTokenAccounts failed: ${response.status}`)

  const json = await response.json() as {
    result?: {
      total?: number
      token_accounts?: Array<{ owner: string; amount: string }>
    }
    error?: { message: string }
  }

  if (json.error) throw new Error(json.error.message)

  const accounts = json.result?.token_accounts ?? []
  const total = json.result?.total ?? accounts.length

  const topHolders: TokenHolder[] = accounts
    .slice(0, 10)
    .map((a) => ({
      address: a.owner,
      amount: parseInt(a.amount, 10),
    }))

  return { count: total, topHolders }
}

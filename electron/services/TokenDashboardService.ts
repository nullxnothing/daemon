import { getHeliusApiKey } from './SolanaService'

const JUPITER_PRICE_URL = 'https://api.jup.ag/price/v2'
const HELIUS_RPC_BASE = 'https://mainnet.helius-rpc.com'
const TOKEN_ACCOUNT_PAGE_LIMIT = 1000
const TOKEN_ACCOUNT_MAX_PAGES = 50

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
  const key = getHeliusApiKey()
  if (!key) throw new Error('Helius API key not configured')
  return key
}

function normalizeTokenImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${trimmed.slice('ipfs://'.length).replace(/^ipfs\//, '')}`

  // Helius CDN URLs can be returned as /cdn-cgi/image//https://... and those
  // currently 403 in the browser. Prefer the original asset URL in that case.
  const passthroughMarker = '/cdn-cgi/image//'
  const markerIndex = trimmed.indexOf(passthroughMarker)
  if (markerIndex >= 0) {
    const passthrough = trimmed.slice(markerIndex + passthroughMarker.length)
    if (passthrough.startsWith('http://') || passthrough.startsWith('https://')) return passthrough
  }

  return trimmed
}

function pickTokenImage(content: {
  links?: { image?: string }
  files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>
} | undefined): string | null {
  const imageFile = content?.files?.find((f) => f.mime?.startsWith('image/')) ?? content?.files?.find((f) => f.cdn_uri || f.uri)
  return normalizeTokenImageUrl(imageFile?.cdn_uri)
    ?? normalizeTokenImageUrl(imageFile?.uri)
    ?? normalizeTokenImageUrl(content?.links?.image)
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

  const image = pickTokenImage(content)

  return { name, symbol, image, supply, decimals }
}

export interface DetectedToken {
  mint: string
  name: string
  symbol: string
  image: string | null
  decimals: number
  supply: number
}

export async function detectWalletTokens(walletAddress: string): Promise<DetectedToken[]> {
  const key = getHeliusKey()
  const url = `${HELIUS_RPC_BASE}/?api-key=${key}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'get-assets-by-owner',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: walletAddress,
        page: 1,
        limit: 1000,
        displayOptions: {
          showFungible: true,
          showNativeBalance: false,
        },
      },
    }),
  })

  if (!response.ok) throw new Error(`Helius getAssetsByOwner failed: ${response.status}`)

  const json = await response.json() as {
    result?: {
      items?: Array<{
        id: string
        interface?: string
        authorities?: Array<{ address: string; scopes: string[] }>
        content?: {
          metadata?: { name?: string; symbol?: string }
          links?: { image?: string }
          files?: Array<{ uri?: string; cdn_uri?: string; mime?: string }>
        }
        token_info?: { supply?: number; decimals?: number }
      }>
    }
    error?: { message: string }
  }

  if (json.error) throw new Error(json.error.message)

  const items = json.result?.items ?? []

  // Filter for fungible tokens where the wallet is an authority (creator/mint authority)
  const authorityTokens = items.filter((item) => {
    const isFungible = item.interface === 'FungibleToken' || item.interface === 'FungibleAsset'
    if (!isFungible) return false
    const hasAuthority = item.authorities?.some(
      (a) => a.address === walletAddress && (a.scopes.includes('full') || a.scopes.includes('metadata'))
    )
    return hasAuthority
  })

  return authorityTokens.map((item) => {
    const content = item.content
    const tokenInfo = item.token_info
    const image = pickTokenImage(content)
    return {
      mint: item.id,
      name: content?.metadata?.name ?? 'Unknown',
      symbol: content?.metadata?.symbol ?? '???',
      image,
      decimals: tokenInfo?.decimals ?? 6,
      supply: tokenInfo?.supply ?? 0,
    }
  })
}

export async function importTokenByMint(mint: string): Promise<DetectedToken> {
  const metadata = await getTokenMetadata(mint)
  return {
    mint,
    name: metadata.name,
    symbol: metadata.symbol,
    image: metadata.image,
    decimals: metadata.decimals,
    supply: metadata.supply,
  }
}

export async function getTokenHolders(mint: string): Promise<TokenHolders> {
  const key = getHeliusKey()
  const url = `${HELIUS_RPC_BASE}/?api-key=${key}`
  const holders = new Map<string, number>()
  let cursor: string | undefined
  let pages = 0

  do {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'get-token-accounts',
        method: 'getTokenAccounts',
        params: {
          mint,
          limit: TOKEN_ACCOUNT_PAGE_LIMIT,
          ...(cursor ? { cursor } : {}),
          options: { showZeroBalance: false },
        },
      }),
    })

    if (!response.ok) throw new Error(`Helius getTokenAccounts failed: ${response.status}`)

    const json = await response.json() as {
      result?: {
        cursor?: string | null
        token_accounts?: Array<{ owner: string; amount: string }>
      }
      error?: { message: string }
    }

    if (json.error) throw new Error(json.error.message)

    const accounts = json.result?.token_accounts ?? []
    for (const account of accounts) {
      const amount = Number.parseInt(account.amount, 10)
      if (!Number.isFinite(amount) || amount <= 0) continue
      holders.set(account.owner, (holders.get(account.owner) ?? 0) + amount)
    }

    cursor = json.result?.cursor ?? undefined
    pages += 1
  } while (cursor && pages < TOKEN_ACCOUNT_MAX_PAGES)

  const topHolders: TokenHolder[] = [...holders.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([address, amount]) => ({
      address,
      amount,
    }))

  return { count: holders.size, topHolders }
}

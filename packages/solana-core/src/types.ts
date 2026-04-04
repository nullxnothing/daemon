export interface SolanaConfig {
  heliusApiKey?: string
  rpcEndpoint?: string
  commitment?: 'processed' | 'confirmed' | 'finalized'
}

export interface HeliusBalance {
  mint: string
  balance: number
  decimals: number
  symbol?: string
  name?: string
  pricePerToken?: number
  usdValue?: number
  logoUri?: string
}

export interface HeliusBalancesResponse {
  balances: HeliusBalance[]
  totalUsdValue: number
  pagination?: { page: number; limit: number; hasMore: boolean }
}

export interface HeliusHistoryEvent {
  signature: string
  timestamp?: number
  type?: string
  description?: string
}

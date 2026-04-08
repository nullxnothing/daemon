export type LaunchpadId = 'pumpfun' | 'raydium' | 'meteora' | 'bonk'
export type LaunchpadStatus = 'available' | 'planned'

export interface RaydiumLaunchpadConfig {
  configId?: string
  quoteMint?: string
}

export interface MeteoraLaunchpadConfig {
  configId?: string
  quoteMint?: string
  baseSupply?: string
}

export interface TokenLaunchSettings {
  raydium: RaydiumLaunchpadConfig
  meteora: MeteoraLaunchpadConfig
}

export interface TokenLaunchCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export interface LaunchpadDefinition {
  id: LaunchpadId
  name: string
  description: string
  status: LaunchpadStatus
  enabled: boolean
  reason: string | null
}

export interface TokenLaunchInput {
  launchpad: LaunchpadId
  walletId: string
  projectId?: string
  name: string
  symbol: string
  description: string
  imagePath: string | null
  twitter?: string
  telegram?: string
  website?: string
  initialBuySol: number
  slippageBps: number
  priorityFeeSol: number
  mayhemMode?: boolean
}

export interface AdapterLaunchResult {
  signature: string
  mint: string
  metadataUri: string | null
  poolAddress: string | null
  bondingCurveAddress: string | null
  protocolReceipts: Record<string, unknown>
}

export interface TokenLaunchAdapter {
  definition: LaunchpadDefinition
  preflight?: (input: TokenLaunchInput) => Promise<TokenLaunchCheck[]>
  createLaunch: (input: TokenLaunchInput) => Promise<AdapterLaunchResult>
}

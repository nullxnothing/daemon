export type MemeTechArchetype =
  | 'token-gated-game-economy'
  | 'permissionless-market-indexer'
  | 'token-community-app'
  | 'generic-solana-app'
  | 'unknown'

export interface MemeTechEvidence {
  code: string
  path: string
  detail: string
}

export interface MemeTechGap {
  severity: 'blocker' | 'warning' | 'info'
  code: string
  detail: string
  action: string
}

export interface MemeTechProjectProfile {
  archetype: MemeTechArchetype
  confidence: number
  evidence: MemeTechEvidence[]
  topology: string[]
  capabilities: string[]
  gaps: MemeTechGap[]
  tokenMints: string[]
  clusterSources: Array<{ source: string; value: string }>
  inspectedAt: number
}

export interface MemeMarketSnapshot {
  mint: string
  symbol: string | null
  name: string | null
  observedAt: number
  priceUsd: number | null
  liquidityUsd: number | null
  marketCapUsd: number | null
  volume1hUsd: number | null
  volume24hUsd: number | null
  trades1h: number | null
  uniqueWallets1h: number | null
  holders: number | null
  priceChange1hPercent: number | null
  boosts: number | null
  divergences: string[]
  sources: Array<{ provider: 'birdeye' | 'dexscreener'; fetchedAt: number; stale: boolean }>
  degraded: boolean
}

export interface TokenRiskPreflight {
  mint: string
  observedAt: number
  risk: 'high' | 'review' | 'unknown'
  facts: Array<{ label: string; value: string; status: 'good' | 'warning' | 'danger' | 'unknown' }>
  unknowns: string[]
  attentionIsNotTrust: true
  sources: string[]
}

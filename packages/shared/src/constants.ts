// Portable constants shared between desktop and mobile.
// Desktop-only constants (filesystem paths, CLI timeouts) remain in electron/config/constants.ts.

export const API_ENDPOINTS = {
  HELIUS_BASE: 'https://api.helius.xyz/v1',
  COINGECKO_PRICE: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana,ethereum&vs_currencies=usd&include_24hr_change=true',
} as const

export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 1000,
} as const

export const SOLANA_ENDPOINTS = {
  MAINNET: 'https://api.mainnet-beta.solana.com',
  DEVNET: 'https://api.devnet.solana.com',
  heliusMainnet: (apiKey: string) => `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
} as const

export const MODEL_MAP: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
} as const

export const DEFAULT_MAX_TOKENS = 4096

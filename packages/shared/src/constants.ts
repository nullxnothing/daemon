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

// Canonical Claude model IDs — the single source of truth for every seeded
// agent, shorthand resolution, migration target, and UI picker across desktop
// and mobile. The Sonnet/Opus aliases are dateless and complete as written —
// never append a date suffix to them.
export const CLAUDE_MODEL_IDS = {
  opus: 'claude-opus-4-8',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
} as const

export type ClaudeModelShorthand = keyof typeof CLAUDE_MODEL_IDS

// Shorthand → full model ID. Derived from CLAUDE_MODEL_IDS so the two can
// never drift apart.
export const MODEL_MAP: Record<string, string> = { ...CLAUDE_MODEL_IDS }

export const DEFAULT_MAX_TOKENS = 4096

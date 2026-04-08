// Centralized configuration constants — no magic numbers in service code

// --- Timeouts (ms) ---
export const TIMEOUTS = {
  NPM_PREFIX: 3000,
  VERSION_CHECK: 5000,
  GIT_COMMAND: 3000,
  FILE_TREE: 5000,
  TYPESCRIPT_CHECK: 30000,
  TASKLIST: 5000,
  TASKKILL: 3000,
  KILL_GRACE_PERIOD: 3000,
  CLIPBOARD_CLEAR: 30000,
  VERCEL_PULL: 30000,
  TOKEN_EXPIRY_BUFFER: 60000,
  CLI_PROMPT_DEFAULT: 60000,
  PROMPT_FIX_CLAUDEMD: 90000,
  PROMPT_GENERATE_CLAUDEMD: 120000,
  SAGA_DEFAULT: 30000,
  SAGA_WAIT: 60000,
  ORCHESTRATED_PROMPT: 120000,
} as const

// --- Retry Config ---
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 1000,
  SNAPSHOT_INTERVAL_MS: 15 * 60 * 1000,
} as const

// --- API Endpoints ---
export const API_ENDPOINTS = {
  HELIUS_BASE: 'https://api.helius.xyz/v1',
  COINGECKO_PRICE: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana,ethereum&vs_currencies=usd&include_24hr_change=true',
  JUPITER_PRICE: 'https://api.jup.ag/price/v2',
  DEXSCREENER_TOKEN: 'https://api.dexscreener.com/tokens/v1/solana',
  HELIUS_PARSE_TX: 'https://api.helius.xyz/v0/transactions',
  HELIUS_TX_HISTORY: 'https://api.helius.xyz/v0/addresses',
  GOOGLE_OAUTH_TOKEN: 'https://oauth2.googleapis.com/token',
  GOOGLE_OAUTH_AUTH: 'https://accounts.google.com/o/oauth2/v2/auth',
  GMAIL_API_BASE: 'https://gmail.googleapis.com/gmail/v1/users/me',
  VERCEL_API: 'https://api.vercel.com',
  RAILWAY_API: 'https://backboard.railway.com/graphql/v2',
} as const

// --- Bundled OAuth Credentials ---
// Set these once as the app developer. All users get seamless "Connect with Google".
// Create at: console.cloud.google.com → Credentials → OAuth 2.0 → Desktop app
// Enable: Gmail API
export const GOOGLE_OAUTH = {
  CLIENT_ID: process.env.DAEMON_GOOGLE_CLIENT_ID ?? '',
  CLIENT_SECRET: process.env.DAEMON_GOOGLE_CLIENT_SECRET ?? '',
} as const

// --- Platform Fee (Jupiter integration) ---
// DAEMON takes a disclosed platform fee on Jupiter swaps. The fee is routed through
// Jupiter's native `platformFeeBps` parameter — it's line-itemed in the quote, visible
// to the user in the confirmation UI, and paid out in the OUTPUT token to an ATA owned
// by DAEMON_FEE_WALLET_PUBKEY. Users can disable the fee entirely from wallet settings.
//
// Hard cap at 100 bps (1%) to prevent misconfiguration from ever sending a silently
// excessive fee. Jupiter also enforces its own cap (≤255 bps) server-side.
export const PLATFORM_FEE = {
  BPS: clampFeeBps(parseInt(process.env.DAEMON_PLATFORM_FEE_BPS ?? '50', 10)),
  WALLET_PUBKEY: process.env.DAEMON_FEE_WALLET_PUBKEY ?? '',
  // Setting key used by SettingsService / UI toggle — true by default, per-install opt-out.
  ENABLED_SETTING_KEY: 'platform_fee_enabled',
  ENABLED_DEFAULT: true,
} as const

function clampFeeBps(bps: number): number {
  if (!Number.isFinite(bps) || bps < 0) return 0
  return Math.min(bps, 100)
}

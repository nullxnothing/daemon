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
  GOOGLE_OAUTH_TOKEN: 'https://oauth2.googleapis.com/token',
  GOOGLE_OAUTH_AUTH: 'https://accounts.google.com/o/oauth2/v2/auth',
  GMAIL_API_BASE: 'https://gmail.googleapis.com/gmail/v1/users/me',
  VERCEL_API: 'https://api.vercel.com',
  RAILWAY_API: 'https://backboard.railway.com/graphql/v2',
} as const

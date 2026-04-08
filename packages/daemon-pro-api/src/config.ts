/**
 * Environment-driven configuration for the Daemon Pro API.
 *
 * All values are resolved at module load time and validated once. Missing
 * required values cause the server to fail fast on startup rather than on
 * first request, which is much easier to debug in Railway/Fly logs.
 */

import {
  SOLANA_DEVNET_CAIP2,
  SOLANA_MAINNET_CAIP2,
  SOLANA_TESTNET_CAIP2,
} from '@x402/svm'

type Caip2Network = `${string}:${string}`

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${key}`)
  }
  return value
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

function numericEnv(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Env var ${key} must be numeric, got: ${raw}`)
  }
  return parsed
}

function normalizeSvmNetwork(value: string): Caip2Network {
  switch (value) {
    case 'solana':
    case 'solana:mainnet':
      return SOLANA_MAINNET_CAIP2
    case 'solana-devnet':
    case 'solana:devnet':
      return SOLANA_DEVNET_CAIP2
    case 'solana-testnet':
    case 'solana:testnet':
      return SOLANA_TESTNET_CAIP2
    default:
      return value as Caip2Network
  }
}

export const config = {
  port: numericEnv('PORT', 4021),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
  isTest: optionalEnv('NODE_ENV', 'development') === 'test',

  // JWT signing — dev default is intentionally weak so missing env in prod is obvious
  jwtSecret: optionalEnv('DAEMON_PRO_JWT_SECRET', 'dev-secret-replace-in-production'),

  // Subscription pricing (denominated in USDC)
  priceUsdc: numericEnv('DAEMON_PRO_PRICE_USDC', 5),
  durationDays: numericEnv('DAEMON_PRO_DURATION_DAYS', 30),

  // x402 settlement
  payTo: requireEnv('DAEMON_PRO_PAY_TO', 'FeeW4lLet1111111111111111111111111111111111'),
  network: normalizeSvmNetwork(optionalEnv('DAEMON_PRO_NETWORK', SOLANA_MAINNET_CAIP2)),
  payaiApiKeyId: process.env.PAYAI_API_KEY_ID ?? '',
  payaiApiKeySecret: process.env.PAYAI_API_KEY_SECRET ?? '',
  holderMint: optionalEnv('DAEMON_PRO_HOLDER_MINT', '4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump'),
  holderMinAmount: numericEnv('DAEMON_PRO_HOLDER_MIN_AMOUNT', 1_000_000),
  holderRpcUrl: optionalEnv('DAEMON_PRO_HOLDER_RPC_URL', 'https://api.mainnet-beta.solana.com'),
  holderJwtHours: numericEnv('DAEMON_PRO_HOLDER_JWT_HOURS', 12),

  // Content paths
  proSkillsDir: optionalEnv('DAEMON_PRO_SKILLS_DIR', './content/pro-skills'),
  arenaDataPath: optionalEnv('DAEMON_PRO_ARENA_DATA', './content/arena.json'),

  // Subscription state store
  dbPath: optionalEnv('DAEMON_PRO_DB_PATH', './dev.db'),

  // CORS allowlist — '*' allows everything (fine for local dev, tighten in prod)
  allowedOrigins: optionalEnv('DAEMON_PRO_ALLOWED_ORIGINS', '*').split(',').map((s) => s.trim()),
} as const

if (config.isProduction) {
  if (config.jwtSecret === 'dev-secret-replace-in-production') {
    throw new Error('DAEMON_PRO_JWT_SECRET must be set in production')
  }
  if (config.jwtSecret.length < 32) {
    throw new Error('DAEMON_PRO_JWT_SECRET must be at least 32 characters in production')
  }
  if (!config.payaiApiKeyId || !config.payaiApiKeySecret) {
    throw new Error('PAYAI_API_KEY_ID and PAYAI_API_KEY_SECRET must be set in production')
  }
  if (config.allowedOrigins.includes('*')) {
    console.warn('[daemon-pro-api] WARNING: CORS allowlist is "*" in production — consider tightening')
  }
  if (!config.holderRpcUrl) {
    throw new Error('DAEMON_PRO_HOLDER_RPC_URL must be set in production')
  }
}

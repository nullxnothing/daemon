import type Database from 'better-sqlite3'
import {
  getHostedLanesForPlan,
  getMonthlyAiCredits,
  getPlanFeatures,
  normalizePlan,
} from '../EntitlementService'
import { createDaemonAICloudGateway } from './DaemonAICloudGateway'
import { Hs256DaemonAiJwtAuthVerifier } from './JwtAuthVerifier'
import { createConfiguredDaemonAiProviders } from './providerFactory'
import { SqliteDaemonAIUsageMeter } from './SqliteUsageMeter'
import type { DaemonAiCloudAuthVerifier, DaemonAiCloudEntitlement, DaemonAiCloudGatewayOptions } from './types'

export interface DaemonAICloudRuntimeReadiness {
  ready: boolean
  missing: string[]
  providers: string[]
  storage: {
    configured: boolean
    persistentHint: boolean
    source: 'daemon-ai-cloud-db-path' | 'database-path' | 'default'
  }
}

export function getDaemonAICloudRuntimeReadiness(env: NodeJS.ProcessEnv = process.env): DaemonAICloudRuntimeReadiness {
  const providers = createConfiguredDaemonAiProviders(env).map((provider) => provider.id)
  const missing: string[] = []
  const explicitDbPath = env.DAEMON_AI_CLOUD_DB_PATH?.trim()
  const databasePath = env.DATABASE_PATH?.trim()
  const dbPath = explicitDbPath || databasePath || ''
  const storage = {
    configured: Boolean(dbPath),
    persistentHint: Boolean(dbPath) && !/[\\/]tmp[\\/]/i.test(dbPath),
    source: explicitDbPath
      ? 'daemon-ai-cloud-db-path' as const
      : databasePath
        ? 'database-path' as const
        : 'default' as const,
  }
  if (!env.DAEMON_PRO_JWT_SECRET?.trim() && !env.DAEMON_AI_JWT_SECRET?.trim()) {
    missing.push('DAEMON_PRO_JWT_SECRET or DAEMON_AI_JWT_SECRET')
  }
  if (!env.DAEMON_PRO_PAY_TO?.trim()) {
    missing.push('DAEMON_PRO_PAY_TO')
  }
  if (!env.DAEMON_PRO_ADMIN_SECRET?.trim() && !env.DAEMON_ADMIN_SECRET?.trim()) {
    missing.push('DAEMON_PRO_ADMIN_SECRET or DAEMON_ADMIN_SECRET')
  }
  if (!env.SOLANA_RPC_URL?.trim() && !env.HELIUS_RPC_URL?.trim() && !env.HELIUS_API_KEY?.trim()) {
    missing.push('SOLANA_RPC_URL or HELIUS_RPC_URL or HELIUS_API_KEY')
  }
  if (!providers.length) {
    missing.push('OPENAI_API_KEY or ANTHROPIC_API_KEY')
  }
  if (env.DAEMON_AI_REQUIRE_PERSISTENT_STORAGE === '1' && !storage.persistentHint) {
    missing.push('DAEMON_AI_CLOUD_DB_PATH persistent disk path')
  }
  return {
    ready: missing.length === 0,
    missing,
    providers,
    storage,
  }
}

export function resolveDaemonAICloudJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const proSecret = env.DAEMON_PRO_JWT_SECRET?.trim()
  if (proSecret) return proSecret
  return env.DAEMON_AI_JWT_SECRET?.trim() ?? ''
}

export function resolveDaemonAICloudJwtSecrets(env: NodeJS.ProcessEnv = process.env): string[] {
  const current = resolveDaemonAICloudJwtSecret(env)
  const previous = [
    ...(env.DAEMON_PRO_JWT_PREVIOUS_SECRETS ?? '').split(','),
    ...(env.DAEMON_AI_JWT_PREVIOUS_SECRETS ?? '').split(','),
  ].map((entry) => entry.trim()).filter(Boolean)
  return [...new Set([current, ...previous].filter(Boolean))]
}

function laneForPlan(plan: DaemonAiCloudEntitlement['plan']): DaemonAiCloudEntitlement['lane'] {
  if (plan === 'ultra' || plan === 'enterprise') return 'premium'
  if (plan === 'operator' || plan === 'team') return 'reasoning'
  return 'standard'
}

class SubscriptionBackedJwtAuthVerifier implements DaemonAiCloudAuthVerifier {
  private jwtVerifier: Hs256DaemonAiJwtAuthVerifier
  private db: Database.Database

  constructor(db: Database.Database, secret: string | string[]) {
    this.db = db
    this.jwtVerifier = new Hs256DaemonAiJwtAuthVerifier(secret)
  }

  async verifyBearerToken(token: string): Promise<DaemonAiCloudEntitlement> {
    const entitlement = await this.jwtVerifier.verifyBearerToken(token)
    const walletAddress = entitlement.walletAddress ?? entitlement.userId
    if (!walletAddress) throw new Error('DAEMON Pro token is not bound to an account')

    const row = this.db.prepare(`
      SELECT plan, access_source, features_json, expires_at, revoked_at
      FROM daemon_subscriptions
      WHERE wallet_address = ?
    `).get(walletAddress) as {
      plan: string
      access_source: DaemonAiCloudEntitlement['accessSource']
      features_json: string
      expires_at: number
      revoked_at: number | null
    } | undefined

    if (!row || row.revoked_at !== null || row.expires_at <= Date.now()) {
      throw new Error('DAEMON Pro subscription is not active')
    }

    const plan = normalizePlan(row.plan)
    if (plan === 'light') throw new Error('DAEMON AI entitlement required')
    const validFeatures = getPlanFeatures('enterprise')
    const rowFeatures = (JSON.parse(row.features_json) as unknown[])
      .filter((feature): feature is typeof validFeatures[number] =>
        typeof feature === 'string' && validFeatures.includes(feature as typeof validFeatures[number]))
    const features = [...new Set([...getPlanFeatures(plan), ...rowFeatures])]
    return {
      ...entitlement,
      plan,
      accessSource: row.access_source,
      features,
      lane: laneForPlan(plan),
      allowedLanes: getHostedLanesForPlan(plan),
      monthlyCredits: getMonthlyAiCredits(plan),
      entitlementExpiresAt: new Date(row.expires_at).toISOString(),
    }
  }
}

function createProductionAuthVerifier(
  db: Database.Database,
  env: NodeJS.ProcessEnv,
): DaemonAiCloudAuthVerifier {
  const secrets = resolveDaemonAICloudJwtSecrets(env)
  if (env.DAEMON_AI_ALLOW_UNBACKED_JWT === '1') {
    return new Hs256DaemonAiJwtAuthVerifier(secrets)
  }
  return new SubscriptionBackedJwtAuthVerifier(db, secrets)
}

export function createProductionDaemonAICloudGateway(
  db: Database.Database,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<DaemonAiCloudGatewayOptions> = {},
) {
  const providers = overrides.providers ?? createConfiguredDaemonAiProviders(env)
  return createDaemonAICloudGateway({
    auth: overrides.auth ?? createProductionAuthVerifier(db, env),
    usage: overrides.usage ?? new SqliteDaemonAIUsageMeter(db),
    providers,
  })
}

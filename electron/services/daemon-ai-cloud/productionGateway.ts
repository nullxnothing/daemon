import type Database from 'better-sqlite3'
import { createDaemonAICloudGateway } from './DaemonAICloudGateway'
import { Hs256DaemonAiJwtAuthVerifier } from './JwtAuthVerifier'
import { createConfiguredDaemonAiProviders } from './providerFactory'
import { SqliteDaemonAIUsageMeter } from './SqliteUsageMeter'
import type { DaemonAiCloudGatewayOptions } from './types'

export interface DaemonAICloudRuntimeReadiness {
  ready: boolean
  missing: string[]
  providers: string[]
}

export function getDaemonAICloudRuntimeReadiness(env: NodeJS.ProcessEnv = process.env): DaemonAICloudRuntimeReadiness {
  const providers = createConfiguredDaemonAiProviders(env).map((provider) => provider.id)
  const missing: string[] = []
  if (!env.DAEMON_PRO_JWT_SECRET?.trim() && !env.DAEMON_AI_JWT_SECRET?.trim()) {
    missing.push('DAEMON_PRO_JWT_SECRET or DAEMON_AI_JWT_SECRET')
  }
  if (!providers.length) {
    missing.push('OPENAI_API_KEY or ANTHROPIC_API_KEY')
  }
  return {
    ready: missing.length === 0,
    missing,
    providers,
  }
}

export function resolveDaemonAICloudJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const proSecret = env.DAEMON_PRO_JWT_SECRET?.trim()
  if (proSecret) return proSecret
  return env.DAEMON_AI_JWT_SECRET?.trim() ?? ''
}

export function createProductionDaemonAICloudGateway(
  db: Database.Database,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<DaemonAiCloudGatewayOptions> = {},
) {
  const providers = overrides.providers ?? createConfiguredDaemonAiProviders(env)
  return createDaemonAICloudGateway({
    auth: overrides.auth ?? new Hs256DaemonAiJwtAuthVerifier(resolveDaemonAICloudJwtSecret(env)),
    usage: overrides.usage ?? new SqliteDaemonAIUsageMeter(db),
    providers,
  })
}

import crypto from 'node:crypto'
import type { Server } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  createProductionDaemonAICloudGateway,
  getDaemonAICloudRuntimeReadiness,
  Hs256DaemonAiJwtAuthVerifier,
  resolveDaemonAICloudJwtSecret,
  resolveDaemonAICloudJwtSecrets,
  SqliteDaemonAIUsageMeter,
  verifyDaemonAiJwt,
  type DaemonAiCloudEntitlement,
} from '../../electron/services/daemon-ai-cloud'
import { resolveDaemonAICloudServerConfig } from '../../electron/services/daemon-ai-cloud/server'

const secret = 'test-secret'

async function listen(app: { listen: (port: number, host: string, callback: () => void) => Server }): Promise<{ baseUrl: string; server: Server }> {
  const server = await new Promise<Server>((resolve) => {
    const nextServer = app.listen(0, '127.0.0.1', () => resolve(nextServer))
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('server failed to bind')
  return { baseUrl: `http://127.0.0.1:${address.port}`, server }
}

function signJwt(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
  signingSecret = secret,
) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = crypto.createHmac('sha256', signingSecret).update(`${encodedHeader}.${encodedPayload}`).digest('base64url')
  return `${encodedHeader}.${encodedPayload}.${signature}`
}

describe('DAEMON AI Cloud production helpers', () => {
  it('resolves deployable server config from platform environment', () => {
    expect(resolveDaemonAICloudServerConfig({
      PORT: '8080',
      DAEMON_AI_CLOUD_HOST: '127.0.0.1',
      DAEMON_AI_CLOUD_DB_PATH: 'C:/daemon/staging.db',
      DAEMON_AI_CLOUD_ALLOW_UNREADY: '1',
    } as NodeJS.ProcessEnv)).toMatchObject({
      host: '127.0.0.1',
      port: 8080,
      dbPath: 'C:/daemon/staging.db',
      failOnMissingEnv: false,
      readiness: { ready: false },
    })

    expect(() => resolveDaemonAICloudServerConfig({ PORT: '99999' } as NodeJS.ProcessEnv)).toThrow(/port/i)
  })

  it('reports hosted runtime readiness from deployment environment', () => {
    expect(getDaemonAICloudRuntimeReadiness({} as NodeJS.ProcessEnv)).toMatchObject({
      ready: false,
      missing: expect.arrayContaining([
        'DAEMON_PRO_JWT_SECRET or DAEMON_AI_JWT_SECRET',
        'OPENAI_API_KEY or ANTHROPIC_API_KEY',
      ]),
      providers: [],
    })
    expect(getDaemonAICloudRuntimeReadiness({
      DAEMON_PRO_JWT_SECRET: 'secret',
      OPENAI_API_KEY: 'sk-test',
      DAEMON_PRO_PAY_TO: 'pay-to',
      DAEMON_PRO_ADMIN_SECRET: 'admin-secret',
      SOLANA_RPC_URL: 'https://rpc.example',
    } as NodeJS.ProcessEnv)).toMatchObject({
      ready: true,
      missing: [],
      providers: ['openai'],
    })
  })

  it('falls back to the DAEMON AI JWT secret when the Pro secret is blank', () => {
    expect(resolveDaemonAICloudJwtSecret({
      DAEMON_PRO_JWT_SECRET: '   ',
      DAEMON_AI_JWT_SECRET: 'fallback-secret',
    } as NodeJS.ProcessEnv)).toBe('fallback-secret')
  })

  it('supports previous JWT secrets during rotation windows', async () => {
    expect(resolveDaemonAICloudJwtSecrets({
      DAEMON_PRO_JWT_SECRET: 'new-secret',
      DAEMON_PRO_JWT_PREVIOUS_SECRETS: 'old-secret, older-secret ',
    } as NodeJS.ProcessEnv)).toEqual(['new-secret', 'old-secret', 'older-secret'])

    const previousToken = signJwt({
      sub: 'user-1',
      plan: 'pro',
      features: ['daemon-ai'],
      exp: Math.floor(Date.now() / 1000) + 60,
    }, undefined, 'old-secret')
    const verifier = new Hs256DaemonAiJwtAuthVerifier(['new-secret', 'old-secret'])

    await expect(verifier.verifyBearerToken(previousToken)).resolves.toMatchObject({
      userId: 'user-1',
      plan: 'pro',
    })
  })

  it('verifies DAEMON Pro JWT claims into a hosted AI entitlement', () => {
    const token = signJwt({
      sub: 'user-1',
      walletAddress: 'wallet-1',
      plan: 'operator',
      accessSource: 'holder',
      features: ['daemon-ai'],
      lane: 'reasoning',
      allowedLanes: ['auto', 'fast', 'standard', 'reasoning'],
      monthlyCredits: 7500,
      usedCredits: 12,
      entitlementExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      exp: Math.floor(Date.now() / 1000) + 60,
    })

    expect(verifyDaemonAiJwt(token, secret)).toMatchObject({
      userId: 'user-1',
      walletAddress: 'wallet-1',
      plan: 'operator',
      accessSource: 'holder',
      lane: 'reasoning',
      allowedLanes: ['auto', 'fast', 'standard', 'reasoning'],
      monthlyCredits: 7500,
      usedCredits: 12,
      entitlementExpiresAt: expect.any(String),
      features: expect.arrayContaining(['daemon-ai', 'cloud-agents']),
    })
  })

  it('rejects expired or unsigned hosted AI tokens', () => {
    const expired = signJwt({
      sub: 'user-1',
      plan: 'pro',
      features: ['daemon-ai'],
      exp: Math.floor(Date.now() / 1000) - 1,
    })
    const tampered = `${expired.slice(0, -3)}abc`

    expect(() => verifyDaemonAiJwt(expired, secret)).toThrow(/expired/i)
    expect(() => verifyDaemonAiJwt(tampered, secret)).toThrow(/signature/i)
  })

  it('meters credits by billing month and makes request IDs idempotent', async () => {
    const rows: Array<{ owner_key: string; request_id: string | null; daemon_credits_charged: number; created_at: number }> = []
    const db = {
      exec: vi.fn(),
      transaction: vi.fn((fn: () => void) => fn),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn((...args: unknown[]) => {
          if (sql.includes('WHERE request_id = ?')) {
            return rows.find((row) => row.request_id === args[0])
          }
          if (sql.includes('SUM(daemon_credits_charged)')) {
            const owner = String(args[0])
            const start = Number(args[1])
            return {
              used: rows
                .filter((row) => row.owner_key === owner && row.created_at >= start)
                .reduce((sum, row) => sum + row.daemon_credits_charged, 0),
            }
          }
          return undefined
        }),
        run: vi.fn((...args: unknown[]) => {
          rows.push({
            owner_key: String(args[3]),
            request_id: typeof args[9] === 'string' ? args[9] : null,
            daemon_credits_charged: Number(args[14]),
            created_at: Number(args[15]),
          })
        }),
      })),
    }
    const meter = new SqliteDaemonAIUsageMeter(db as never)
    const entitlement: DaemonAiCloudEntitlement = {
      userId: 'user-1',
      walletAddress: 'wallet-1',
      plan: 'pro',
      accessSource: 'payment',
      features: ['daemon-ai'],
      lane: 'standard',
      allowedLanes: ['auto', 'fast', 'standard'],
      monthlyCredits: 5,
      usedCredits: 0,
    }

    await meter.assertCredits(entitlement, 3)
    await meter.record({
      entitlement,
      feature: 'daemon-ai-chat',
      provider: 'openai',
      model: 'gpt-5.2',
      requestId: 'req-1',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        providerCostUsd: 0,
        daemonCreditsCharged: 3,
      },
    })
    await meter.record({
      entitlement,
      feature: 'daemon-ai-chat',
      provider: 'openai',
      model: 'gpt-5.2',
      requestId: 'req-1',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        providerCostUsd: 0,
        daemonCreditsCharged: 3,
      },
    })

    await expect(meter.getUsage(entitlement)).resolves.toMatchObject({ usedCredits: 3, monthlyCredits: 5 })
    await expect(meter.assertCredits(entitlement, 3)).rejects.toMatchObject({ status: 402 })
  })

  it('requires a live subscription row behind production JWTs', async () => {
    const walletAddress = 'wallet-1'
    const token = signJwt({
      sub: walletAddress,
      walletAddress,
      plan: 'pro',
      accessSource: 'payment',
      features: ['daemon-ai'],
      lane: 'standard',
      allowedLanes: ['auto', 'fast', 'standard'],
      monthlyCredits: 2_000,
      exp: Math.floor(Date.now() / 1000) + 300,
    })
    const subscriptionRow = {
      plan: 'pro',
      access_source: 'payment',
      features_json: JSON.stringify(['daemon-ai']),
      expires_at: Date.now() + 60_000,
      revoked_at: null,
    }
    let active = false
    const db = {
      exec: vi.fn(),
      transaction: vi.fn((fn: () => void) => fn),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn(() => {
          if (sql.includes('FROM daemon_subscriptions')) return active ? subscriptionRow : undefined
          return { used: 0 }
        }),
        run: vi.fn(),
      })),
    }
    const app = createProductionDaemonAICloudGateway(db as never, {
      DAEMON_PRO_JWT_SECRET: secret,
    } as NodeJS.ProcessEnv, {
      providers: [{
        id: 'openai',
        supports: () => true,
        generate: vi.fn(),
      }],
      usage: {
        getUsage: vi.fn(async () => ({ usedCredits: 0, monthlyCredits: 2_000, resetAt: Date.now() + 60_000 })),
        assertCredits: vi.fn(),
        record: vi.fn(),
      },
    })
    const { baseUrl, server } = await listen(app)
    try {
      const denied = await fetch(`${baseUrl}/v1/ai/features`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(denied.status).toBe(401)

      active = true
      const allowed = await fetch(`${baseUrl}/v1/ai/features`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await allowed.json()
      expect(allowed.status).toBe(200)
      expect(body.data).toMatchObject({
        hostedAvailable: true,
        plan: 'pro',
        accessSource: 'payment',
      })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })
})

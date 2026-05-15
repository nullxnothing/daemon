import type { Server } from 'node:http'
import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => 'valid-token'),
}))

import * as SecureKey from '../../electron/services/SecureKeyService'
import {
  DAEMON_AI_DEFAULT_API_BASE,
  DaemonAICloudClientError,
  fetchHostedFeatures,
  fetchHostedModels,
  fetchHostedUsage,
  getDaemonAICloudBase,
  getDaemonAICloudToken,
  isDaemonAICloudConfigured,
  runHostedChat,
} from '../../electron/services/DaemonAICloudClient'

describe('DaemonAICloudClient', () => {
  let server: Server | null = null
  const originalBase = process.env.DAEMON_AI_API_BASE
  const originalDisableDefaultCloud = process.env.DAEMON_AI_DISABLE_DEFAULT_CLOUD
  const originalProJwt = process.env.DAEMON_PRO_JWT
  const originalOperatorJwt = process.env.DAEMON_OPERATOR_JWT
  const originalUltraJwt = process.env.DAEMON_ULTRA_JWT
  const originalSmokeJwt = process.env.DAEMON_AI_SMOKE_JWT
  const originalAllowEnvJwt = process.env.DAEMON_AI_ALLOW_ENV_JWT
  const originalNodeEnv = process.env.NODE_ENV
  const getKeyMock = vi.mocked(SecureKey.getKey)

  afterEach(() => {
    server?.close()
    server = null
    if (originalBase == null) {
      delete process.env.DAEMON_AI_API_BASE
    } else {
      process.env.DAEMON_AI_API_BASE = originalBase
    }
    if (originalDisableDefaultCloud == null) {
      delete process.env.DAEMON_AI_DISABLE_DEFAULT_CLOUD
    } else {
      process.env.DAEMON_AI_DISABLE_DEFAULT_CLOUD = originalDisableDefaultCloud
    }
    if (originalProJwt == null) {
      delete process.env.DAEMON_PRO_JWT
    } else {
      process.env.DAEMON_PRO_JWT = originalProJwt
    }
    if (originalOperatorJwt == null) {
      delete process.env.DAEMON_OPERATOR_JWT
    } else {
      process.env.DAEMON_OPERATOR_JWT = originalOperatorJwt
    }
    if (originalUltraJwt == null) {
      delete process.env.DAEMON_ULTRA_JWT
    } else {
      process.env.DAEMON_ULTRA_JWT = originalUltraJwt
    }
    if (originalSmokeJwt == null) {
      delete process.env.DAEMON_AI_SMOKE_JWT
    } else {
      process.env.DAEMON_AI_SMOKE_JWT = originalSmokeJwt
    }
    if (originalAllowEnvJwt == null) {
      delete process.env.DAEMON_AI_ALLOW_ENV_JWT
    } else {
      process.env.DAEMON_AI_ALLOW_ENV_JWT = originalAllowEnvJwt
    }
    if (originalNodeEnv == null) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = originalNodeEnv
    }
    vi.clearAllMocks()
    getKeyMock.mockReturnValue('valid-token')
  })

  async function listen(app: express.Express): Promise<string> {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
    const address = server!.address()
    if (!address || typeof address === 'string') throw new Error('server failed to bind')
    return `http://127.0.0.1:${address.port}`
  }

  async function makeApi(): Promise<string> {
    const app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      if (req.header('authorization') !== 'Bearer valid-token') {
        res.status(401).json({ ok: false, code: 'daemon_ai_auth_required', error: 'bad token' })
        return
      }
      next()
    })
    app.get('/v1/ai/features', (_req, res) => {
      res.json({
        ok: true,
        data: {
          hostedAvailable: true,
          plan: 'pro',
          accessSource: 'payment',
          features: ['daemon-ai'],
        },
      })
    })
    app.get('/v1/ai/usage', (_req, res) => {
      res.json({
        ok: true,
        data: {
          plan: 'pro',
          accessSource: 'payment',
          monthlyCredits: 2_000,
          usedCredits: 10,
          remainingCredits: 1_990,
          resetAt: Date.now() + 100_000,
        },
      })
    })
    app.get('/v1/ai/models', (_req, res) => {
      res.json({
        ok: true,
        data: [
          {
            lane: 'standard',
            label: 'Standard',
            description: 'Hosted standard',
            hosted: true,
            byok: false,
            requiresPlan: 'pro',
          },
        ],
      })
    })
    app.post('/v1/ai/chat', (req, res) => {
      if (req.body.message === 'fail') {
        res.status(502).json({ ok: false, code: 'daemon_ai_provider_error', error: 'provider unavailable' })
        return
      }
      res.json({
        ok: true,
        data: {
          text: 'hosted answer',
          provider: 'openai',
          model: 'gpt-5.2',
          usage: {
            inputTokens: 11,
            outputTokens: 7,
            providerCostUsd: 0,
            daemonCreditsCharged: 1,
          },
        },
      })
    })
    return listen(app)
  }

  it('defaults the desktop hosted API base to the bundled cloud URL while keeping env overrides', () => {
    delete process.env.DAEMON_AI_API_BASE
    delete process.env.DAEMON_AI_DISABLE_DEFAULT_CLOUD

    expect(getDaemonAICloudBase()).toBe(DAEMON_AI_DEFAULT_API_BASE)
    expect(isDaemonAICloudConfigured()).toBe(true)

    process.env.DAEMON_AI_API_BASE = 'http://127.0.0.1:4021/'
    expect(getDaemonAICloudBase()).toBe('http://127.0.0.1:4021')

    delete process.env.DAEMON_AI_API_BASE
    process.env.DAEMON_AI_DISABLE_DEFAULT_CLOUD = '1'
    expect(getDaemonAICloudBase()).toBe('')
    expect(isDaemonAICloudConfigured()).toBe(false)
  })

  it('uses explicit non-production smoke JWT env fallback when no secure Pro token exists', () => {
    getKeyMock.mockReturnValue(null)
    process.env.NODE_ENV = 'development'
    delete process.env.DAEMON_PRO_JWT
    delete process.env.DAEMON_OPERATOR_JWT
    delete process.env.DAEMON_ULTRA_JWT
    process.env.DAEMON_AI_SMOKE_JWT = 'smoke-token'

    expect(getDaemonAICloudToken()).toBe('smoke-token')

    process.env.NODE_ENV = 'production'
    expect(getDaemonAICloudToken()).toBe(null)

    process.env.DAEMON_AI_ALLOW_ENV_JWT = '1'
    expect(getDaemonAICloudToken()).toBe('smoke-token')
  })

  it('accepts Operator and Ultra entitlement JWT env fallbacks outside production', () => {
    getKeyMock.mockReturnValue(null)
    process.env.NODE_ENV = 'development'
    delete process.env.DAEMON_PRO_JWT
    delete process.env.DAEMON_AI_SMOKE_JWT

    process.env.DAEMON_OPERATOR_JWT = 'operator-token'
    expect(getDaemonAICloudToken()).toBe('operator-token')

    delete process.env.DAEMON_OPERATOR_JWT
    process.env.DAEMON_ULTRA_JWT = 'ultra-token'
    expect(getDaemonAICloudToken()).toBe('ultra-token')
  })

  it('fetches hosted desktop features, usage, models, and chat with bearer auth', async () => {
    process.env.DAEMON_AI_API_BASE = await makeApi()

    await expect(fetchHostedFeatures()).resolves.toMatchObject({ hostedAvailable: true, plan: 'pro' })
    await expect(fetchHostedUsage()).resolves.toMatchObject({ remainingCredits: 1_990 })
    await expect(fetchHostedModels()).resolves.toEqual([
      expect.objectContaining({ lane: 'standard', hosted: true, byok: false }),
    ])
    await expect(runHostedChat({
      requestId: 'req-1',
      mode: 'ask',
      message: 'hello',
      usedContext: ['file:src/app.ts'],
      modelPreference: 'standard',
      prompt: 'full prompt',
    })).resolves.toMatchObject({
      text: 'hosted answer',
      provider: 'openai',
      model: 'gpt-5.2',
      usage: { daemonCreditsCharged: 1 },
    })
  })

  it('surfaces hosted provider failures with status and code', async () => {
    process.env.DAEMON_AI_API_BASE = await makeApi()

    await expect(runHostedChat({
      requestId: 'req-2',
      mode: 'ask',
      message: 'fail',
      usedContext: [],
      modelPreference: 'standard',
      prompt: 'full prompt',
    })).rejects.toMatchObject({
      name: 'DaemonAICloudClientError',
      status: 502,
      code: 'daemon_ai_provider_error',
      message: 'provider unavailable',
    } satisfies Partial<DaemonAICloudClientError>)
  })
})

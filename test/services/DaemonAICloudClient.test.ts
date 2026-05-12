import type { Server } from 'node:http'
import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => 'valid-token'),
}))

import {
  DaemonAICloudClientError,
  fetchHostedFeatures,
  fetchHostedModels,
  fetchHostedUsage,
  runHostedChat,
} from '../../electron/services/DaemonAICloudClient'

describe('DaemonAICloudClient', () => {
  let server: Server | null = null
  const originalBase = process.env.DAEMON_AI_API_BASE

  afterEach(() => {
    server?.close()
    server = null
    if (originalBase == null) {
      delete process.env.DAEMON_AI_API_BASE
    } else {
      process.env.DAEMON_AI_API_BASE = originalBase
    }
    vi.clearAllMocks()
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

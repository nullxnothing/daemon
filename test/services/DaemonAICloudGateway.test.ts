import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Server } from 'node:http'
import {
  createDaemonAICloudGateway,
  createOpenAIResponsesPayload,
  ModelRouter,
  normalizeCloudChatRequest,
} from '../../electron/services/daemon-ai-cloud'
import type {
  DaemonAiCloudEntitlement,
  DaemonAiModelProvider,
} from '../../electron/services/daemon-ai-cloud'

const entitlement: DaemonAiCloudEntitlement = {
  userId: 'user-1',
  walletAddress: 'wallet-1',
  plan: 'pro',
  accessSource: 'payment',
  features: ['daemon-ai'],
  monthlyCredits: 1_000,
  usedCredits: 100,
}

const openAiProvider: DaemonAiModelProvider = {
  id: 'openai',
  supports: () => true,
  generate: vi.fn(async () => ({
    text: 'gateway response',
    provider: 'openai',
    model: 'gpt-5.2',
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      providerCostUsd: 0,
      daemonCreditsCharged: 1,
    },
  })),
}

describe('DAEMON AI Cloud Gateway', () => {
  let server: Server | null = null

  afterEach(() => {
    server?.close()
    server = null
    vi.clearAllMocks()
  })

  async function listen(app: ReturnType<typeof createDaemonAICloudGateway>): Promise<string> {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
    const address = server!.address()
    if (!address || typeof address === 'string') throw new Error('server failed to bind')
    return `http://127.0.0.1:${address.port}`
  }

  it('normalizes hosted chat requests at the API boundary', () => {
    const result = normalizeCloudChatRequest({
      requestId: ' req-1 ',
      conversationId: ' conv-1 ',
      mode: 'plan',
      message: '  build it  ',
      prompt: '  full prompt  ',
      usedContext: [' file:a.ts ', '', 1 as unknown as string],
      modelPreference: 'reasoning',
      context: { activeFile: true, projectTree: false, gitDiff: true },
    })

    expect(result).toMatchObject({
      requestId: 'req-1',
      conversationId: 'conv-1',
      mode: 'plan',
      accessMode: 'hosted',
      message: 'build it',
      prompt: 'full prompt',
      usedContext: ['file:a.ts'],
      modelPreference: 'reasoning',
      context: {
        activeFile: true,
        projectTree: false,
        gitDiff: true,
        terminalLogs: false,
        walletContext: false,
      },
    })
  })

  it('prefers OpenAI for the primary hosted lanes when available', () => {
    const anthropicProvider: DaemonAiModelProvider = {
      id: 'anthropic',
      supports: () => true,
      generate: vi.fn(),
    }
    const router = new ModelRouter([anthropicProvider, openAiProvider])

    expect(router.resolve('standard').id).toBe('openai')
    expect(router.resolve('reasoning').id).toBe('openai')
  })

  it('maps DAEMON requests to the OpenAI Responses API payload', () => {
    const payload = createOpenAIResponsesPayload({
      requestId: 'req-1',
      mode: 'ask',
      message: 'why failing?',
      prompt: 'Mode: ask\nUser request: why failing?',
      usedContext: ['file:src/app.ts'],
      modelLane: 'standard',
    })

    expect(payload.model).toBeTruthy()
    expect(payload.metadata).toMatchObject({
      daemon_request_id: 'req-1',
      daemon_model_lane: 'standard',
    })
    expect(JSON.stringify(payload)).toContain('input_text')
    expect(JSON.stringify(payload)).toContain('file:src/app.ts')
  })

  it('serves /v1/ai/chat with entitlement and usage hooks', async () => {
    const record = vi.fn(async () => {})
    const assertCredits = vi.fn(async () => {})
    const app = createDaemonAICloudGateway({
      providers: [openAiProvider],
      auth: {
        verifyBearerToken: vi.fn(async (token: string) => {
          if (token !== 'valid-token') throw new Error('invalid token')
          return entitlement
        }),
      },
      usage: { assertCredits, record },
    })
    const baseUrl = await listen(app)

    const response = await fetch(`${baseUrl}/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
      body: JSON.stringify({
        requestId: 'req-1',
        mode: 'ask',
        message: 'hello',
        prompt: 'hello with project context',
        modelPreference: 'standard',
      }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      data: {
        text: 'gateway response',
        provider: 'openai',
        model: 'gpt-5.2',
      },
    })
    expect(assertCredits).toHaveBeenCalledWith(entitlement, expect.any(Number))
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      entitlement,
      provider: 'openai',
      model: 'gpt-5.2',
      requestId: 'req-1',
    }))
  })

  it('rejects missing hosted bearer tokens', async () => {
    const app = createDaemonAICloudGateway({
      providers: [openAiProvider],
      auth: { verifyBearerToken: vi.fn() },
      usage: {
        assertCredits: vi.fn(),
        record: vi.fn(),
      },
    })
    const baseUrl = await listen(app)

    const response = await fetch(`${baseUrl}/v1/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello', prompt: 'hello' }),
    })
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ ok: false, error: 'Missing bearer token' })
  })
})

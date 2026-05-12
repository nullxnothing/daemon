import express, { type NextFunction, type Request, type Response } from 'express'
import { estimateRequestCredits } from './creditMath'
import { ModelRouter } from './ModelRouter'
import { normalizeCloudChatRequest } from './requestValidation'
import type {
  DaemonAiCloudAuthContext,
  DaemonAiCloudChatResponse,
  DaemonAiCloudGatewayOptions,
} from './types'

type AuthenticatedRequest = Request & {
  daemonAuth?: DaemonAiCloudAuthContext
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createDaemonAICloudGateway(options: DaemonAiCloudGatewayOptions): express.Express {
  if (!options.providers.length) throw new Error('At least one DAEMON AI model provider is required')
  const router = new ModelRouter(options.providers)
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  app.use(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.path === '/health') return next()
    const token = bearerToken(req)
    if (!token) return res.status(401).json({ ok: false, error: 'Missing bearer token' })
    try {
      const entitlement = await options.auth.verifyBearerToken(token)
      if (!entitlement.features.includes('daemon-ai')) {
        return res.status(403).json({ ok: false, error: 'DAEMON AI entitlement required' })
      }
      req.daemonAuth = { token, entitlement }
      return next()
    } catch (error) {
      return res.status(401).json({ ok: false, error: errorMessage(error) })
    }
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'daemon-ai-cloud' })
  })

  app.get('/v1/ai/features', (req: AuthenticatedRequest, res) => {
    const entitlement = req.daemonAuth!.entitlement
    res.json({
      ok: true,
      data: {
        hostedAvailable: entitlement.features.includes('daemon-ai'),
        plan: entitlement.plan,
        accessSource: entitlement.accessSource,
        features: entitlement.features,
      },
    })
  })

  app.get('/v1/ai/usage', (req: AuthenticatedRequest, res) => {
    const entitlement = req.daemonAuth!.entitlement
    res.json({
      ok: true,
      data: {
        plan: entitlement.plan,
        accessSource: entitlement.accessSource,
        monthlyCredits: entitlement.monthlyCredits,
        usedCredits: entitlement.usedCredits,
        remainingCredits: Math.max(entitlement.monthlyCredits - entitlement.usedCredits, 0),
      },
    })
  })

  app.get('/v1/ai/models', (_req, res) => {
    res.json({
      ok: true,
      data: ['auto', 'fast', 'standard', 'reasoning', 'premium'].map((lane) => ({
        lane,
        hosted: true,
      })),
    })
  })

  app.post('/v1/ai/chat', async (req: AuthenticatedRequest, res) => {
    try {
      const input = normalizeCloudChatRequest(req.body)
      const entitlement = req.daemonAuth!.entitlement
      const estimatedCredits = estimateRequestCredits(input.prompt, input.modelPreference)
      await options.usage.assertCredits(entitlement, estimatedCredits)

      const provider = router.resolve(input.modelPreference)
      const result = await provider.generate({
        requestId: input.requestId,
        mode: input.mode,
        message: input.message,
        prompt: input.prompt,
        usedContext: input.usedContext,
        modelLane: input.modelPreference,
      })
      const charged = result.usage.daemonCreditsCharged ?? estimatedCredits
      const usage = {
        ...result.usage,
        daemonCreditsCharged: charged,
      }
      await options.usage.record({
        entitlement,
        feature: 'daemon-ai-chat',
        provider: result.provider,
        model: result.model,
        usage,
        requestId: input.requestId,
      })

      const data: DaemonAiCloudChatResponse = {
        text: result.text,
        provider: result.provider,
        model: result.model,
        usage,
      }
      return res.json({ ok: true, data })
    } catch (error) {
      return res.status(400).json({ ok: false, error: errorMessage(error) })
    }
  })

  return app
}

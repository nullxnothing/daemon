import express, { type NextFunction, type Request, type Response } from 'express'
import { estimateRequestCredits } from './creditMath'
import { ModelRouter } from './ModelRouter'
import { normalizeCloudChatRequest } from './requestValidation'
import type { DaemonAiModelInfo } from '../../shared/types'
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

function monthResetAt(now = Date.now()): number {
  const date = new Date(now)
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()
}

function hostedModelCatalog(): DaemonAiModelInfo[] {
  return [
    { lane: 'auto', label: 'Auto', description: 'DAEMON chooses the right hosted lane for the request.', hosted: true, byok: false, requiresPlan: 'pro' },
    { lane: 'fast', label: 'Fast', description: 'Low-latency summaries, small questions, and quick debugging.', hosted: true, byok: false, requiresPlan: 'pro' },
    { lane: 'standard', label: 'Standard', description: 'Default coding help and project-aware chat.', hosted: true, byok: false, requiresPlan: 'pro' },
    { lane: 'reasoning', label: 'Reasoning', description: 'Architecture, deeper debugging, and multi-step analysis.', hosted: true, byok: false, requiresPlan: 'operator' },
    { lane: 'premium', label: 'Premium', description: 'Highest-quality hosted model lane for hard builds and audits.', hosted: true, byok: false, requiresPlan: 'ultra' },
  ]
}

function errorCode(error: unknown): string {
  const message = errorMessage(error).toLowerCase()
  if (message.includes('credit') || message.includes('quota') || message.includes('billing')) return 'daemon_ai_insufficient_credits'
  if (message.includes('provider') || message.includes('model')) return 'daemon_ai_provider_error'
  if (message.includes('required') || message.includes('too large') || message.includes('invalid')) return 'daemon_ai_bad_request'
  return 'daemon_ai_cloud_error'
}

function statusForError(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status
  }
  const code = errorCode(error)
  if (code === 'daemon_ai_insufficient_credits') return 402
  if (code === 'daemon_ai_provider_error') return 502
  if (code === 'daemon_ai_bad_request') return 400
  return 500
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
        resetAt: monthResetAt(),
      },
    })
  })

  app.get('/v1/ai/models', (_req, res) => {
    res.json({
      ok: true,
      data: hostedModelCatalog(),
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
      return res.status(statusForError(error)).json({ ok: false, code: errorCode(error), error: errorMessage(error) })
    }
  })

  return app
}

import { randomUUID } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { canUseHostedModelLane, getHostedLaneRequiredPlan } from '../EntitlementService'
import { estimateRequestCredits } from './creditMath'
import { ModelRouter } from './ModelRouter'
import { normalizeCloudChatRequest } from './requestValidation'
import type { DaemonAiModelInfo } from '../../shared/types'
import type {
  DaemonAiCloudAuthContext,
  DaemonAiCloudChatResponse,
  DaemonAiCloudEntitlement,
  DaemonAiCloudGatewayOptions,
  DaemonAiProviderResult,
} from './types'

type AuthenticatedRequest = Request & {
  daemonAuth?: DaemonAiCloudAuthContext
}

const CLOUD_RATE_LIMIT_WINDOW_MS = 60_000
const CLOUD_RATE_LIMIT_MAX = 240

class DaemonAiCloudHttpError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'DaemonAiCloudHttpError'
    this.status = status
    this.code = code
  }
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization') ?? ''
  if (header.length <= 6 || header.slice(0, 6).toLowerCase() !== 'bearer') return null

  let tokenStart = 6
  while (header[tokenStart] === ' ' || header[tokenStart] === '\t') tokenStart += 1
  if (tokenStart === 6) return null

  const token = header.slice(tokenStart).trim()
  return token || null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function authErrorMessage(): string {
  return 'Invalid or expired DAEMON AI token'
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

function canUseEntitledLane(entitlement: DaemonAiCloudEntitlement, lane: DaemonAiModelInfo['lane']): boolean {
  return entitlement.allowedLanes.includes(lane) &&
    canUseHostedModelLane({ active: true, plan: entitlement.plan, features: entitlement.features }, lane)
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
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

function publicErrorMessage(error: unknown): string {
  if (error instanceof DaemonAiCloudHttpError) return error.message
  const code = errorCode(error)
  if (code === 'daemon_ai_bad_request') return errorMessage(error)
  if (code === 'daemon_ai_insufficient_credits') return 'DAEMON AI credits exhausted for this billing period'
  if (code === 'daemon_ai_provider_error') return 'DAEMON AI provider is unavailable. Retry shortly.'
  return 'DAEMON AI Cloud request failed'
}

export function createDaemonAICloudGateway(options: DaemonAiCloudGatewayOptions): express.Express {
  if (!options.providers.length) throw new Error('At least one DAEMON AI model provider is required')
  const router = new ModelRouter(options.providers)
  const app = express()
  app.use(express.json({ limit: '2mb' }))

  const cloudLimiter = rateLimit({
    windowMs: CLOUD_RATE_LIMIT_WINDOW_MS,
    limit: CLOUD_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ ok: false, code: 'daemon_ai_rate_limited', error: 'Too many DAEMON AI requests. Retry shortly.' })
    },
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'daemon-ai-cloud' })
  })

  app.use(cloudLimiter)

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
      return res.status(401).json({ ok: false, code: 'daemon_ai_auth_required', error: authErrorMessage() })
    }
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
        lane: entitlement.lane,
        allowedLanes: entitlement.allowedLanes,
        entitlementExpiresAt: entitlement.entitlementExpiresAt ?? null,
      },
    })
  })

  app.get('/v1/ai/usage', async (req: AuthenticatedRequest, res) => {
    const entitlement = req.daemonAuth!.entitlement
    const usage = await options.usage.getUsage?.(entitlement)
    const monthlyCredits = usage?.monthlyCredits ?? entitlement.monthlyCredits
    const usedCredits = usage?.usedCredits ?? entitlement.usedCredits
    res.json({
      ok: true,
      data: {
        plan: entitlement.plan,
        accessSource: entitlement.accessSource,
        lane: entitlement.lane,
        allowedLanes: entitlement.allowedLanes,
        monthlyCredits,
        usedCredits,
        remainingCredits: Math.max(monthlyCredits - usedCredits, 0),
        resetAt: usage?.resetAt ?? monthResetAt(),
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
    const requestId = randomUUID()
    try {
      const input = normalizeCloudChatRequest(req.body)
      const entitlement = req.daemonAuth!.entitlement
      if (!canUseEntitledLane(entitlement, input.modelPreference)) {
        const required = getHostedLaneRequiredPlan(input.modelPreference)
        throw new DaemonAiCloudHttpError(
          403,
          'daemon_ai_plan_required',
          `Hosted ${input.modelPreference} DAEMON AI requires the ${required} plan or higher.`,
        )
      }
      const estimatedCredits = estimateRequestCredits(input.prompt, input.modelPreference)
      if (options.usage.reserveCredits) {
        await options.usage.reserveCredits(entitlement, estimatedCredits, requestId)
      } else {
        await options.usage.assertCredits(entitlement, estimatedCredits)
      }

      const provider = router.resolve(input.modelPreference)
      let result: DaemonAiProviderResult
      try {
        result = await provider.generate({
          requestId,
          mode: input.mode,
          message: input.message,
          prompt: input.prompt,
          usedContext: input.usedContext,
          modelLane: input.modelPreference,
        })
      } catch (error) {
        await options.usage.releaseReservedCredits?.(requestId)
        throw error
      }
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
        requestId,
      })

      const data: DaemonAiCloudChatResponse = {
        text: result.text,
        provider: result.provider,
        model: result.model,
        usage,
        requestId,
      }
      return res.json({ ok: true, data })
    } catch (error) {
      return res.status(statusForError(error)).json({
        ok: false,
        code: errorCode(error),
        error: publicErrorMessage(error),
        requestId,
      })
    }
  })

  return app
}

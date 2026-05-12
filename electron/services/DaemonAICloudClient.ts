import type {
  DaemonAiChatMode,
  DaemonAiContextOptions,
  DaemonAiFeatureState,
  DaemonAiModelInfo,
  DaemonAiModelLane,
  DaemonAiUsageEvent,
  DaemonAiUsageSnapshot,
} from '../shared/types'
import * as SecureKey from './SecureKeyService'

const PRO_JWT_KEY = 'daemon_pro_jwt'

export type HostedUsageReport = {
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  providerCostUsd?: number
  daemonCreditsCharged?: number
  creditsCharged?: number
}

export type HostedChatResult = {
  text: string
  provider?: DaemonAiUsageEvent['provider']
  model?: string
  usage?: HostedUsageReport
}

export interface HostedChatInput {
  conversationId?: string | null
  mode?: DaemonAiChatMode
  message: string
  context?: DaemonAiContextOptions
  usedContext: string[]
  modelPreference: DaemonAiModelLane
  requestId: string
  prompt: string
}

export class DaemonAICloudClientError extends Error {
  status: number
  code: string

  constructor(status: number, message: string, code = 'daemon_ai_cloud_error') {
    super(message)
    this.name = 'DaemonAICloudClientError'
    this.status = status
    this.code = code
  }
}

type ApiBody<T> = {
  ok?: boolean
  data?: T
  error?: string
  code?: string
}

export function getDaemonAICloudBase(): string {
  return (process.env.DAEMON_AI_API_BASE ?? '').replace(/\/+$/, '')
}

export function isDaemonAICloudConfigured(): boolean {
  return Boolean(getDaemonAICloudBase())
}

export function getDaemonAICloudToken(): string | null {
  return SecureKey.getKey(PRO_JWT_KEY)
}

function cloudHeaders(token: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-DAEMON-Client': 'desktop-v4',
  }
}

function normalizeProvider(input: unknown): DaemonAiUsageEvent['provider'] | undefined {
  switch (input) {
    case 'openai':
    case 'anthropic':
    case 'google':
    case 'local':
    case 'daemon-cloud':
    case 'other':
      return input
    default:
      return undefined
  }
}

function requireCloudConfig(apiBase = getDaemonAICloudBase(), token = getDaemonAICloudToken()): { apiBase: string; token: string } {
  if (!apiBase) {
    throw new DaemonAICloudClientError(503, 'DAEMON AI Cloud is not configured. Set DAEMON_AI_API_BASE or use BYOK mode.', 'daemon_ai_cloud_not_configured')
  }
  if (!token) {
    throw new DaemonAICloudClientError(401, 'DAEMON AI hosted mode requires active Pro or holder access.', 'daemon_ai_auth_required')
  }
  return { apiBase, token }
}

export async function daemonAICloudFetch<T>(
  pathSuffix: string,
  init: RequestInit = {},
  options: { apiBase?: string; token?: string | null } = {},
): Promise<T> {
  const { apiBase, token } = requireCloudConfig(options.apiBase, options.token ?? getDaemonAICloudToken())
  const response = await fetch(`${apiBase}${pathSuffix}`, {
    ...init,
    headers: {
      ...cloudHeaders(token),
      ...(init.headers ?? {}),
    },
  })

  let body: ApiBody<T> | null = null
  try {
    body = (await response.json()) as ApiBody<T>
  } catch {
    body = null
  }

  if (!response.ok || body?.ok === false) {
    throw new DaemonAICloudClientError(
      response.status,
      body?.error ?? `DAEMON AI Cloud returned HTTP ${response.status}`,
      body?.code ?? 'daemon_ai_cloud_error',
    )
  }

  return (body?.data ?? body) as T
}

export async function fetchHostedFeatures(): Promise<Pick<DaemonAiFeatureState, 'hostedAvailable' | 'plan' | 'accessSource' | 'features'>> {
  return daemonAICloudFetch('/v1/ai/features')
}

export async function fetchHostedUsage(): Promise<DaemonAiUsageSnapshot> {
  return daemonAICloudFetch('/v1/ai/usage')
}

export async function fetchHostedModels(): Promise<DaemonAiModelInfo[]> {
  return daemonAICloudFetch('/v1/ai/models')
}

export async function runHostedChat(input: HostedChatInput): Promise<HostedChatResult> {
  const data = await daemonAICloudFetch<{
    text?: string
    provider?: unknown
    model?: unknown
    usage?: HostedUsageReport
  }>('/v1/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      conversationId: input.conversationId,
      mode: input.mode,
      message: input.message,
      context: input.context,
      usedContext: input.usedContext,
      modelPreference: input.modelPreference,
      requestId: input.requestId,
      prompt: input.prompt,
    }),
  })

  if (!data.text) {
    throw new DaemonAICloudClientError(502, 'DAEMON AI Cloud returned an empty response', 'daemon_ai_empty_response')
  }

  return {
    text: data.text,
    provider: normalizeProvider(data.provider),
    model: typeof data.model === 'string' && data.model.trim() ? data.model : undefined,
    usage: data.usage,
  }
}

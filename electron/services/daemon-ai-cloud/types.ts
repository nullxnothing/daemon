import type {
  DaemonAiAccessMode,
  DaemonAiChatMode,
  DaemonAiContextOptions,
  DaemonAiModelLane,
  DaemonAiUsageEvent,
  DaemonPlanId,
  ProAccessSource,
} from '../../shared/types'

export type DaemonAiCloudProvider = Extract<DaemonAiUsageEvent['provider'], 'openai' | 'anthropic' | 'google' | 'other'>

export interface DaemonAiCloudUsage {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  providerCostUsd: number
  daemonCreditsCharged: number
}

export interface DaemonAiCloudChatRequest {
  requestId?: string
  conversationId?: string | null
  mode?: DaemonAiChatMode
  message: string
  prompt: string
  context?: DaemonAiContextOptions
  usedContext?: string[]
  modelPreference?: DaemonAiModelLane
}

export interface DaemonAiCloudChatResponse {
  text: string
  provider: DaemonAiCloudProvider
  model: string
  usage: DaemonAiCloudUsage
}

export interface DaemonAiCloudEntitlement {
  userId: string | null
  walletAddress?: string | null
  plan: DaemonPlanId
  accessSource: ProAccessSource | null
  features: string[]
  monthlyCredits: number
  usedCredits: number
}

export interface DaemonAiCloudAuthContext {
  token: string
  entitlement: DaemonAiCloudEntitlement
}

export interface DaemonAiCloudAuthVerifier {
  verifyBearerToken(token: string): Promise<DaemonAiCloudEntitlement>
}

export interface DaemonAiCloudUsageMeter {
  getUsage?(entitlement: DaemonAiCloudEntitlement): Promise<{
    usedCredits: number
    monthlyCredits?: number
    resetAt?: number
  }>
  assertCredits(entitlement: DaemonAiCloudEntitlement, estimatedCredits: number): Promise<void>
  record(event: {
    entitlement: DaemonAiCloudEntitlement
    feature: string
    provider: DaemonAiCloudProvider
    model: string
    usage: DaemonAiCloudUsage
    requestId?: string | null
  }): Promise<void>
}

export interface DaemonAiProviderRequest {
  requestId?: string | null
  mode: DaemonAiChatMode
  message: string
  prompt: string
  usedContext: string[]
  modelLane: DaemonAiModelLane
}

export interface DaemonAiProviderResult {
  text: string
  provider: DaemonAiCloudProvider
  model: string
  usage: Omit<DaemonAiCloudUsage, 'daemonCreditsCharged'> & {
    daemonCreditsCharged?: number
  }
}

export interface DaemonAiModelProvider {
  id: DaemonAiCloudProvider
  supports(lane: DaemonAiModelLane): boolean
  generate(input: DaemonAiProviderRequest): Promise<DaemonAiProviderResult>
}

export interface DaemonAiCloudGatewayOptions {
  auth: DaemonAiCloudAuthVerifier
  usage: DaemonAiCloudUsageMeter
  providers: DaemonAiModelProvider[]
}

export interface NormalizedDaemonAiCloudChatRequest {
  requestId: string | null
  conversationId: string | null
  mode: DaemonAiChatMode
  accessMode: DaemonAiAccessMode
  message: string
  prompt: string
  context: DaemonAiContextOptions
  usedContext: string[]
  modelPreference: DaemonAiModelLane
}

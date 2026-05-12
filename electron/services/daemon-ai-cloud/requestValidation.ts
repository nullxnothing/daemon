import type {
  DaemonAiAccessMode,
  DaemonAiChatMode,
  DaemonAiModelLane,
} from '../../shared/types'
import type {
  DaemonAiCloudChatRequest,
  NormalizedDaemonAiCloudChatRequest,
} from './types'

const MAX_MESSAGE_CHARS = 24_000
const MAX_PROMPT_CHARS = 120_000
const MAX_USED_CONTEXT_ITEMS = 80
const VALID_CHAT_MODES = new Set<DaemonAiChatMode>(['ask', 'plan'])
const VALID_MODEL_LANES = new Set<DaemonAiModelLane>(['auto', 'fast', 'standard', 'reasoning', 'premium'])

function optionalString(input: unknown): string | null {
  return typeof input === 'string' && input.trim() ? input.trim() : null
}

function normalizeMode(input: unknown): DaemonAiChatMode {
  return VALID_CHAT_MODES.has(input as DaemonAiChatMode) ? input as DaemonAiChatMode : 'ask'
}

function normalizeLane(input: unknown): DaemonAiModelLane {
  return VALID_MODEL_LANES.has(input as DaemonAiModelLane) ? input as DaemonAiModelLane : 'auto'
}

function normalizeUsedContext(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_USED_CONTEXT_ITEMS)
}

export function normalizeCloudChatRequest(input: DaemonAiCloudChatRequest): NormalizedDaemonAiCloudChatRequest {
  if (!input || typeof input.message !== 'string') throw new Error('message required')
  if (typeof input.prompt !== 'string') throw new Error('prompt required')

  const message = input.message.trim()
  const prompt = input.prompt.trim()
  if (!message) throw new Error('message required')
  if (!prompt) throw new Error('prompt required')
  if (message.length > MAX_MESSAGE_CHARS) {
    throw new Error(`message is too large; limit is ${MAX_MESSAGE_CHARS} characters`)
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`prompt is too large; limit is ${MAX_PROMPT_CHARS} characters`)
  }

  return {
    requestId: optionalString(input.requestId),
    conversationId: optionalString(input.conversationId),
    mode: normalizeMode(input.mode),
    accessMode: 'hosted' satisfies DaemonAiAccessMode,
    message,
    prompt,
    context: {
      activeFile: input.context?.activeFile !== false,
      projectTree: input.context?.projectTree !== false,
      gitDiff: input.context?.gitDiff === true,
      terminalLogs: input.context?.terminalLogs === true,
      walletContext: input.context?.walletContext === true,
    },
    usedContext: normalizeUsedContext(input.usedContext),
    modelPreference: normalizeLane(input.modelPreference),
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AriaTransport } from '../../electron/services/AriaAgentService'

// Mock the operator loop's heavy import chain. providers/claudeAuth stays REAL:
// these tests exercise the actual auth-error classification and user-facing copy.
const insertedMessages: Array<{ role: string; content: string; metadata: string }> = []
vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      run: (...params: unknown[]) => {
        if (sql.startsWith('INSERT INTO aria_messages')) {
          insertedMessages.push({
            role: String(params[1]),
            content: String(params[2]),
            metadata: String(params[3]),
          })
        }
        return { changes: 1 }
      },
      get: () => undefined,
      all: () => [],
    }),
  }),
}))

const runClaudeAgentTurn = vi.fn()
const getClaudeKeySource = vi.fn(() => 'env')
vi.mock('../../electron/services/providers/ClaudeProvider', () => ({
  runClaudeAgentTurn: (...args: unknown[]) => runClaudeAgentTurn(...args),
  getClaudeKeySource: () => getClaudeKeySource(),
}))

const getFeatureProvider = vi.fn()
vi.mock('../../electron/services/providers/ProviderRegistry', () => ({
  get: vi.fn(() => ({ getConnection: () => ({ isAuthenticated: true, authMode: 'cli' }) })),
  getFeatureProvider: (...args: unknown[]) => getFeatureProvider(...args),
  getPreferences: vi.fn(() => ({ aria: { provider: 'claude', model: 'standard' } })),
}))

const resolveOperatorBackend = vi.fn(() => 'claude')
const getGlmEndpoint = vi.fn(() => null)
vi.mock('../../electron/services/providers/glmConfig', () => ({
  resolveOperatorBackend: () => resolveOperatorBackend(),
  getGlmEndpoint: () => getGlmEndpoint(),
}))

vi.mock('../../electron/services/DaemonAIService', () => ({ recordLocalAiUsage: vi.fn() }))
vi.mock('../../electron/services/MemoryService', () => ({ createSuggestion: vi.fn() }))
vi.mock('../../electron/services/aria/contextAssembler', () => ({
  assembleSystemPrompt: vi.fn(async () => ({ system: 'sys', recalled: [] })),
}))
vi.mock('../../electron/services/aria/patchUtils', () => ({
  laneToClaudeModel: vi.fn(() => 'sonnet'),
  buildPlanSteps: vi.fn(() => []),
  buildPatchProposal: vi.fn(),
}))
vi.mock('../../electron/services/aria/tools/shared', () => ({
  clusterMark: (summary: string) => summary,
}))
vi.mock('../../electron/services/aria/toolCatalog', () => ({
  ARIA_TOOLS: [],
  getTool: () => undefined,
}))
vi.mock('../../electron/services/aria/AriaTool', () => ({
  toAnthropicTools: () => [],
}))

import { sendMessage } from '../../electron/services/AriaAgentService'

const snapshot = {
  activeProjectId: null,
  activeProjectPath: null,
  currentPanelId: null,
  openFilePath: null,
  chips: { activeFile: false, projectTree: false, gitDiff: false, terminalLogs: false, walletContext: false },
} as never

// Long enough (and question-shaped) to never hit the direct-tool fast path.
const QUESTION = 'Can you walk me through what the swap orchestrator does on a failed quote?'

function makeTransport() {
  return {
    emit: vi.fn(),
    requestApproval: vi.fn(async () => true),
    requestPatchDecision: vi.fn(async () => 'discard' as const),
    runUiEffect: vi.fn(async () => undefined),
  } satisfies AriaTransport
}

function noticeEvents(transport: ReturnType<typeof makeTransport>) {
  return transport.emit.mock.calls
    .map(([ev]) => ev as { kind: string; level?: string; text?: string; messageId?: string })
    .filter((ev) => ev.kind === 'notice')
}

const authError = () => Object.assign(new Error('401 {"type":"authentication_error"}'), { status: 401 })

beforeEach(() => {
  vi.clearAllMocks()
  insertedMessages.length = 0
  resolveOperatorBackend.mockReturnValue('claude')
  getGlmEndpoint.mockReturnValue(null)
  getClaudeKeySource.mockReturnValue('env')
})

describe('sendMessage — Anthropic auth degradation is surfaced, never silent', () => {
  it('emits a warn banner naming the shell env key, then answers via CLI without merging the notice into the reply', async () => {
    runClaudeAgentTurn.mockRejectedValue(authError())
    getFeatureProvider.mockReturnValue({
      id: 'claude',
      getConnection: () => ({ isAuthenticated: true, authMode: 'cli' }),
      runPrompt: vi.fn(async () => 'plain cli answer'),
    })

    const transport = makeTransport()
    const res = await sendMessage('sess-1', QUESTION, snapshot, transport)

    const notices = noticeEvents(transport)
    expect(notices).toHaveLength(1)
    expect(notices[0].level).toBe('warn')
    expect(notices[0].messageId).toBe('sess-1')
    expect(notices[0].text).toContain('shell environment')
    expect(notices[0].text).toContain('ANTHROPIC_API_KEY')
    // The reply stays clean — the warning lives in the banner, not the answer.
    expect(res.text).toBe('plain cli answer')
    // The condition survives a history reload via message metadata.
    const assistant = insertedMessages.find((m) => m.role === 'assistant')
    expect(assistant).toBeDefined()
    expect(JSON.parse(assistant!.metadata).notice).toContain('shell environment')
  })

  it('names the stored key when that credential was in play', async () => {
    getClaudeKeySource.mockReturnValue('stored')
    runClaudeAgentTurn.mockRejectedValue(authError())
    getFeatureProvider.mockReturnValue({
      id: 'claude',
      getConnection: () => ({ isAuthenticated: true, authMode: 'cli' }),
      runPrompt: vi.fn(async () => 'answer'),
    })

    const transport = makeTransport()
    await sendMessage('sess-2', QUESTION, snapshot, transport)

    const notices = noticeEvents(transport)
    expect(notices).toHaveLength(1)
    expect(notices[0].text).toContain('saved in Settings')
    expect(notices[0].text).not.toContain('shell environment')
  })

  it('still surfaces the banner when no CLI fallback exists and keeps the reply text short', async () => {
    runClaudeAgentTurn.mockRejectedValue(authError())
    getFeatureProvider.mockReturnValue({ id: 'codex' })

    const transport = makeTransport()
    const res = await sendMessage('sess-3', QUESTION, snapshot, transport)

    expect(noticeEvents(transport)).toHaveLength(1)
    expect(res.text).toContain('authentication failed')
    const assistant = insertedMessages.find((m) => m.role === 'assistant')
    expect(JSON.parse(assistant!.metadata).notice).toContain('ANTHROPIC_API_KEY')
  })

  it('does not blame the Anthropic key when a GLM endpoint turn fails auth', async () => {
    resolveOperatorBackend.mockReturnValue('glm')
    getGlmEndpoint.mockReturnValue({ apiKey: 'z', baseURL: 'https://api.z.ai/api/anthropic', model: 'glm-4.7' } as never)
    runClaudeAgentTurn.mockRejectedValue(authError())
    getFeatureProvider.mockReturnValue({ id: 'codex' })

    const transport = makeTransport()
    const res = await sendMessage('sess-4', QUESTION, snapshot, transport)

    expect(noticeEvents(transport)).toHaveLength(0)
    expect(res.text).toContain('Error:')
  })

  it('does not classify network failures as auth degradation', async () => {
    runClaudeAgentTurn.mockRejectedValue(new Error('ECONNRESET'))
    getFeatureProvider.mockReturnValue({
      id: 'claude',
      getConnection: () => ({ isAuthenticated: true, authMode: 'cli' }),
      runPrompt: vi.fn(async () => 'cli answer'),
    })

    const transport = makeTransport()
    const res = await sendMessage('sess-5', QUESTION, snapshot, transport)

    expect(noticeEvents(transport)).toHaveLength(0)
    expect(res.text).toBe('cli answer')
  })
})

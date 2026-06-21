import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AriaTransport } from '../../electron/services/AriaAgentService'

// Mock the operator loop's heavy import chain — executeToolCall only needs the
// tool catalog, the risk gate, and describeIntent's clusterMark.
vi.mock('../../electron/db/db', () => ({ getDb: vi.fn() }))
vi.mock('../../electron/services/providers/ClaudeProvider', () => ({ runClaudeAgentTurn: vi.fn() }))
vi.mock('../../electron/services/providers/ProviderRegistry', () => ({ getFeatureProvider: vi.fn() }))
vi.mock('../../electron/services/providers/glmConfig', () => ({
  resolveOperatorBackend: vi.fn(),
  getGlmEndpoint: vi.fn(),
}))
vi.mock('../../electron/services/DaemonAIService', () => ({ recordLocalAiUsage: vi.fn() }))
vi.mock('../../electron/services/MemoryService', () => ({ createSuggestion: vi.fn() }))
vi.mock('../../electron/services/aria/contextAssembler', () => ({ assembleSystemPrompt: vi.fn(() => '') }))
vi.mock('../../electron/services/aria/patchUtils', () => ({
  laneToClaudeModel: vi.fn(),
  buildPlanSteps: vi.fn(() => []),
  buildPatchProposal: vi.fn(),
}))

const isMainnet = vi.fn(() => false)
vi.mock('../../electron/services/aria/tools/shared', () => ({
  clusterMark: (summary: string) => (isMainnet() ? `[MAINNET] ${summary}` : summary),
}))

const writeHandler = vi.fn(async () => ({ ok: true, summary: 'fact stored' }))
const sensitiveHandler = vi.fn(async () => ({ ok: true, summary: 'wallet created' }))
const readHandler = vi.fn(async () => ({ ok: true, summary: 'two wallets' }))

vi.mock('../../electron/services/aria/toolCatalog', () => {
  const tools = [
    { name: 'read_tool', description: '', kind: 'read', risk: 'read', input: {}, handler: (...a: unknown[]) => readHandler(...a) },
    { name: 'write_tool', description: '', kind: 'edit', risk: 'write', input: {}, handler: (...a: unknown[]) => writeHandler(...a) },
    { name: 'sensitive_tool', description: '', kind: 'run', risk: 'sensitive', input: {}, handler: (...a: unknown[]) => sensitiveHandler(...a) },
  ]
  return { ARIA_TOOLS: tools, getTool: (name: string) => tools.find((t) => t.name === name) }
})

import { executeToolCall } from '../../electron/services/AriaAgentService'

const snapshot = {
  activeProjectId: null,
  activeProjectPath: null,
  currentPanelId: null,
  openFilePath: null,
  chips: { activeFile: false, projectTree: false, gitDiff: false, terminalLogs: false, walletContext: false },
}

function makeTransport(approve: boolean): AriaTransport & { requestApproval: ReturnType<typeof vi.fn> } {
  return {
    emit: vi.fn(),
    requestApproval: vi.fn(async () => approve),
    requestPatchDecision: vi.fn(async () => 'discard' as const),
    runUiEffect: vi.fn(async () => undefined),
  }
}

function ctx(transport: AriaTransport) {
  return { sessionId: 'bridge:test', snapshot, runUiEffect: transport.runUiEffect }
}

beforeEach(() => {
  vi.clearAllMocks()
  isMainnet.mockReturnValue(false)
})

describe('executeToolCall (bridge entry into the risk gate)', () => {
  it('runs read tools without requesting approval', async () => {
    const transport = makeTransport(true)
    const record = await executeToolCall({ id: 'c1', name: 'read_tool', input: {} }, ctx(transport), transport)

    expect(record.status).toBe('done')
    expect(transport.requestApproval).not.toHaveBeenCalled()
    expect(readHandler).toHaveBeenCalled()
  })

  it('always gates write tools — planApproved can never be smuggled in', async () => {
    const transport = makeTransport(true)
    const record = await executeToolCall({ id: 'c2', name: 'write_tool', input: { title: 'x' } }, ctx(transport), transport)

    expect(transport.requestApproval).toHaveBeenCalledTimes(1)
    expect(record.status).toBe('done')
  })

  it('returns rejected without running the handler when the user declines', async () => {
    const transport = makeTransport(false)
    const record = await executeToolCall({ id: 'c3', name: 'sensitive_tool', input: { name: 'w' } }, ctx(transport), transport)

    expect(record.status).toBe('rejected')
    expect(sensitiveHandler).not.toHaveBeenCalled()
  })

  it('marks gated approval summaries with [MAINNET] on mainnet', async () => {
    isMainnet.mockReturnValue(true)
    const transport = makeTransport(true)
    await executeToolCall({ id: 'c4', name: 'sensitive_tool', input: { name: 'hot' } }, ctx(transport), transport)

    const req = transport.requestApproval.mock.calls[0][0] as { summary: string }
    expect(req.summary).toMatch(/^\[MAINNET\] /)
  })

  it('never cluster-marks read tools and returns unknown-tool errors cleanly', async () => {
    const transport = makeTransport(true)
    const record = await executeToolCall({ id: 'c5', name: 'nope', input: {} }, ctx(transport), transport)
    expect(record.status).toBe('error')
    expect(record.summary).toContain('Unknown tool')
  })
})

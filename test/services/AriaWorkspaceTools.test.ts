import { beforeEach, describe, expect, it, vi } from 'vitest'

// The workspace tool module pulls the engine + settings stack; the routing
// behavior under test only needs the tool definitions themselves.
const runAction = vi.fn(async () => ({ ok: true, action: 'health-check', output: 'ok' }))
vi.mock('../../electron/services/EngineService', () => ({
  runAction: (...args: unknown[]) => runAction(...args),
}))
vi.mock('../../electron/services/SettingsService', () => ({
  getWalletInfrastructureSettings: vi.fn(() => ({ cluster: 'devnet', rpcProvider: 'helius' })),
}))

import { workspaceTools } from '../../electron/services/aria/tools/workspace'

const runEngineAction = workspaceTools.find((tool) => tool.name === 'run_engine_action')!

const ctx = {
  sessionId: 'test',
  snapshot: {
    activeProjectId: 'p1',
    activeProjectPath: 'C:/work/demo',
    currentPanelId: null,
    openFilePath: null,
    chips: { activeFile: false, projectTree: false, gitDiff: false, terminalLogs: false, walletContext: false },
  },
} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('run_engine_action read-path routing', () => {
  it('exists and stays write-tier (orchestration actions can mutate files)', () => {
    expect(runEngineAction).toBeDefined()
    expect(runEngineAction.risk).toBe('write')
  })

  it('no longer advertises the read-only "ask" action in its description', () => {
    expect(runEngineAction.description).not.toMatch(/\bask\b/i)
    expect(runEngineAction.description).toContain('answer those yourself')
  })

  it('rejects action=ask without invoking the engine and steers to read tools', async () => {
    const result = await runEngineAction.handler({ action: 'ask', question: 'what branch is this?' }, ctx)

    expect(result.ok).toBe(false)
    expect(runAction).not.toHaveBeenCalled()
    expect(result.summary).toContain('read tools')
    expect(result.summary).toContain('read_project_status')
  })

  it('still runs the legitimate orchestration actions', async () => {
    const result = await runEngineAction.handler({ action: 'health-check' }, ctx)

    expect(result.ok).toBe(true)
    expect(runAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'health-check' }))
  })

  it('rejects unknown actions', async () => {
    const result = await runEngineAction.handler({ action: 'format-disk' }, ctx)

    expect(result.ok).toBe(false)
    expect(runAction).not.toHaveBeenCalled()
  })
})

describe('ARIA system prompt read-path rule', () => {
  it('tells the model to answer plain questions directly, never via run_engine_action', async () => {
    vi.doMock('../../electron/services/WalletService', () => ({ getDashboard: vi.fn() }))
    vi.doMock('../../electron/services/MemoryInjectionService', () => ({ buildContextBundle: vi.fn(() => ({ block: '', usedMemoryIds: [] })) }))
    vi.doMock('../../electron/services/MemoryService', () => ({ getMemory: vi.fn() }))
    const { assembleSystemPrompt } = await import('../../electron/services/aria/contextAssembler')

    const { system } = await assembleSystemPrompt({
      activeProjectId: null,
      activeProjectPath: null,
      currentPanelId: null,
      openFilePath: null,
      chips: { activeFile: false, projectTree: false, gitDiff: false, terminalLogs: false, walletContext: false, projectMemory: false },
    } as never)

    expect(system).toContain('NEVER call run_engine_action to answer a question')
    expect(system).toContain('answer directly yourself')
  })
})

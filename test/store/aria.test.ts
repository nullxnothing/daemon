import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AriaToolEvent, AriaPatchProposalLite } from '../../electron/shared/types'
import { useAriaStore } from '../../src/store/aria'

// Capture the tool-event handler that subscribe() registers so tests can push
// streamed events through the real applyEvent reducer.
let toolEventHandler: ((ev: AriaToolEvent) => void) | null = null
const patchDecision = vi.fn()
// Events the mocked send() should emit synchronously (while the active turn id is set).
let emitOnSend: AriaToolEvent[] = []

function installBridge() {
  const bridge = {
    aria: {
      send: vi.fn(async () => {
        for (const ev of emitOnSend) toolEventHandler?.(ev)
        return { ok: true }
      }),
      history: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      clear: vi.fn().mockResolvedValue({ ok: true }),
      models: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      approve: vi.fn(),
      patchDecision,
      toolEffectResult: vi.fn(),
      onToolEvent: (handler: (ev: AriaToolEvent) => void) => {
        toolEventHandler = handler
        return () => { toolEventHandler = null }
      },
      onUiEffect: () => () => {},
    },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { daemon: bridge } })
  ;(globalThis as any).daemon = bridge
}

const PROPOSAL: AriaPatchProposalLite = {
  id: 'patch-1',
  title: 'Add release()',
  summary: 'Adds a release instruction',
  files: ['lib.rs'],
  unifiedDiff: '--- a/lib.rs\n+++ b/lib.rs\n+ok\n',
  additions: 11,
  deletions: 0,
  riskLevel: 'medium',
  status: 'proposed',
}

describe('useAriaStore streaming reducer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installBridge()
    useAriaStore.setState({ turns: [], isLoading: false, selectedLane: 'auto', availableModels: [] })
    toolEventHandler = null
    emitOnSend = []
  })

  it('applies plan events to the active turn', async () => {
    useAriaStore.getState().subscribe()
    emitOnSend = [{
      kind: 'plan',
      messageId: 'm',
      steps: [
        { index: 1, title: 'Read state', status: 'active' },
        { index: 2, title: 'Edit lib.rs', status: 'pending' },
      ],
    }]
    await useAriaStore.getState().sendMessage('do it')

    const assistant = useAriaStore.getState().turns.find((t) => t.role === 'assistant' && t.plan)
    expect(assistant?.plan).toHaveLength(2)
    expect(assistant?.plan?.[0].title).toBe('Read state')
  })

  it('records a patch proposal and flips state on action-result', async () => {
    useAriaStore.getState().subscribe()
    emitOnSend = [{ kind: 'patch-proposal', messageId: 'm', proposal: PROPOSAL }]
    await useAriaStore.getState().sendMessage('add release')

    let turn = useAriaStore.getState().turns.find((t) => t.patch)
    expect(turn?.patch?.id).toBe('patch-1')
    expect(turn?.actionState).toBe('deciding')

    // action-result matches by proposal id across all turns (not just active).
    toolEventHandler?.({ kind: 'action-result', proposalId: 'patch-1', action: 'keep', status: 'applied' })
    turn = useAriaStore.getState().turns.find((t) => t.patch)
    expect(turn?.actionState).toBe('applied')
    expect(turn?.patch?.status).toBe('applied')
  })

  it('decidePatch dispatches to the bridge and marks the turn deciding', () => {
    useAriaStore.setState({
      turns: [{
        id: 't9', role: 'assistant', text: '', createdAt: 0, toolCalls: [], approvals: [],
        patch: PROPOSAL, actionState: 'deciding',
      }],
    })
    useAriaStore.getState().decidePatch('patch-1', 'keep')
    expect(patchDecision).toHaveBeenCalledWith('patch-1', 'keep')
    const turn = useAriaStore.getState().turns[0]
    expect(turn.patchDecision).toBe('keep')
  })

  it('threads the selected lane into aria.send', async () => {
    useAriaStore.setState({ selectedLane: 'reasoning' })
    await useAriaStore.getState().sendMessage('hello')
    const sendMock = (globalThis as any).daemon.aria.send
    expect(sendMock).toHaveBeenCalledWith('global', 'hello', expect.anything(), 'reasoning')
  })
})

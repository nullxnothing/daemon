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
  guardFindings: [],
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
    // messageId is the session id by contract; default sessionId is 'global'.
    emitOnSend = [{
      kind: 'plan',
      messageId: 'global',
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

  it('drops streamed events whose messageId is not the active session', async () => {
    // Session-isolation regression (UI_BUGS B3): events tagged with a different
    // session id must NOT mutate the active session's turns.
    useAriaStore.getState().subscribe()
    emitOnSend = [{
      kind: 'plan',
      messageId: 'some-other-session',
      steps: [{ index: 1, title: 'Leaked step', status: 'active' }],
    }]
    await useAriaStore.getState().sendMessage('do it')

    const assistant = useAriaStore.getState().turns.find((t) => t.role === 'assistant')
    expect(assistant?.plan).toBeUndefined()
  })

  it('records a patch proposal and flips state on action-result', async () => {
    useAriaStore.getState().subscribe()
    emitOnSend = [{ kind: 'patch-proposal', messageId: 'global', proposal: PROPOSAL }]
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

  it('switchSession shows loading only when the target session has an in-flight send', async () => {
    // Session-isolation regression (UI_BUGS B3): loading is per-session. Switching to
    // a session with no in-flight send clears the composer; switching back to one that
    // is mid-send restores it (no stuck composer, no faked loading).
    ;(globalThis as any).daemon.aria.sessions = {
      create: vi.fn().mockResolvedValue({ ok: true, data: { id: 's2' } }),
      list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    }
    // s1 is mid-send: make send hang so the in-flight marker persists across the switch.
    let resolveSend: (v: unknown) => void = () => {}
    ;(globalThis as any).daemon.aria.send = vi.fn(() => new Promise((r) => { resolveSend = r }))
    useAriaStore.getState().subscribe()
    useAriaStore.setState({ sessionId: 's1' })
    const pending = useAriaStore.getState().sendMessage('hi') // does not resolve yet
    expect(useAriaStore.getState().isLoading).toBe(true)

    await useAriaStore.getState().switchSession('s2')
    expect(useAriaStore.getState().isLoading).toBe(false) // s2 not mid-send

    await useAriaStore.getState().switchSession('s1')
    expect(useAriaStore.getState().isLoading).toBe(true) // s1 still mid-send → restored

    resolveSend({ ok: true })
    await pending
    expect(useAriaStore.getState().isLoading).toBe(false) // cleared after resolution
  })

  it('blocks a second concurrent send in the same session', async () => {
    // Codex [P1]: two in-flight sends in one session share messageId===sessionId and the
    // older turn's events would attach to the newer turn. The second send must no-op.
    let resolveSend: (v: unknown) => void = () => {}
    const sendMock = vi.fn(() => new Promise((r) => { resolveSend = r }))
    ;(globalThis as any).daemon.aria.send = sendMock
    useAriaStore.getState().subscribe()
    useAriaStore.setState({ sessionId: 'global', turns: [] })

    const first = useAriaStore.getState().sendMessage('one')
    const second = useAriaStore.getState().sendMessage('two') // blocked — still in flight
    expect(sendMock).toHaveBeenCalledTimes(1)
    await second // the blocked send returns immediately

    resolveSend({ ok: true })
    await first
    // After the first resolves, a new send is allowed again.
    ;(globalThis as any).daemon.aria.send = vi.fn().mockResolvedValue({ ok: true })
    await useAriaStore.getState().sendMessage('three')
    expect((globalThis as any).daemon.aria.send).toHaveBeenCalledTimes(1)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AriaToolEvent } from '../../electron/shared/types'

// The store fires funnel marks through the preload bridge; capture them here.
let toolEventHandler: ((ev: AriaToolEvent) => void) | null = null
const markFunnelStep = vi.fn().mockResolvedValue({ ok: true, data: { marked: true } })
const approveIpc = vi.fn()
let emitOnSend: AriaToolEvent[] = []

function installBridge() {
  const bridge = {
    settings: {
      markFunnelStep,
      getFunnel: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    },
    aria: {
      send: vi.fn(async () => {
        for (const ev of emitOnSend) toolEventHandler?.(ev)
        return { ok: true }
      }),
      history: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      approve: approveIpc,
      onToolEvent: (handler: (ev: AriaToolEvent) => void) => {
        toolEventHandler = handler
        return () => { toolEventHandler = null }
      },
      onUiEffect: () => () => {},
    },
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { daemon: bridge } })
}

installBridge()

import { useAriaStore } from '../../src/store/aria'

const WRITE_APPROVAL_EVENT: AriaToolEvent = {
  kind: 'approval-request',
  messageId: 'global',
  callId: 'call-1',
  name: 'remember_fact',
  risk: 'write',
  summary: 'Save a project fact to memory',
  input: { title: 'First mission', value: 'done' },
} as AriaToolEvent

describe('aria store first-run funnel emits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installBridge()
    useAriaStore.setState({ turns: [], isLoading: false, sessionId: 'global' })
    toolEventHandler = null
    emitOnSend = []
  })

  it('marks approval_shown when a write-tier approval card enqueues', async () => {
    useAriaStore.getState().subscribe()
    emitOnSend = [WRITE_APPROVAL_EVENT]
    await useAriaStore.getState().sendMessage('first mission')

    expect(markFunnelStep).toHaveBeenCalledWith('approval_shown')
  })

  it('does not mark approval_shown for read-tier events', async () => {
    useAriaStore.getState().subscribe()
    emitOnSend = [{ ...WRITE_APPROVAL_EVENT, risk: 'read' } as AriaToolEvent]
    await useAriaStore.getState().sendMessage('first mission')

    expect(markFunnelStep).not.toHaveBeenCalledWith('approval_shown')
  })

  it('marks approval_rejected when the write card is rejected', async () => {
    useAriaStore.getState().subscribe()
    emitOnSend = [WRITE_APPROVAL_EVENT]
    await useAriaStore.getState().sendMessage('first mission')

    useAriaStore.getState().approve('call-1', false)
    expect(markFunnelStep).toHaveBeenCalledWith('approval_rejected')
    expect(approveIpc).toHaveBeenCalledWith('call-1', false)
  })

  it('marks approval_approved when the write card is approved', async () => {
    useAriaStore.getState().subscribe()
    emitOnSend = [WRITE_APPROVAL_EVENT]
    await useAriaStore.getState().sendMessage('first mission')

    useAriaStore.getState().approve('call-1', true)
    expect(markFunnelStep).toHaveBeenCalledWith('approval_approved')
    expect(approveIpc).toHaveBeenCalledWith('call-1', true)
  })

  it('forwards the devnet pin in the snapshot only when requested', async () => {
    const send = (globalThis as unknown as { window: { daemon: { aria: { send: ReturnType<typeof vi.fn> } } } }).window.daemon.aria.send
    await useAriaStore.getState().sendMessage('first mission', { pinnedCluster: 'devnet' })
    expect(send.mock.calls[0][2]).toMatchObject({ pinnedCluster: 'devnet' })

    useAriaStore.setState({ sessionId: 'global-2' })
    await useAriaStore.getState().sendMessage('normal turn')
    expect(send.mock.calls[1][2].pinnedCluster).toBeUndefined()
  })

  it('does not emit decision marks for unknown or non-write approvals', async () => {
    useAriaStore.getState().subscribe()
    emitOnSend = [{ ...WRITE_APPROVAL_EVENT, risk: 'sensitive' } as AriaToolEvent]
    await useAriaStore.getState().sendMessage('sensitive thing')

    useAriaStore.getState().approve('call-1', false)
    useAriaStore.getState().approve('missing-call', true)
    expect(markFunnelStep).not.toHaveBeenCalledWith('approval_rejected')
    expect(markFunnelStep).not.toHaveBeenCalledWith('approval_approved')
  })
})

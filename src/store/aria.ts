import { create } from 'zustand'
import type {
  AriaMessage, AriaSession, AriaToolCallRecord, AriaToolEvent, AriaUiEffect,
  AriaPlanStep, AriaPatchProposalLite, AriaPatchAction,
  DaemonAiModelInfo, DaemonAiModelLane,
} from '../../electron/shared/types'
import { daemon } from '../lib/daemonBridge'
import { buildAriaSnapshot } from '../lib/ariaContext'
import { applyUiEffect, runUiEffectWithData } from '../lib/ariaUiEffects'
import { useUIStore } from './ui'

/** A pending write/sensitive tool awaiting the user's decision. */
export interface AriaApproval {
  callId: string
  name: string
  risk: 'read' | 'write' | 'sensitive'
  summary: string
  input: unknown
}

/** A live tool-call row inside an assistant turn. */
export interface AriaToolCallLive {
  callId: string
  name: string
  label: string
  toolKind: 'read' | 'edit' | 'run'
  risk: 'read' | 'write' | 'sensitive'
  status: 'pending' | 'running' | 'done' | 'error' | 'rejected'
  meta?: string
}

/** Where a turn's proposed patch stands in the keep/run/discard flow. */
export type AriaActionState = 'idle' | 'deciding' | 'applied' | 'rejected' | 'failed'

export interface AriaTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
  toolCalls: AriaToolCallLive[]
  approvals: AriaApproval[]
  plan?: AriaPlanStep[]
  patch?: AriaPatchProposalLite
  patchDecision?: AriaPatchAction
  actionState?: AriaActionState
}

const DEFAULT_LANE: DaemonAiModelLane = 'auto'

interface AriaState {
  turns: AriaTurn[]
  isLoading: boolean
  sessionId: string
  sessions: AriaSession[]
  selectedLane: DaemonAiModelLane
  availableModels: DaemonAiModelInfo[]

  sendMessage: (content: string) => Promise<void>
  approve: (callId: string, approved: boolean) => void
  decidePatch: (proposalId: string, action: AriaPatchAction) => void
  setLane: (lane: DaemonAiModelLane) => void
  loadModels: () => Promise<void>
  clearMessages: () => void
  loadHistory: () => Promise<void>
  subscribe: () => () => void

  /** Refresh the session list for the active project and pick/create an active session. */
  initSessions: () => Promise<void>
  loadSessions: () => Promise<void>
  newChat: () => Promise<void>
  switchSession: (sessionId: string) => Promise<void>
  renameSession: (sessionId: string, title: string) => Promise<void>
  archiveSession: (sessionId: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
}

function activeProjectId(): string | null {
  return useUIStore.getState().activeProjectId ?? null
}

let activeAssistantId: string | null = null

function newTurn(role: 'user' | 'assistant', text = ''): AriaTurn {
  return { id: crypto.randomUUID(), role, text, createdAt: Date.now(), toolCalls: [], approvals: [] }
}

function patchActive(set: (fn: (s: AriaState) => Partial<AriaState>) => void, fn: (t: AriaTurn) => AriaTurn): void {
  set((s) => ({ turns: s.turns.map((t) => (t.id === activeAssistantId ? fn(t) : t)) }))
}

export const useAriaStore = create<AriaState>((set, get) => ({
  turns: [],
  isLoading: false,
  sessionId: 'global',
  sessions: [],
  selectedLane: DEFAULT_LANE,
  availableModels: [],

  sendMessage: async (content) => {
    const trimmed = content.trim()
    if (!trimmed) return
    const { sessionId, selectedLane } = get()
    const assistant = newTurn('assistant')
    activeAssistantId = assistant.id
    set((s) => ({ turns: [...s.turns, newTurn('user', trimmed), assistant], isLoading: true }))

    try {
      await daemon.aria.send(sessionId, trimmed, buildAriaSnapshot(), selectedLane)
    } catch (err) {
      patchActive(set, (t) => ({ ...t, text: `Error: ${(err as Error).message}` }))
    } finally {
      activeAssistantId = null
      set({ isLoading: false })
    }
  },

  approve: (callId, approved) => {
    daemon.aria.approve(callId, approved)
    set((s) => ({ turns: s.turns.map((t) => ({ ...t, approvals: t.approvals.filter((a) => a.callId !== callId) })) }))
  },

  decidePatch: (proposalId, action) => {
    daemon.aria.patchDecision(proposalId, action)
    set((s) => ({
      turns: s.turns.map((t) =>
        t.patch?.id === proposalId ? { ...t, patchDecision: action, actionState: 'deciding' } : t),
    }))
  },

  setLane: (lane) => set({ selectedLane: lane }),

  loadModels: async () => {
    const res = await daemon.aria.models()
    if (res.ok && res.data) set({ availableModels: res.data as DaemonAiModelInfo[] })
  },

  clearMessages: () => {
    const { sessionId } = get()
    set({ turns: [] })
    daemon.aria.clear(sessionId).catch(() => {})
  },

  initSessions: async () => {
    const projectId = activeProjectId()
    const res = await daemon.aria.sessions.list(projectId)
    let sessions = res.ok && res.data ? res.data : []
    if (sessions.length === 0) {
      const created = await daemon.aria.sessions.create(projectId)
      if (created.ok && created.data) sessions = [created.data]
    }
    const active = sessions[0]
    set({ sessions, sessionId: active?.id ?? 'global' })
    await get().loadHistory()
  },

  loadSessions: async () => {
    const res = await daemon.aria.sessions.list(activeProjectId())
    if (res.ok && res.data) set({ sessions: res.data })
  },

  newChat: async () => {
    const res = await daemon.aria.sessions.create(activeProjectId())
    if (!res.ok || !res.data) return
    set((s) => ({ sessions: [res.data as AriaSession, ...s.sessions], sessionId: (res.data as AriaSession).id, turns: [] }))
  },

  switchSession: async (sessionId) => {
    if (sessionId === get().sessionId) return
    set({ sessionId, turns: [] })
    await get().loadHistory()
  },

  renameSession: async (sessionId, title) => {
    await daemon.aria.sessions.rename(sessionId, title)
    set((s) => ({ sessions: s.sessions.map((x) => (x.id === sessionId ? { ...x, title } : x)) }))
  },

  archiveSession: async (sessionId) => {
    await daemon.aria.sessions.archive(sessionId)
    const remaining = get().sessions.filter((x) => x.id !== sessionId)
    set({ sessions: remaining })
    if (get().sessionId === sessionId) {
      if (remaining[0]) await get().switchSession(remaining[0].id)
      else await get().newChat()
    }
  },

  deleteSession: async (sessionId) => {
    await daemon.aria.sessions.delete(sessionId)
    const remaining = get().sessions.filter((x) => x.id !== sessionId)
    set({ sessions: remaining })
    if (get().sessionId === sessionId) {
      if (remaining[0]) await get().switchSession(remaining[0].id)
      else await get().newChat()
    }
  },

  loadHistory: async () => {
    const { sessionId } = get()
    const res = await daemon.aria.history(sessionId, 50)
    if (!res.ok || !res.data) return
    const turns: AriaTurn[] = (res.data as AriaMessage[]).map((m) => {
      let toolCalls: AriaToolCallLive[] = []
      let plan: AriaPlanStep[] | undefined
      let patch: AriaPatchProposalLite | undefined
      try {
        const meta = JSON.parse(m.metadata || '{}') as {
          toolCalls?: AriaToolCallRecord[]; plan?: AriaPlanStep[]; patch?: AriaPatchProposalLite
        }
        toolCalls = (meta.toolCalls ?? []).map((tc) => ({
          callId: tc.callId, name: tc.name, label: tc.name, toolKind: tc.toolKind, risk: tc.risk, status: tc.status, meta: tc.summary,
        }))
        plan = meta.plan
        patch = meta.patch
      } catch { /* ignore malformed metadata */ }
      const actionState = patch
        ? patch.status === 'applied' ? 'applied' : patch.status === 'rejected' ? 'rejected' : 'idle'
        : undefined
      return {
        id: m.id, role: m.role as 'user' | 'assistant', text: m.content, createdAt: m.created_at,
        toolCalls, approvals: [], plan, patch, actionState,
      }
    })
    set({ turns })
  },

  subscribe: () => {
    const offEvent = daemon.aria.onToolEvent((raw) => applyEvent(set, raw as AriaToolEvent))
    const offEffect = daemon.aria.onUiEffect(({ callId, effect, awaitData }) => {
      const fx = effect as AriaUiEffect
      if (awaitData) {
        void runUiEffectWithData(fx).then((data) => daemon.aria.toolEffectResult(callId, data))
      } else {
        applyUiEffect(fx)
      }
    })
    return () => { offEvent(); offEffect() }
  },
}))

function applyEvent(set: (fn: (s: AriaState) => Partial<AriaState>) => void, ev: AriaToolEvent): void {
  switch (ev.kind) {
    case 'assistant-text':
    case 'done':
      patchActive(set, (t) => ({ ...t, text: ev.text || t.text }))
      break
    case 'tool-call':
      patchActive(set, (t) => {
        const row: AriaToolCallLive = {
          callId: ev.callId, name: ev.name, label: ev.label, toolKind: ev.toolKind, risk: ev.risk, status: ev.status, meta: ev.meta,
        }
        const exists = t.toolCalls.some((c) => c.callId === ev.callId)
        return exists
          ? { ...t, toolCalls: t.toolCalls.map((c) => (c.callId === ev.callId ? { ...c, ...row } : c)) }
          : { ...t, toolCalls: [...t.toolCalls, row] }
      })
      break
    case 'approval-request':
      patchActive(set, (t) => ({
        ...t,
        approvals: [...t.approvals, { callId: ev.callId, name: ev.name, risk: ev.risk, summary: ev.summary, input: ev.input }],
      }))
      break
    case 'plan':
      patchActive(set, (t) => ({ ...t, plan: ev.steps }))
      break
    case 'patch-proposal':
      patchActive(set, (t) => ({ ...t, patch: ev.proposal, actionState: 'deciding' }))
      break
    case 'action-result':
      set((s) => ({
        turns: s.turns.map((t) =>
          t.patch?.id === ev.proposalId
            ? {
                ...t,
                actionState: ev.status,
                patch: { ...t.patch, status: ev.status === 'applied' ? 'applied' : 'rejected' },
              }
            : t),
      }))
      break
  }
}

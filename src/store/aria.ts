import { create } from 'zustand'
import type {
  AriaMessage, AriaSession, AriaToolCallRecord, AriaToolEvent, AriaUiEffect,
  AriaPlanStep, AriaPatchProposalLite, AriaPatchAction, AriaMemorySuggestionLite,
  DaemonAiModelInfo, DaemonAiModelLane,
} from '../../electron/shared/types'
import { daemon } from '../lib/daemonBridge'
import { buildAriaSnapshot } from '../lib/ariaContext'
import { applyUiEffect, runUiEffectWithData } from '../lib/ariaUiEffects'
import { useUIStore } from './ui'
import { useAppActions } from './appActions'

/** A pending write/sensitive tool awaiting the user's decision. */
export interface AriaApproval {
  callId: string
  name: string
  risk: 'read' | 'write' | 'sensitive'
  summary: string
  input: unknown
  /** Execution-fee quote for this call — rendered as the fee line on the card. */
  fee?: { bps: number; lamports: number; treasury: string }
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
  memorySuggestions?: AriaMemorySuggestionLite[]
  recalledMemories?: AriaMemorySuggestionLite[]
}

const DEFAULT_LANE: DaemonAiModelLane = 'auto'
type ProviderId = 'claude' | 'codex'
type ProviderAuthMode = 'api' | 'cli' | 'both' | 'none'
type ProviderConnectionLite = {
  providerId?: ProviderId
  claudePath?: string
  cliPath?: string
  hasApiKey: boolean
  isAuthenticated: boolean
  authMode: ProviderAuthMode
}
type AriaProviderPrefs = {
  aria: {
    provider: ProviderId
    model: 'fast' | 'standard' | 'reasoning'
  }
}
type ProviderConnectionMapLite = Record<ProviderId, ProviderConnectionLite | null>

interface AriaState {
  turns: AriaTurn[]
  isLoading: boolean
  sessionId: string
  sessions: AriaSession[]
  selectedLane: DaemonAiModelLane
  availableModels: DaemonAiModelInfo[]
  providerPreferences: AriaProviderPrefs | null
  providerConnections: ProviderConnectionMapLite
  providerBusy: ProviderId | 'verify' | null
  providerNotice: string | null
  /** Plan mode: ARIA presents a plan and waits for one approval before writing. */
  planMode: boolean

  sendMessage: (content: string) => Promise<void>
  setPlanMode: (enabled: boolean) => void
  loadProviderStatus: () => Promise<void>
  setAriaProvider: (provider: ProviderId) => Promise<void>
  verifyProviders: () => Promise<void>
  openProviderLogin: (provider: ProviderId) => Promise<void>
  /** Append a local command echo + result to the transcript without invoking the agent. */
  pushLocalTurn: (command: string, result: string) => void
  approve: (callId: string, approved: boolean) => void
  decidePatch: (proposalId: string, action: AriaPatchAction) => void
  /** Keep (approve) or dismiss (reject) an auto-captured memory suggestion, then drop the card. */
  resolveMemorySuggestion: (id: string, keep: boolean) => Promise<void>
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

/** The in-flight assistant turn id PER session. A single global would be
 *  overwritten when a second session starts streaming, mis-routing the first
 *  session's events on switch-back. Keyed by session id; entry is the streaming
 *  turn's id. Cleared when that turn's send settles. */
const activeAssistantBySession = new Map<string, string>()
/** Session ids with an in-flight send(). Drives the per-session loading flag so
 *  switching away/back never loses or fakes it, and supports concurrent sends in
 *  different sessions. One send per session at a time (enforced in sendMessage). */
const inFlightSessions = new Set<string>()

function newTurn(role: 'user' | 'assistant', text = ''): AriaTurn {
  return { id: crypto.randomUUID(), role, text, createdAt: Date.now(), toolCalls: [], approvals: [] }
}

/** Patch the active assistant turn for a specific session (defaults to the
 *  currently-viewed session). Routes by that session's own in-flight turn id so
 *  concurrent sends in different sessions never cross-attach. */
function patchActive(
  set: (fn: (s: AriaState) => Partial<AriaState>) => void,
  fn: (t: AriaTurn) => AriaTurn,
  sessionId?: string,
): void {
  const turnId = activeAssistantBySession.get(sessionId ?? '')
  if (!turnId) return
  set((s) => ({ turns: s.turns.map((t) => (t.id === turnId ? fn(t) : t)) }))
}

export const useAriaStore = create<AriaState>((set, get) => ({
  turns: [],
  isLoading: false,
  sessionId: 'global',
  sessions: [],
  selectedLane: DEFAULT_LANE,
  availableModels: [],
  providerPreferences: null,
  providerConnections: { claude: null, codex: null },
  providerBusy: null,
  providerNotice: null,
  planMode: false,

  setPlanMode: (enabled) => set({ planMode: enabled }),

  loadProviderStatus: async () => {
    const [prefsRes, connRes] = await Promise.all([
      daemon.provider.getPreferences(),
      daemon.provider.verifyAll(),
    ])
    set({
      providerPreferences: prefsRes.ok && prefsRes.data ? prefsRes.data as AriaProviderPrefs : get().providerPreferences,
      providerConnections: connRes.ok && connRes.data ? connRes.data as ProviderConnectionMapLite : get().providerConnections,
      providerNotice: prefsRes.ok && connRes.ok ? null : prefsRes.error ?? connRes.error ?? 'Provider check failed',
    })
  },

  setAriaProvider: async (provider) => {
    const current = get().providerPreferences
    const next = current
      ? { ...current, aria: { ...current.aria, provider } }
      : { aria: { provider, model: 'fast' as const } }
    set({ providerPreferences: next, providerNotice: null })
    const res = await daemon.provider.setPreferences(next)
    if (res.ok && res.data) {
      set({ providerPreferences: res.data as AriaProviderPrefs })
    } else {
      set({ providerNotice: res.error ?? 'Failed to set ARIA provider' })
    }
  },

  verifyProviders: async () => {
    set({ providerBusy: 'verify', providerNotice: null })
    try {
      await get().loadProviderStatus()
    } finally {
      set({ providerBusy: null })
    }
  },

  openProviderLogin: async (provider) => {
    const ui = useUIStore.getState()
    if (!ui.activeProjectId || !ui.activeProjectPath) {
      set({ providerNotice: 'Open a project before launching a login terminal.' })
      return
    }
    set({ providerBusy: provider, providerNotice: null })
    try {
      const startupCommand = provider === 'codex' ? 'codex login' : 'claude'
      const res = await daemon.terminal.create({
        cwd: ui.activeProjectPath,
        startupCommand,
        userInitiated: true,
      })
      if (!res.ok || !res.data) throw new Error(res.error ?? 'Login terminal did not start')
      ui.setCenterMode('canvas')
      ui.addTerminal(ui.activeProjectId, res.data.id, provider === 'codex' ? 'Codex Login' : 'Claude Login', res.data.agentId)
      useAppActions.getState().focusTerminal()
      set({ providerNotice: `Opened ${provider} login terminal. Complete sign-in, then Verify.` })
    } catch (err) {
      set({ providerNotice: (err as Error).message })
    } finally {
      set({ providerBusy: null })
    }
  },

  sendMessage: async (content) => {
    const trimmed = content.trim()
    if (!trimmed) return
    const { sessionId, selectedLane, planMode } = get()
    // One in-flight send per session: block a second concurrent send in the same
    // session (otherwise two streams share messageId===sessionId and the older
    // turn's events would attach to the newer turn).
    if (inFlightSessions.has(sessionId)) return
    const assistant = newTurn('assistant')
    activeAssistantBySession.set(sessionId, assistant.id)
    inFlightSessions.add(sessionId)
    set((s) => ({ turns: [...s.turns, newTurn('user', trimmed), assistant], isLoading: true }))

    try {
      // The final text also arrives via a streamed 'done' event, but that event can
      // race the IPC resolution (e.g. the codex/legacy single-shot path), leaving the
      // turn stuck on "Working…". Use the IPC return value as the authoritative fallback
      // and write it before clearing the active id.
      const snapshot = { ...buildAriaSnapshot(), planMode }
      const res = await daemon.aria.send(sessionId, trimmed, snapshot, selectedLane)
      // Only write the final text if this turn is still this session's active one
      // (the user may have started a fresh turn in the same session since).
      if (activeAssistantBySession.get(sessionId) === assistant.id) {
        const finalText = (res as { ok?: boolean; data?: { text?: string } })?.data?.text
        if (finalText) patchActive(set, (t) => ({ ...t, text: t.text || finalText }), sessionId)
      }
    } catch (err) {
      if (activeAssistantBySession.get(sessionId) === assistant.id) {
        patchActive(set, (t) => ({ ...t, text: `Error: ${(err as Error).message}` }), sessionId)
      }
    } finally {
      // Release the in-flight markers for THIS turn only. If a newer turn in the
      // same session took over, leave its entry untouched.
      if (activeAssistantBySession.get(sessionId) === assistant.id) {
        activeAssistantBySession.delete(sessionId)
      }
      inFlightSessions.delete(sessionId)
      // Only flip the visible loading flag off if the user is still on this session.
      if (get().sessionId === sessionId) set({ isLoading: false })
    }
  },

  pushLocalTurn: (command, result) => {
    const user = newTurn('user', command)
    const assistant = newTurn('assistant', result)
    set((s) => ({ turns: [...s.turns, user, assistant] }))
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

  resolveMemorySuggestion: async (id, keep) => {
    // Drop the card optimistically; the user has decided either way.
    set((s) => ({
      turns: s.turns.map((t) => ({
        ...t,
        memorySuggestions: (t.memorySuggestions ?? []).filter((m) => m.id !== id),
      })),
    }))
    await (keep ? daemon.memory.approve(id, 'user') : daemon.memory.reject(id))
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
    const newId = (res.data as AriaSession).id
    // A brand-new session has no in-flight send, so it starts un-loading regardless
    // of whether another session is still streaming (whose in-flight turn id stays
    // in activeAssistantBySession, untouched, so switch-back resumes it).
    set((s) => ({ sessions: [res.data as AriaSession, ...s.sessions], sessionId: newId, turns: [], isLoading: inFlightSessions.has(newId) }))
  },

  switchSession: async (sessionId) => {
    if (sessionId === get().sessionId) return
    // Loading is per-session: show it only if THIS session has an in-flight send.
    // Per-session activeAssistantBySession entries are left intact so each session's
    // own stream still routes to its turn id. Note: loadHistory() replaces `turns`
    // with persisted rows, so an unpersisted optimistic turn is dropped on switch —
    // live streaming for it stops, but the final result still arrives via history.
    set({ sessionId, turns: [], isLoading: inFlightSessions.has(sessionId) })
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
    const offEvent = daemon.aria.onToolEvent((raw) => applyEvent(set, get, raw as AriaToolEvent))
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

function applyEvent(
  set: (fn: (s: AriaState) => Partial<AriaState>) => void,
  get: () => AriaState,
  ev: AriaToolEvent,
): void {
  // Session isolation: the transport stamps every streamed event — including
  // tool-call, approval-request, and patch-proposal — with messageId === its
  // session id. If the user switched sessions while a turn was still streaming,
  // events for the old session must NOT mutate the now-active session's turns
  // (they would leak into the wrong conversation — including approval cards, a
  // real money-safety hazard). action-result carries no messageId (it is keyed
  // by a globally-unique proposalId and reconciled by that) so it is exempt.
  if ('messageId' in ev && ev.messageId !== get().sessionId) return
  // Past the guard, the event belongs to the currently-viewed session, so route
  // every patch to that session's own in-flight assistant turn.
  const sid = get().sessionId

  switch (ev.kind) {
    case 'assistant-text':
    case 'done':
      patchActive(set, (t) => ({ ...t, text: ev.text || t.text }), sid)
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
      }, sid)
      break
    case 'approval-request':
      patchActive(set, (t) => ({
        ...t,
        approvals: [...t.approvals, { callId: ev.callId, name: ev.name, risk: ev.risk, summary: ev.summary, input: ev.input, fee: ev.fee }],
      }), sid)
      break
    case 'plan':
      patchActive(set, (t) => ({ ...t, plan: ev.steps }), sid)
      break
    case 'patch-proposal':
      patchActive(set, (t) => ({ ...t, patch: ev.proposal, actionState: 'deciding' }), sid)
      break
    case 'memory-suggestion':
      patchActive(set, (t) => ({
        ...t,
        memorySuggestions: [...(t.memorySuggestions ?? []), ev.suggestion],
      }), sid)
      break
    case 'memory-recall':
      patchActive(set, (t) => ({ ...t, recalledMemories: ev.recalled }), sid)
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

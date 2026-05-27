import { create } from 'zustand'

interface AiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface AiStoreState {
  messages: AiChatMessage[]
  conversationId: string | null
  usage: DaemonAiUsageSnapshot | null
  features: DaemonAiFeatureState | null
  models: DaemonAiModelInfo[]
  agentRuns: DaemonAiAgentRun[]
  approvals: DaemonAiToolApprovalRequest[]
  patchProposals: DaemonAiPatchProposal[]
  loading: boolean
  workbenchLoading: boolean
  error: string | null
  workbenchError: string | null
  load: () => Promise<void>
  loadWorkbench: () => Promise<void>
  send: (input: DaemonAiChatRequest) => Promise<boolean>
  createRun: (input: DaemonAiAgentRunInput) => Promise<boolean>
  cancelRun: (runId: string) => Promise<boolean>
  decideToolApproval: (input: DaemonAiToolApprovalDecisionInput) => Promise<boolean>
  decidePatchProposal: (input: DaemonAiPatchDecisionInput) => Promise<boolean>
  applyPatchProposal: (input: DaemonAiPatchApplyInput) => Promise<boolean>
  clear: () => void
}

export const useAiStore = create<AiStoreState>((set, get) => ({
  messages: [],
  conversationId: null,
  usage: null,
  features: null,
  models: [],
  agentRuns: [],
  approvals: [],
  patchProposals: [],
  loading: false,
  workbenchLoading: false,
  error: null,
  workbenchError: null,

  load: async () => {
    const [usage, features, models] = await Promise.all([
      window.daemon.ai.getUsage(),
      window.daemon.ai.getFeatures(),
      window.daemon.ai.getModels(),
    ])
    set({
      usage: usage.ok ? usage.data ?? null : null,
      features: features.ok ? features.data ?? null : null,
      models: models.ok ? models.data ?? [] : [],
      error: usage.ok && features.ok && models.ok ? null : usage.error ?? features.error ?? models.error ?? 'Failed to load DAEMON AI',
    })
  },

  loadWorkbench: async () => {
    set({ workbenchLoading: true, workbenchError: null })
    const runsRes = await window.daemon.ai.listAgentRuns(25)
    if (!runsRes.ok || !runsRes.data) {
      set({
        workbenchLoading: false,
        workbenchError: runsRes.error ?? 'Failed to load AI workbench',
      })
      return
    }

    const runs = runsRes.data
    const [approvalResults, patchResults] = await Promise.all([
      Promise.all(runs.map((run) => window.daemon.ai.listToolApprovals(run.id))),
      Promise.all(runs.map((run) => window.daemon.ai.listPatchProposals(run.id))),
    ])

    const approvals = approvalResults.flatMap((res) => (res.ok && res.data ? res.data : []))
    const patchProposals = patchResults.flatMap((res) => (res.ok && res.data ? res.data : []))
    const firstError = [...approvalResults, ...patchResults].find((res) => !res.ok)?.error
    set({
      agentRuns: runs,
      approvals,
      patchProposals,
      workbenchLoading: false,
      workbenchError: firstError ?? null,
    })
  },

  send: async (input) => {
    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user' as const,
      content: input.message,
    }
    set((state) => ({
      messages: [...state.messages, userMessage],
      loading: true,
      error: null,
    }))

    const res = await window.daemon.ai.chat({
      ...input,
      conversationId: input.conversationId ?? get().conversationId,
    })

    if (!res.ok || !res.data) {
      set((state) => ({
        loading: false,
        error: res.error ?? 'DAEMON AI request failed',
        messages: state.messages.filter((message) => message.id !== userMessage.id),
      }))
      return false
    }

    set((state) => ({
      conversationId: res.data!.conversationId,
      usage: res.data!.usage,
      loading: false,
      messages: [
        ...state.messages,
        {
          id: res.data!.messageId,
          role: 'assistant',
          content: res.data!.text,
        },
      ],
    }))
    return true
  },

  createRun: async (input) => {
    set({ workbenchLoading: true, workbenchError: null })
    const res = await window.daemon.ai.createAgentRun(input)
    if (!res.ok || !res.data) {
      set({
        workbenchLoading: false,
        workbenchError: res.error ?? 'Could not create agent run',
      })
      return false
    }
    set((state) => ({
      agentRuns: [res.data!, ...state.agentRuns.filter((run) => run.id !== res.data!.id)],
      workbenchLoading: false,
    }))
    void get().loadWorkbench()
    return true
  },

  cancelRun: async (runId) => {
    const res = await window.daemon.ai.cancelAgentRun(runId)
    if (!res.ok || !res.data) {
      set({ workbenchError: res.error ?? 'Could not cancel agent run' })
      return false
    }
    set((state) => ({
      agentRuns: state.agentRuns.map((run) => run.id === res.data!.id ? res.data! : run),
    }))
    return true
  },

  decideToolApproval: async (input) => {
    const res = await window.daemon.ai.approveToolCall(input)
    if (!res.ok || !res.data) {
      set({ workbenchError: res.error ?? 'Could not update tool approval' })
      return false
    }
    set((state) => ({
      approvals: state.approvals.map((approval) => approval.id === res.data!.id ? res.data! : approval),
    }))
    return true
  },

  decidePatchProposal: async (input) => {
    const res = await window.daemon.ai.decidePatchProposal(input)
    if (!res.ok || !res.data) {
      set({ workbenchError: res.error ?? 'Could not update patch proposal' })
      return false
    }
    set((state) => ({
      patchProposals: state.patchProposals.map((proposal) => proposal.id === res.data!.id ? res.data! : proposal),
    }))
    return true
  },

  applyPatchProposal: async (input) => {
    const res = await window.daemon.ai.applyPatchProposal(input)
    if (!res.ok || !res.data) {
      set({ workbenchError: res.error ?? 'Could not apply patch proposal' })
      return false
    }
    set((state) => ({
      patchProposals: state.patchProposals.map((proposal) => proposal.id === res.data!.proposal.id ? res.data!.proposal : proposal),
    }))
    return true
  },

  clear: () => set({ messages: [], conversationId: null, error: null }),
}))

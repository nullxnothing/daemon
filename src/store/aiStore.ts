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
  loading: boolean
  error: string | null
  load: () => Promise<void>
  send: (input: DaemonAiChatRequest) => Promise<boolean>
  clear: () => void
}

export const useAiStore = create<AiStoreState>((set, get) => ({
  messages: [],
  conversationId: null,
  usage: null,
  features: null,
  models: [],
  loading: false,
  error: null,

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
        messages: state.messages,
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

  clear: () => set({ messages: [], conversationId: null, error: null }),
}))

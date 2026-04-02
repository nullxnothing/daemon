import { create } from 'zustand'
import type { AriaMessage, AriaResponse, AriaAction } from '../../electron/shared/types'

interface AriaState {
  messages: AriaMessage[]
  isLoading: boolean
  sessionId: string

  addUserMessage: (content: string) => void
  addAssistantMessage: (id: string, content: string, actions: AriaAction[]) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
  loadHistory: () => Promise<void>
  sendMessage: (content: string) => Promise<AriaResponse | null>
}

export const useAriaStore = create<AriaState>((set, get) => ({
  messages: [],
  isLoading: false,
  sessionId: 'global',

  addUserMessage: (content) => set((state) => ({
    messages: [
      ...state.messages,
      {
        id: crypto.randomUUID(),
        role: 'user' as const,
        content,
        metadata: '{}',
        session_id: state.sessionId,
        created_at: Date.now(),
      },
    ],
  })),

  addAssistantMessage: (id, content, actions) => set((state) => ({
    messages: [
      ...state.messages,
      {
        id,
        role: 'assistant' as const,
        content,
        metadata: JSON.stringify({ actions }),
        session_id: state.sessionId,
        created_at: Date.now(),
      },
    ],
  })),

  setLoading: (isLoading) => set({ isLoading }),

  clearMessages: () => {
    const { sessionId } = get()
    set({ messages: [] })
    window.daemon.aria.clear(sessionId)
  },

  loadHistory: async () => {
    const { sessionId } = get()
    const res = await window.daemon.aria.history(sessionId, 50)
    if (res.ok && res.data) {
      set({ messages: res.data })
    }
  },

  sendMessage: async (content) => {
    const { sessionId } = get()
    get().addUserMessage(content)
    set({ isLoading: true })

    try {
      const res = await window.daemon.aria.send(sessionId, content)
      if (res.ok && res.data) {
        get().addAssistantMessage(
          crypto.randomUUID(),
          res.data.text,
          res.data.actions,
        )
        return res.data
      }
      return null
    } catch (err) {
      get().addAssistantMessage(
        crypto.randomUUID(),
        `Error: ${(err as Error).message}`,
        [],
      )
      return null
    } finally {
      set({ isLoading: false })
    }
  },
}))

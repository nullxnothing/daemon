import { create } from 'zustand'

interface ToolRow {
  id: string
  name: string
  description: string | null
  category: string
  language: string
  entrypoint: string
  tool_path: string
  icon: string
  version: string
  author: string | null
  tags: string
  config: string
  last_run_at: number | null
  run_count: number
  enabled: number
  sort_order: number
  created_at: number
}

interface ToolsState {
  tools: ToolRow[]
  loaded: boolean
  activeToolId: string | null
  runningToolIds: Set<string>
  filter: { search: string; category: string | null }

  load: () => Promise<void>
  setActiveTool: (id: string | null) => void
  setFilter: (filter: Partial<ToolsState['filter']>) => void
  addRunning: (id: string) => void
  removeRunning: (id: string) => void
}

export const useToolsStore = create<ToolsState>((set) => ({
  tools: [],
  loaded: false,
  activeToolId: null,
  runningToolIds: new Set(),
  filter: { search: '', category: null },

  load: async () => {
    const res = await window.daemon.tools.list()
    if (res.ok && res.data) {
      set({ tools: res.data, loaded: true })
    }
  },

  setActiveTool: (id) => set({ activeToolId: id }),

  setFilter: (partial) => set((state) => ({
    filter: { ...state.filter, ...partial },
  })),

  addRunning: (id) => set((state) => {
    const next = new Set(state.runningToolIds)
    next.add(id)
    return { runningToolIds: next }
  }),

  removeRunning: (id) => set((state) => {
    const next = new Set(state.runningToolIds)
    next.delete(id)
    return { runningToolIds: next }
  }),
}))

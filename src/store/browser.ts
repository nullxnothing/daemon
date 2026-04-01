import { create } from 'zustand'

interface InspectorResult {
  selector: string
  tagName: string
  text: string
  url: string
  timestamp: number
}

interface BrowserState {
  currentUrl: string
  isInspectMode: boolean
  loadStatus: 'idle' | 'loading' | 'loaded' | 'error'
  agentTerminalId: string | null
  inspectorResults: InspectorResult[]

  setUrl: (url: string) => void
  setInspectMode: (on: boolean) => void
  setLoadStatus: (status: BrowserState['loadStatus']) => void
  setAgentTerminalId: (id: string | null) => void
  addInspectorResult: (result: InspectorResult) => void
}

export const useBrowserStore = create<BrowserState>((set) => ({
  currentUrl: 'http://localhost:3000',
  isInspectMode: false,
  loadStatus: 'idle',
  agentTerminalId: null,
  inspectorResults: [],

  setUrl: (url) => set({ currentUrl: url }),
  setInspectMode: (on) => set({ isInspectMode: on }),
  setLoadStatus: (status) => set({ loadStatus: status }),
  setAgentTerminalId: (id) => set({ agentTerminalId: id }),
  addInspectorResult: (result) =>
    set((state) => ({
      inspectorResults: [...state.inspectorResults, result],
    })),
}))

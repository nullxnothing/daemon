import { create } from 'zustand'

interface InspectorResult {
  selector: string
  tagName: string
  text: string
  url: string
  timestamp: number
  styles?: Record<string, string>
  attributes?: Record<string, string>
}

interface BrowserState {
  currentUrl: string
  isInspectMode: boolean
  loadStatus: 'idle' | 'loading' | 'loaded' | 'error'
  /** @deprecated No longer used — browser agent uses SDK directly */
  agentTerminalId: string | null
  inspectorResults: InspectorResult[]
  lastPageId: string | null
  canGoBack: boolean
  canGoForward: boolean

  setUrl: (url: string) => void
  setInspectMode: (on: boolean) => void
  setLoadStatus: (status: BrowserState['loadStatus']) => void
  setAgentTerminalId: (id: string | null) => void
  addInspectorResult: (result: InspectorResult) => void
  setLastPageId: (id: string | null) => void
  setCanGoBack: (can: boolean) => void
  setCanGoForward: (can: boolean) => void
}

export const useBrowserStore = create<BrowserState>((set) => ({
  currentUrl: 'http://localhost:3000',
  isInspectMode: false,
  loadStatus: 'idle',
  agentTerminalId: null,
  inspectorResults: [],
  lastPageId: null,
  canGoBack: false,
  canGoForward: false,

  setUrl: (url) => set({ currentUrl: url }),
  setInspectMode: (on) => set({ isInspectMode: on }),
  setLoadStatus: (status) => set({ loadStatus: status }),
  setAgentTerminalId: (id) => set({ agentTerminalId: id }),
  addInspectorResult: (result) =>
    set((state) => ({
      inspectorResults: [...state.inspectorResults, result].slice(-100),
    })),
  setLastPageId: (id) => set({ lastPageId: id }),
  setCanGoBack: (can) => set({ canGoBack: can }),
  setCanGoForward: (can) => set({ canGoForward: can }),
}))

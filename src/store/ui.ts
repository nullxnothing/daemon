import { create } from 'zustand'
import { updateRecord, deleteFromRecord, filterRecord, mapRecord } from './stateHelpers'

interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
  projectId: string
}

export interface GridCell {
  id: string | null
  label: string
  visible: boolean
  providerId?: 'claude' | 'codex' | null
}

interface TerminalTab {
  id: string
  label: string
  agentId: string | null
  projectId: string
}

export type CenterMode = 'canvas' | 'grind'
export type RightPanelTab = 'claude' | 'codex' | 'dashboard' | 'sessions' | 'hackathon'

interface UIState {
  activePanel: 'claude' | 'env' | 'git' | 'ports' | 'process' | 'wallet' | 'dispatch' | 'aria' | 'plugins' | 'recovery' | 'settings' | 'tools' | 'terminal' | 'browser' | 'deploy' | 'email' | 'images'
  activeProjectId: string | null
  activeProjectPath: string | null
  projects: Project[]
  openFiles: OpenFile[]
  activeFilePathByProject: Record<string, string | null>
  terminals: TerminalTab[]
  activeTerminalIdByProject: Record<string, string | null>
  mcpDirty: boolean
  mcpVersion: number
  centerMode: CenterMode
  browserTabOpen: boolean
  browserTabActive: boolean
  rightPanelTab: RightPanelTab
  dashboardTabOpen: boolean
  dashboardTabActive: boolean
  launchWizardOpen: boolean
  activeDashboardMint: string | null
  grindPageCount: number
  activeGrindPage: number
  grindPages: Record<string, GridCell[][]>

  setActivePanel: (panel: UIState['activePanel']) => void
  setActiveProject: (id: string | null, path: string | null) => void
  setProjects: (projects: Project[]) => void
  openFile: (file: { path: string; name: string; content: string; projectId: string }) => void
  closeFile: (projectId: string, path: string) => void
  setActiveFile: (projectId: string, path: string | null) => void
  updateFileContent: (path: string, content: string) => void
  markFileSaved: (path: string) => void
  addTerminal: (projectId: string, id: string, label?: string, agentId?: string | null) => void
  removeTerminal: (projectId: string, id: string) => void
  setActiveTerminal: (projectId: string, id: string | null) => void
  removeProjectState: (projectId: string) => void
  setMcpDirty: (dirty: boolean) => void
  bumpMcpVersion: () => void
  setCenterMode: (mode: CenterMode) => void
  toggleBrowserTab: () => void
  openBrowserTab: () => void
  closeBrowserTab: () => void
  setBrowserTabActive: (active: boolean) => void
  setRightPanelTab: (tab: RightPanelTab) => void
  toggleDashboardTab: () => void
  openDashboardTab: () => void
  closeDashboardTab: () => void
  setDashboardTabActive: (active: boolean) => void
  openLaunchWizard: () => void
  closeLaunchWizard: () => void
  setActiveDashboardMint: (mint: string | null) => void
  setActiveGrindPage: (page: number) => void
  addGrindPage: () => void
  removeGrindPage: (page: number) => void
  initGrindPages: (projectId: string) => void
  setGrindCell: (projectId: string, pageIndex: number, cellIndex: number, cell: Partial<GridCell>) => void
  addGrindCellToPage: (projectId: string, pageIndex: number) => void
  setGrindPageCells: (projectId: string, pageIndex: number, cells: GridCell[]) => void
  removeGrindPageCells: (projectId: string, pageIndex: number) => void

  // QuickView popouts
  walletQuickViewOpen: boolean
  emailQuickViewOpen: boolean
  toggleWalletQuickView: () => void
  toggleEmailQuickView: () => void
  closeAllQuickViews: () => void

  // Command drawer
  drawerTool: string | null
  drawerOpen: boolean
  drawerFullscreen: boolean
  pinnedTools: string[]
  drawerToolOrder: string[]
  setDrawerTool: (tool: string | null) => void
  closeDrawer: () => void
  toggleDrawer: () => void
  toggleDrawerFullscreen: () => void
  setPinnedTools: (tools: string[]) => void
  pinTool: (toolId: string) => void
  unpinTool: (toolId: string) => void
  setDrawerToolOrder: (order: string[]) => void
  loadPinnedState: () => Promise<void>
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: 'claude',
  activeProjectId: null,
  activeProjectPath: null,
  projects: [],
  openFiles: [],
  activeFilePathByProject: {},
  terminals: [],
  activeTerminalIdByProject: {},
  mcpDirty: false,
  mcpVersion: 0,
  centerMode: 'canvas' as CenterMode,
  browserTabOpen: false,
  browserTabActive: false,
  rightPanelTab: 'claude' as RightPanelTab,
  dashboardTabOpen: false,
  dashboardTabActive: false,
  launchWizardOpen: false,
  activeDashboardMint: null,
  grindPageCount: 1,
  activeGrindPage: 0,
  grindPages: {},
  walletQuickViewOpen: false,
  emailQuickViewOpen: false,
  drawerTool: null,
  drawerOpen: false,
  drawerFullscreen: false,
  pinnedTools: ['git', 'browser', 'solana-toolbox'],
  drawerToolOrder: [],

  setActivePanel: (panel) => set({ activePanel: panel, walletQuickViewOpen: false, emailQuickViewOpen: false }),

  setActiveProject: (id, path) => set({ activeProjectId: id, activeProjectPath: path }),

  setProjects: (projects) => set({ projects }),

  openFile: (file) => set((state) => {
    const exists = state.openFiles.find((f) => f.path === file.path && f.projectId === file.projectId)
    if (exists) {
      return {
        activePanel: 'claude',
        centerMode: 'canvas' as CenterMode,
        browserTabActive: false,
        dashboardTabActive: false,
        activeFilePathByProject: updateRecord(state.activeFilePathByProject, file.projectId, file.path),
      }
    }
    return {
      activePanel: 'claude',
      centerMode: 'canvas' as CenterMode,
      browserTabActive: false,
      dashboardTabActive: false,
      openFiles: [...state.openFiles, { ...file, isDirty: false }],
      activeFilePathByProject: updateRecord(state.activeFilePathByProject, file.projectId, file.path),
    }
  }),

  closeFile: (projectId, path) => set((state) => {
    const filtered = state.openFiles.filter((f) => !(f.projectId === projectId && f.path === path))
    const remainingForProject = filtered.filter((f) => f.projectId === projectId)
    const newActive = state.activeFilePathByProject[projectId] === path
      ? remainingForProject[remainingForProject.length - 1]?.path ?? null
      : state.activeFilePathByProject[projectId] ?? null
    return {
      openFiles: filtered,
      activeFilePathByProject: updateRecord(state.activeFilePathByProject, projectId, newActive),
    }
  }),

  setActiveFile: (projectId, path) => set((state) => ({
    activeFilePathByProject: updateRecord(state.activeFilePathByProject, projectId, path),
  })),

  updateFileContent: (path, content) => set((state) => ({
    openFiles: state.openFiles.map((f) =>
      f.path === path ? { ...f, content, isDirty: true } : f
    ),
  })),

  markFileSaved: (path) => set((state) => ({
    openFiles: state.openFiles.map((f) =>
      f.path === path ? { ...f, isDirty: false } : f
    ),
  })),

  addTerminal: (projectId, id, label, agentId) => set((state) => ({
    terminals: [...state.terminals, { id, label: label ?? 'Terminal', agentId: agentId ?? null, projectId }],
    activeTerminalIdByProject: updateRecord(state.activeTerminalIdByProject, projectId, id),
  })),

  removeTerminal: (projectId, id) => set((state) => {
    const filtered = state.terminals.filter((t) => !(t.projectId === projectId && t.id === id))
    const remainingForProject = filtered.filter((t) => t.projectId === projectId)
    const newActive = state.activeTerminalIdByProject[projectId] === id
      ? remainingForProject[remainingForProject.length - 1]?.id ?? null
      : state.activeTerminalIdByProject[projectId] ?? null
    return {
      terminals: filtered,
      activeTerminalIdByProject: updateRecord(state.activeTerminalIdByProject, projectId, newActive),
    }
  }),

  setActiveTerminal: (projectId, id) => set((state) => ({
    activeTerminalIdByProject: updateRecord(state.activeTerminalIdByProject, projectId, id),
  })),

  removeProjectState: (projectId) => set((state) => ({
    openFiles: state.openFiles.filter((f) => f.projectId !== projectId),
    terminals: state.terminals.filter((t) => t.projectId !== projectId),
    activeFilePathByProject: deleteFromRecord(state.activeFilePathByProject, projectId),
    activeTerminalIdByProject: deleteFromRecord(state.activeTerminalIdByProject, projectId),
  })),

  setMcpDirty: (dirty) => set({ mcpDirty: dirty }),
  bumpMcpVersion: () => set((state) => ({ mcpVersion: state.mcpVersion + 1 })),
  setCenterMode: (mode) => set({ centerMode: mode }),
  toggleBrowserTab: () => set((state) => {
    const isOpen = !state.browserTabOpen
    return { browserTabOpen: isOpen, browserTabActive: isOpen }
  }),
  openBrowserTab: () => set({ browserTabOpen: true, browserTabActive: true }),
  closeBrowserTab: () => set({ browserTabOpen: false, browserTabActive: false }),
  setBrowserTabActive: (active) => set({ browserTabActive: active }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  toggleDashboardTab: () => set((state) => {
    const isOpen = !state.dashboardTabOpen
    return { dashboardTabOpen: isOpen, dashboardTabActive: isOpen }
  }),
  openDashboardTab: () => set({ dashboardTabOpen: true, dashboardTabActive: true }),
  closeDashboardTab: () => set({ dashboardTabOpen: false, dashboardTabActive: false }),
  setDashboardTabActive: (active) => set({ dashboardTabActive: active }),
  openLaunchWizard: () => set({ launchWizardOpen: true }),
  closeLaunchWizard: () => set({ launchWizardOpen: false }),
  setActiveDashboardMint: (mint) => set({ activeDashboardMint: mint }),
  setActiveGrindPage: (page) => set({ activeGrindPage: page }),
  addGrindPage: () => set((state) => ({
    grindPageCount: state.grindPageCount + 1,
    activeGrindPage: state.grindPageCount,
  })),
  removeGrindPage: (page) => set((state) => {
    if (state.grindPageCount <= 1) return {}
    const newCount = state.grindPageCount - 1
    return {
      grindPageCount: newCount,
      activeGrindPage: Math.min(state.activeGrindPage, newCount - 1),
    }
  }),

  initGrindPages: (projectId) => set((state) => {
    if (state.grindPages[projectId]) return {}
    return {
      grindPages: {
        ...state.grindPages,
        [projectId]: [[
          { id: null, label: 'Agent 1', visible: true },
          { id: null, label: 'Agent 2', visible: true },
          { id: null, label: 'Agent 3', visible: true },
          { id: null, label: 'Agent 4', visible: true },
        ]],
      },
    }
  }),

  setGrindCell: (projectId, pageIndex, cellIndex, cell) => set((state) => {
    const projectPages = state.grindPages[projectId]
    if (!projectPages || !projectPages[pageIndex]) return {}
    const updatedPage = [...projectPages[pageIndex]]
    updatedPage[cellIndex] = { ...updatedPage[cellIndex], ...cell }
    const updatedPages = [...projectPages]
    updatedPages[pageIndex] = updatedPage
    return {
      grindPages: { ...state.grindPages, [projectId]: updatedPages },
    }
  }),

  addGrindCellToPage: (projectId, pageIndex) => set((state) => {
    const projectPages = state.grindPages[projectId]
    if (!projectPages || !projectPages[pageIndex]) return {}
    const page = projectPages[pageIndex]
    const updatedPage = [
      ...page,
      { id: null, label: `Agent ${page.length + 1}`, visible: true },
    ]
    const updatedPages = [...projectPages]
    updatedPages[pageIndex] = updatedPage
    return {
      grindPages: { ...state.grindPages, [projectId]: updatedPages },
    }
  }),

  setGrindPageCells: (projectId, pageIndex, cells) => set((state) => {
    const projectPages = state.grindPages[projectId]
    if (!projectPages) return {}
    const updatedPages = [...projectPages]
    updatedPages[pageIndex] = cells
    return {
      grindPages: { ...state.grindPages, [projectId]: updatedPages },
    }
  }),

  removeGrindPageCells: (projectId, pageIndex) => set((state) => {
    const projectPages = state.grindPages[projectId]
    if (!projectPages || projectPages.length <= 1) return {}
    const updatedPages = projectPages.filter((_, i) => i !== pageIndex)
    return {
      grindPages: { ...state.grindPages, [projectId]: updatedPages },
    }
  }),

  toggleWalletQuickView: () => set((state) => ({
    walletQuickViewOpen: !state.walletQuickViewOpen,
    emailQuickViewOpen: false,
  })),
  toggleEmailQuickView: () => set((state) => ({
    emailQuickViewOpen: !state.emailQuickViewOpen,
    walletQuickViewOpen: false,
  })),
  closeAllQuickViews: () => set({ walletQuickViewOpen: false, emailQuickViewOpen: false }),

  setDrawerTool: (tool) => set({ drawerTool: tool, drawerOpen: tool !== null, drawerFullscreen: tool !== null }),
  closeDrawer: () => set({ drawerOpen: false, drawerFullscreen: false }),
  toggleDrawer: () => set((state) => ({ drawerOpen: !state.drawerOpen, drawerFullscreen: false })),
  toggleDrawerFullscreen: () => set((state) => ({ drawerFullscreen: !state.drawerFullscreen })),
  setPinnedTools: (tools) => {
    set({ pinnedTools: tools })
    window.daemon.settings.setPinnedTools(tools).catch(() => {})
  },
  pinTool: (toolId) => set((state) => {
    const next = state.pinnedTools.includes(toolId) ? state.pinnedTools : [...state.pinnedTools, toolId]
    window.daemon.settings.setPinnedTools(next).catch(() => {})
    return { pinnedTools: next }
  }),
  unpinTool: (toolId) => set((state) => {
    const next = state.pinnedTools.filter((id) => id !== toolId)
    window.daemon.settings.setPinnedTools(next).catch(() => {})
    return { pinnedTools: next }
  }),
  setDrawerToolOrder: (order) => {
    set({ drawerToolOrder: order })
    window.daemon.settings.setDrawerToolOrder(order).catch(() => {})
  },
  loadPinnedState: async () => {
    try {
      const [pinnedRes, orderRes] = await Promise.all([
        window.daemon.settings.getPinnedTools(),
        window.daemon.settings.getDrawerToolOrder(),
      ])
      const updates: Partial<UIState> = {}
      if (pinnedRes.ok && pinnedRes.data) updates.pinnedTools = pinnedRes.data
      if (orderRes.ok && orderRes.data) updates.drawerToolOrder = orderRes.data
      if (Object.keys(updates).length > 0) set(updates)
    } catch { /* first run — use defaults */ }
  },
}))

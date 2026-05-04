import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'
import { updateRecord, deleteFromRecord, filterRecord, mapRecord } from './stateHelpers'
import { useWorkflowShellStore } from './workflowShell'

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
export type RightPanelTab = 'claude' | 'codex'

interface UIState {
  activePanel: 'claude' | 'env' | 'git' | 'ports' | 'process' | 'wallet' | 'dispatch' | 'aria' | 'plugins' | 'recovery' | 'settings'
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
  workspaceToolTabs: string[]
  activeWorkspaceToolId: string | null
  integrationCommandSelectionId: string | null
  rightPanelTab: RightPanelTab
  dashboardTabOpen: boolean
  dashboardTabActive: boolean
  activeDashboardMint: string | null
  grindPageCount: number
  activeGrindPage: number
  grindPages: Record<string, GridCell[][]>
  showOnboarding: boolean
  drawerOpen: boolean
  drawerTool: string | null
  drawerFullscreen: boolean
  launchWizardOpen: boolean

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
  openWorkspaceTool: (toolId: string) => void
  closeWorkspaceTool: (toolId: string) => void
  setActiveWorkspaceTool: (toolId: string | null) => void
  setIntegrationCommandSelectionId: (integrationId: string | null) => void
  toggleWorkspaceTool: (toolId: string) => void
  setRightPanelTab: (tab: RightPanelTab) => void
  toggleDashboardTab: () => void
  openDashboardTab: () => void
  closeDashboardTab: () => void
  setDashboardTabActive: (active: boolean) => void
  setActiveDashboardMint: (mint: string | null) => void
  setActiveGrindPage: (page: number) => void
  addGrindPage: () => void
  removeGrindPage: (page: number) => void
  initGrindPages: (projectId: string) => void
  setGrindCell: (projectId: string, pageIndex: number, cellIndex: number, cell: Partial<GridCell>) => void
  addGrindCellToPage: (projectId: string, pageIndex: number) => void
  setGrindPageCells: (projectId: string, pageIndex: number, cells: GridCell[]) => void
  removeGrindPageCells: (projectId: string, pageIndex: number) => void
  setShowOnboarding: (show: boolean) => void
  setDrawerTool: (toolId: string | null) => void
  closeDrawer: () => void
  toggleDrawer: () => void
  toggleDrawerFullscreen: () => void
  openLaunchWizard: () => void
  closeLaunchWizard: () => void

  // QuickView popouts
  walletQuickViewOpen: boolean
  emailQuickViewOpen: boolean
  toggleWalletQuickView: () => void
  toggleEmailQuickView: () => void
  closeAllQuickViews: () => void

  // Command drawer
  pinnedTools: string[]
  drawerToolOrder: string[]
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
  workspaceToolTabs: [],
  activeWorkspaceToolId: null,
  integrationCommandSelectionId: null,
  rightPanelTab: 'claude' as RightPanelTab,
  dashboardTabOpen: false,
  dashboardTabActive: false,
  activeDashboardMint: null,
  grindPageCount: 1,
  activeGrindPage: 0,
  grindPages: {},
  showOnboarding: false,
  drawerOpen: false,
  drawerTool: null,
  drawerFullscreen: false,
  launchWizardOpen: false,
  walletQuickViewOpen: false,
  emailQuickViewOpen: false,
  pinnedTools: ['git', 'browser', 'activity', 'agent-work', 'project-readiness', 'solana-toolbox', 'integrations', 'pro'],
  drawerToolOrder: [],

  setActivePanel: (panel) => set({ activePanel: panel }),
  setActiveProject: (id, path) => set({ activeProjectId: id, activeProjectPath: path }),

  setProjects: (projects) => set({ projects }),

  openFile: (file) => set((state) => {
    useWorkflowShellStore.getState().closeDrawer()
    const exists = state.openFiles.find((f) => f.path === file.path && f.projectId === file.projectId)
    if (exists) {
      return {
        centerMode: 'canvas' as CenterMode,
        browserTabActive: false,
        dashboardTabActive: false,
        activeWorkspaceToolId: null,
        activeFilePathByProject: updateRecord(state.activeFilePathByProject, file.projectId, file.path),
      }
    }
    return {
      centerMode: 'canvas' as CenterMode,
      browserTabActive: false,
      dashboardTabActive: false,
      activeWorkspaceToolId: null,
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
    browserTabActive: false,
    dashboardTabActive: false,
    activeWorkspaceToolId: null,
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
  setCenterMode: (mode) => {
    set({ centerMode: mode })
    if (typeof window !== 'undefined') {
      daemon.settings.setLayout({ centerMode: mode }).catch(() => {})
    }
  },
  toggleBrowserTab: () => set((state) => {
    const isOpen = !state.browserTabOpen
    if (!isOpen) return { browserTabOpen: false, browserTabActive: false }
    useWorkflowShellStore.getState().closeDrawer()
    return {
      browserTabOpen: true,
      browserTabActive: true,
      dashboardTabActive: false,
    }
  }),
  openBrowserTab: () => {
    useWorkflowShellStore.getState().closeDrawer()
    set({
      browserTabOpen: true,
      browserTabActive: true,
      dashboardTabActive: false,
      activeWorkspaceToolId: null,
    })
  },
  closeBrowserTab: () => set({ browserTabOpen: false, browserTabActive: false }),
  setBrowserTabActive: (active) => {
    if (active) useWorkflowShellStore.getState().closeDrawer()
    set(active
      ? {
          browserTabActive: true,
          dashboardTabActive: false,
          activeWorkspaceToolId: null,
        }
      : { browserTabActive: false })
  },
  openWorkspaceTool: (toolId) => {
    if (toolId === 'browser') {
      useUIStore.getState().openBrowserTab()
      return
    }
    if (toolId === 'dashboard') {
      useUIStore.getState().openDashboardTab()
      return
    }
    useWorkflowShellStore.getState().closeDrawer()
    set((state) => ({
      centerMode: 'canvas' as CenterMode,
      browserTabActive: false,
      dashboardTabActive: false,
      workspaceToolTabs: state.workspaceToolTabs.includes(toolId)
        ? state.workspaceToolTabs
        : [...state.workspaceToolTabs, toolId],
      activeWorkspaceToolId: toolId,
    }))
  },
  closeWorkspaceTool: (toolId) => set((state) => {
    const nextTabs = state.workspaceToolTabs.filter((id) => id !== toolId)
    return {
      workspaceToolTabs: nextTabs,
      activeWorkspaceToolId: state.activeWorkspaceToolId === toolId
        ? nextTabs[nextTabs.length - 1] ?? null
        : state.activeWorkspaceToolId,
    }
  }),
  setActiveWorkspaceTool: (toolId) => {
    if (toolId === 'browser') {
      useUIStore.getState().setBrowserTabActive(true)
      return
    }
    if (toolId === 'dashboard') {
      useUIStore.getState().setDashboardTabActive(true)
      return
    }
    if (toolId) useWorkflowShellStore.getState().closeDrawer()
    set(toolId
      ? {
          browserTabActive: false,
          dashboardTabActive: false,
          activeWorkspaceToolId: toolId,
        }
      : { activeWorkspaceToolId: null })
  },
  setIntegrationCommandSelectionId: (integrationId) => set({ integrationCommandSelectionId: integrationId }),
  toggleWorkspaceTool: (toolId) => set((state) => {
    if (toolId === 'browser') {
      if (state.browserTabActive) {
        useUIStore.getState().closeBrowserTab()
      } else {
        useUIStore.getState().openBrowserTab()
      }
      return {}
    }
    if (toolId === 'dashboard') {
      if (state.dashboardTabActive) {
        useUIStore.getState().closeDashboardTab()
      } else {
        useUIStore.getState().openDashboardTab()
      }
      return {}
    }
    if (state.activeWorkspaceToolId === toolId) {
      const nextTabs = state.workspaceToolTabs.filter((id) => id !== toolId)
      return {
        workspaceToolTabs: nextTabs,
        activeWorkspaceToolId: nextTabs[nextTabs.length - 1] ?? null,
      }
    }
    useWorkflowShellStore.getState().closeDrawer()
    return {
      centerMode: 'canvas' as CenterMode,
      browserTabActive: false,
      dashboardTabActive: false,
      workspaceToolTabs: state.workspaceToolTabs.includes(toolId)
        ? state.workspaceToolTabs
        : [...state.workspaceToolTabs, toolId],
      activeWorkspaceToolId: toolId,
    }
  }),
  setRightPanelTab: (tab) => {
    set({ rightPanelTab: tab })
    if (typeof window !== 'undefined') {
      daemon.settings.setLayout({ rightPanelTab: tab }).catch(() => {})
    }
  },
  toggleDashboardTab: () => set((state) => {
    const isOpen = !state.dashboardTabOpen
    if (!isOpen) return { dashboardTabOpen: false, dashboardTabActive: false }
    useWorkflowShellStore.getState().closeDrawer()
    return {
      dashboardTabOpen: true,
      dashboardTabActive: true,
      browserTabActive: false,
    }
  }),
  openDashboardTab: () => {
    useWorkflowShellStore.getState().closeDrawer()
    set({
      dashboardTabOpen: true,
      dashboardTabActive: true,
      browserTabActive: false,
      activeWorkspaceToolId: null,
    })
  },
  closeDashboardTab: () => set({ dashboardTabOpen: false, dashboardTabActive: false }),
  setDashboardTabActive: (active) => {
    if (active) useWorkflowShellStore.getState().closeDrawer()
    set(active
      ? {
          dashboardTabActive: true,
          browserTabActive: false,
          activeWorkspaceToolId: null,
        }
      : { dashboardTabActive: false })
  },
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
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  setDrawerTool: (toolId) => set({
    drawerOpen: toolId !== null,
    drawerTool: toolId,
    drawerFullscreen: false,
  }),
  closeDrawer: () => set({
    drawerOpen: false,
    drawerTool: null,
    drawerFullscreen: false,
  }),
  toggleDrawer: () => set((state) => ({
    drawerOpen: !state.drawerOpen,
    drawerTool: !state.drawerOpen ? state.drawerTool : null,
    drawerFullscreen: false,
  })),
  toggleDrawerFullscreen: () => set((state) => ({
    drawerFullscreen: !state.drawerFullscreen,
  })),
  openLaunchWizard: () => set({ launchWizardOpen: true }),
  closeLaunchWizard: () => set({ launchWizardOpen: false }),

  toggleWalletQuickView: () => set((state) => ({
    walletQuickViewOpen: !state.walletQuickViewOpen,
    emailQuickViewOpen: false,
  })),
  toggleEmailQuickView: () => set((state) => ({
    emailQuickViewOpen: !state.emailQuickViewOpen,
    walletQuickViewOpen: false,
  })),
  closeAllQuickViews: () => set({ walletQuickViewOpen: false, emailQuickViewOpen: false }),

  setPinnedTools: (tools) => {
    set({ pinnedTools: tools })
    daemon.settings.setPinnedTools(tools).catch(() => {})
  },
  pinTool: (toolId) => set((state) => {
    const next = state.pinnedTools.includes(toolId) ? state.pinnedTools : [...state.pinnedTools, toolId]
    daemon.settings.setPinnedTools(next).catch(() => {})
    return { pinnedTools: next }
  }),
  unpinTool: (toolId) => set((state) => {
    const next = state.pinnedTools.filter((id) => id !== toolId)
    daemon.settings.setPinnedTools(next).catch(() => {})
    return { pinnedTools: next }
  }),
  setDrawerToolOrder: (order) => {
    set({ drawerToolOrder: order })
    daemon.settings.setDrawerToolOrder(order).catch(() => {})
  },
  loadPinnedState: async () => {
    try {
      const [pinnedRes, orderRes, layoutRes] = await Promise.all([
        daemon.settings.getPinnedTools(),
        daemon.settings.getDrawerToolOrder(),
        daemon.settings.getLayout(),
      ])
      const updates: Partial<UIState> = {}
      if (pinnedRes.ok && pinnedRes.data) updates.pinnedTools = pinnedRes.data
      if (orderRes.ok && orderRes.data) updates.drawerToolOrder = orderRes.data
      if (layoutRes.ok && layoutRes.data) {
        if (layoutRes.data.centerMode === 'canvas' || layoutRes.data.centerMode === 'grind') {
          updates.centerMode = layoutRes.data.centerMode
        }
        if (layoutRes.data.rightPanelTab === 'claude' || layoutRes.data.rightPanelTab === 'codex') {
          updates.rightPanelTab = layoutRes.data.rightPanelTab
        }
      }
      if (Object.keys(updates).length > 0) set(updates)
    } catch { /* first run — use defaults */ }
  },
}))

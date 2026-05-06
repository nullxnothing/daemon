import { create } from 'zustand'

export type RightPanelTab = 'claude' | 'codex'

interface LayoutState {
  // Panel selection
  activePanel: 'claude' | 'env' | 'git' | 'ports' | 'process' | 'wallet' | 'dispatch' | 'aria' | 'plugins' | 'recovery' | 'settings'
  
  // Center mode (editor layout)
  centerMode: 'canvas' | 'grind'
  
  // Browser tab
  browserTabOpen: boolean
  browserTabActive: boolean
  
  // Dashboard tab
  dashboardTabOpen: boolean
  dashboardTabActive: boolean
  activeDashboardMint: string | null
  
  // Drawer (command drawer)
  drawerOpen: boolean
  drawerTool: string | null
  drawerFullscreen: boolean
  launchWizardOpen: boolean
  
  // Quick views
  walletQuickViewOpen: boolean
  emailQuickViewOpen: boolean
  
  // MCP state
  mcpDirty: boolean
  mcpVersion: number
  
  // Workspace tools
  workspaceToolTabs: string[]
  activeWorkspaceToolId: string | null
  integrationCommandSelectionId: string | null
  
  // Right panel
  rightPanelTab: RightPanelTab
  
  // Onboarding
  showOnboarding: boolean
  
  // Command drawer
  pinnedTools: string[]
  drawerToolOrder: string[]

  // Actions
  setActivePanel: (panel: LayoutState['activePanel']) => void
  setCenterMode: (mode: 'canvas' | 'grind') => void
  toggleBrowserTab: () => void
  openBrowserTab: () => void
  closeBrowserTab: () => void
  setBrowserTabActive: (active: boolean) => void
  toggleDashboardTab: () => void
  openDashboardTab: () => void
  closeDashboardTab: () => void
  setDashboardTabActive: (active: boolean) => void
  setActiveDashboardMint: (mint: string | null) => void
  toggleWalletQuickView: () => void
  toggleEmailQuickView: () => void
  closeAllQuickViews: () => void
  setMcpDirty: (dirty: boolean) => void
  bumpMcpVersion: () => void
  openWorkspaceTool: (toolId: string) => void
  closeWorkspaceTool: (toolId: string) => void
  setActiveWorkspaceTool: (toolId: string | null) => void
  setIntegrationCommandSelectionId: (integrationId: string | null) => void
  toggleWorkspaceTool: (toolId: string) => void
  setRightPanelTab: (tab: RightPanelTab) => void
  setDrawerTool: (toolId: string | null) => void
  closeDrawer: () => void
  toggleDrawer: () => void
  toggleDrawerFullscreen: () => void
  openLaunchWizard: () => void
  closeLaunchWizard: () => void
  setShowOnboarding: (show: boolean) => void
  setPinnedTools: (tools: string[]) => void
  pinTool: (toolId: string) => void
  unpinTool: (toolId: string) => void
  setDrawerToolOrder: (order: string[]) => void
  loadPinnedState: () => Promise<void>
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activePanel: 'claude',
  centerMode: 'canvas',
  browserTabOpen: false,
  browserTabActive: false,
  dashboardTabOpen: false,
  dashboardTabActive: false,
  activeDashboardMint: null,
  drawerOpen: false,
  drawerTool: null,
  drawerFullscreen: false,
  launchWizardOpen: false,
  walletQuickViewOpen: false,
  emailQuickViewOpen: false,
  mcpDirty: false,
  mcpVersion: 0,
  workspaceToolTabs: [],
  activeWorkspaceToolId: null,
  integrationCommandSelectionId: null,
  rightPanelTab: 'claude',
  showOnboarding: false,
  pinnedTools: [],
  drawerToolOrder: [],

  setActivePanel: (panel) => set({ activePanel: panel }),
  setCenterMode: (mode) => set({ centerMode: mode }),
  toggleBrowserTab: () => set((s) => ({ browserTabOpen: !s.browserTabOpen })),
  openBrowserTab: () => set({ browserTabOpen: true, browserTabActive: true }),
  closeBrowserTab: () => set({ browserTabOpen: false, browserTabActive: false }),
  setBrowserTabActive: (active) => set({ browserTabActive: active }),
  toggleDashboardTab: () => set((s) => ({ dashboardTabOpen: !s.dashboardTabOpen })),
  openDashboardTab: () => set({ dashboardTabOpen: true, dashboardTabActive: true }),
  closeDashboardTab: () => set({ dashboardTabOpen: false, dashboardTabActive: false }),
  setDashboardTabActive: (active) => set({ dashboardTabActive: active }),
  setActiveDashboardMint: (mint) => set({ activeDashboardMint: mint }),
  toggleWalletQuickView: () => set((s) => ({ walletQuickViewOpen: !s.walletQuickViewOpen })),
  toggleEmailQuickView: () => set((s) => ({ emailQuickViewOpen: !s.emailQuickViewOpen })),
  closeAllQuickViews: () => set({ walletQuickViewOpen: false, emailQuickViewOpen: false }),
  setMcpDirty: (dirty) => set({ mcpDirty: dirty }),
  bumpMcpVersion: () => set((s) => ({ mcpVersion: s.mcpVersion + 1 })),
  openWorkspaceTool: (toolId) => set((s) => ({
    workspaceToolTabs: Array.from(new Set([...s.workspaceToolTabs, toolId])),
  })),
  closeWorkspaceTool: (toolId) => set((s) => ({
    workspaceToolTabs: s.workspaceToolTabs.filter((t) => t !== toolId),
  })),
  setActiveWorkspaceTool: (toolId) => set({ activeWorkspaceToolId: toolId }),
  setIntegrationCommandSelectionId: (integrationId) => set({ integrationCommandSelectionId: integrationId }),
  toggleWorkspaceTool: (toolId) => set((s) => {
    const isOpen = s.workspaceToolTabs.includes(toolId)
    return {
      workspaceToolTabs: isOpen
        ? s.workspaceToolTabs.filter((t) => t !== toolId)
        : [...s.workspaceToolTabs, toolId],
      activeWorkspaceToolId: isOpen ? null : toolId,
    }
  }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setDrawerTool: (toolId) => set({ drawerTool: toolId }),
  closeDrawer: () => set({ drawerOpen: false, drawerTool: null }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  toggleDrawerFullscreen: () => set((s) => ({ drawerFullscreen: !s.drawerFullscreen })),
  openLaunchWizard: () => set({ launchWizardOpen: true }),
  closeLaunchWizard: () => set({ launchWizardOpen: false }),
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  setPinnedTools: (tools) => set({ pinnedTools: tools }),
  pinTool: (toolId) => set((s) => ({
    pinnedTools: Array.from(new Set([...s.pinnedTools, toolId])),
  })),
  unpinTool: (toolId) => set((s) => ({
    pinnedTools: s.pinnedTools.filter((t) => t !== toolId),
  })),
  setDrawerToolOrder: (order) => set({ drawerToolOrder: order }),
  loadPinnedState: async () => {
    // This will be populated by the app on init
  },
}))

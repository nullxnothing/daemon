import { create } from 'zustand'

export interface WorkflowShellState {
  drawerTool: string | null
  drawerOpen: boolean
  drawerFullscreen: boolean
  launchWizardOpen: boolean
  setDrawerTool: (tool: string | null) => void
  closeDrawer: () => void
  toggleDrawer: () => void
  toggleDrawerFullscreen: () => void
  openLaunchWizard: () => void
  closeLaunchWizard: () => void
}

export const useWorkflowShellStore = create<WorkflowShellState>((set) => ({
  drawerTool: null,
  drawerOpen: false,
  drawerFullscreen: false,
  launchWizardOpen: false,
  setDrawerTool: (tool) => set((state) => ({
    drawerTool: tool,
    drawerOpen: tool !== null,
    drawerFullscreen: tool !== null ? state.drawerFullscreen : false,
  })),
  closeDrawer: () => set({ drawerOpen: false, drawerTool: null, drawerFullscreen: false }),
  toggleDrawer: () => set((state) => state.drawerOpen
    ? { drawerOpen: false, drawerTool: null, drawerFullscreen: false }
    : { drawerOpen: true, drawerTool: null, drawerFullscreen: false }),
  toggleDrawerFullscreen: () => set((state) => ({ drawerFullscreen: !state.drawerFullscreen })),
  openLaunchWizard: () => set({ launchWizardOpen: true }),
  closeLaunchWizard: () => set({ launchWizardOpen: false }),
}))

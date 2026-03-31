import { create } from 'zustand'
import { updateRecord, deleteFromRecord, filterRecord, mapRecord } from './stateHelpers'

interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
  projectId: string
}

interface TerminalTab {
  id: string
  label: string
  agentId: string | null
  projectId: string
}

interface UIState {
  activePanel: 'claude' | 'env' | 'git' | 'ports' | 'process' | 'wallet' | 'dispatch' | 'aria' | 'plugins' | 'recovery' | 'settings' | 'tools'
  activeProjectId: string | null
  activeProjectPath: string | null
  projects: Project[]
  openFiles: OpenFile[]
  activeFilePathByProject: Record<string, string | null>
  terminals: TerminalTab[]
  activeTerminalIdByProject: Record<string, string | null>
  mcpDirty: boolean
  // Monotonically incremented whenever any MCP toggle fires, from any panel.
  // Subscribe to this to re-fetch MCP state without duplicating toggle logic.
  mcpVersion: number
  showOnboarding: boolean
  agentGridMode: boolean
  grindPageCount: number
  activeGrindPage: number

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
  setShowOnboarding: (show: boolean) => void
  setAgentGridMode: (on: boolean) => void
  setActiveGrindPage: (page: number) => void
  addGrindPage: () => void
  removeGrindPage: (page: number) => void
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
  showOnboarding: false,
  agentGridMode: false,
  grindPageCount: 1,
  activeGrindPage: 0,

  setActivePanel: (panel) => set({ activePanel: panel }),

  setActiveProject: (id, path) => set({ activeProjectId: id, activeProjectPath: path }),

  setProjects: (projects) => set({ projects }),

  openFile: (file) => set((state) => {
    const exists = state.openFiles.find((f) => f.path === file.path && f.projectId === file.projectId)
    if (exists) {
      return {
        agentGridMode: false,
        activeFilePathByProject: updateRecord(state.activeFilePathByProject, file.projectId, file.path),
      }
    }
    return {
      agentGridMode: false,
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
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  setAgentGridMode: (on) => set({ agentGridMode: on }),
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
}))

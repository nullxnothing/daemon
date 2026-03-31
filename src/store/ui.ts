import { create } from 'zustand'

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
  activePanel: 'claude' | 'env' | 'git' | 'ports' | 'process' | 'wallet' | 'dispatch' | 'aria' | 'plugins' | 'recovery'
  activeProjectId: string | null
  activeProjectPath: string | null
  projects: Project[]
  openFiles: OpenFile[]
  activeFilePathByProject: Record<string, string | null>
  terminals: TerminalTab[]
  activeTerminalIdByProject: Record<string, string | null>
  mcpDirty: boolean
  showOnboarding: boolean

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
  setShowOnboarding: (show: boolean) => void
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
  showOnboarding: false,

  setActivePanel: (panel) => set({ activePanel: panel }),

  setActiveProject: (id, path) => set({ activeProjectId: id, activeProjectPath: path }),

  setProjects: (projects) => set({ projects }),

  openFile: (file) => set((state) => {
    const exists = state.openFiles.find((f) => f.path === file.path && f.projectId === file.projectId)
    if (exists) {
      return {
        activeFilePathByProject: {
          ...state.activeFilePathByProject,
          [file.projectId]: file.path,
        },
      }
    }
    return {
      openFiles: [...state.openFiles, { ...file, isDirty: false }],
      activeFilePathByProject: {
        ...state.activeFilePathByProject,
        [file.projectId]: file.path,
      },
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
      activeFilePathByProject: {
        ...state.activeFilePathByProject,
        [projectId]: newActive,
      },
    }
  }),

  setActiveFile: (projectId, path) => set((state) => ({
    activeFilePathByProject: {
      ...state.activeFilePathByProject,
      [projectId]: path,
    },
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
    activeTerminalIdByProject: {
      ...state.activeTerminalIdByProject,
      [projectId]: id,
    },
  })),

  removeTerminal: (projectId, id) => set((state) => {
    const filtered = state.terminals.filter((t) => !(t.projectId === projectId && t.id === id))
    const remainingForProject = filtered.filter((t) => t.projectId === projectId)
    const newActive = state.activeTerminalIdByProject[projectId] === id
      ? remainingForProject[remainingForProject.length - 1]?.id ?? null
      : state.activeTerminalIdByProject[projectId] ?? null
    return {
      terminals: filtered,
      activeTerminalIdByProject: {
        ...state.activeTerminalIdByProject,
        [projectId]: newActive,
      },
    }
  }),

  setActiveTerminal: (projectId, id) => set((state) => ({
    activeTerminalIdByProject: {
      ...state.activeTerminalIdByProject,
      [projectId]: id,
    },
  })),

  removeProjectState: (projectId) => set((state) => {
    const activeFilePathByProject = { ...state.activeFilePathByProject }
    const activeTerminalIdByProject = { ...state.activeTerminalIdByProject }
    delete activeFilePathByProject[projectId]
    delete activeTerminalIdByProject[projectId]

    return {
      openFiles: state.openFiles.filter((f) => f.projectId !== projectId),
      terminals: state.terminals.filter((t) => t.projectId !== projectId),
      activeFilePathByProject,
      activeTerminalIdByProject,
    }
  }),

  setMcpDirty: (dirty) => set({ mcpDirty: dirty }),
  setShowOnboarding: (show) => set({ showOnboarding: show }),
}))

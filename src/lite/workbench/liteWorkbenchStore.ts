import { create } from 'zustand'
import type { FileEntry, Project } from '../../../electron/shared/types'

export interface LiteOpenFile {
  path: string
  name: string
  content: string
  savedContent: string
}

interface LiteWorkbenchState {
  projects: Project[]
  activeProject: Project | null
  tree: FileEntry[]
  openFiles: LiteOpenFile[]
  activeFilePath: string | null
  terminalIds: string[]
  activeTerminalId: string | null
  setProjects: (projects: Project[]) => void
  setActiveProject: (project: Project | null) => void
  setTree: (tree: FileEntry[]) => void
  openFile: (file: LiteOpenFile) => void
  setActiveFile: (path: string) => void
  updateFile: (path: string, content: string) => void
  markSaved: (path: string, persistedContent: string) => void
  closeFile: (path: string) => void
  addTerminal: (id: string) => void
  removeTerminal: (id: string) => void
  setActiveTerminal: (id: string) => void
}

export const useLiteWorkbenchStore = create<LiteWorkbenchState>((set) => ({
  projects: [],
  activeProject: null,
  tree: [],
  openFiles: [],
  activeFilePath: null,
  terminalIds: [],
  activeTerminalId: null,
  setProjects: (projects) => set({ projects }),
  setActiveProject: (activeProject) => set({
    activeProject,
    tree: [],
    openFiles: [],
    activeFilePath: null,
    terminalIds: [],
    activeTerminalId: null,
  }),
  setTree: (tree) => set({ tree }),
  openFile: (file) => set((state) => {
    const existing = state.openFiles.find((item) => item.path === file.path)
    return {
      openFiles: existing ? state.openFiles : [...state.openFiles, file],
      activeFilePath: file.path,
    }
  }),
  setActiveFile: (activeFilePath) => set({ activeFilePath }),
  updateFile: (path, content) => set((state) => ({
    openFiles: state.openFiles.map((file) => file.path === path ? { ...file, content } : file),
  })),
  markSaved: (path, persistedContent) => set((state) => ({
    openFiles: state.openFiles.map((file) => file.path === path ? { ...file, savedContent: persistedContent } : file),
  })),
  closeFile: (path) => set((state) => {
    const openFiles = state.openFiles.filter((file) => file.path !== path)
    return {
      openFiles,
      activeFilePath: state.activeFilePath === path ? openFiles.at(-1)?.path ?? null : state.activeFilePath,
    }
  }),
  addTerminal: (id) => set((state) => ({
    terminalIds: state.terminalIds.includes(id) ? state.terminalIds : [...state.terminalIds, id],
    activeTerminalId: id,
  })),
  removeTerminal: (id) => set((state) => {
    const terminalIds = state.terminalIds.filter((terminalId) => terminalId !== id)
    return {
      terminalIds,
      activeTerminalId: state.activeTerminalId === id ? terminalIds.at(-1) ?? null : state.activeTerminalId,
    }
  }),
  setActiveTerminal: (activeTerminalId) => set({ activeTerminalId }),
}))

export function getLiteWorkspaceSnapshot() {
  const state = useLiteWorkbenchStore.getState()
  return {
    activeProjectId: state.activeProject?.id ?? null,
    activeProjectPath: state.activeProject?.path ?? null,
    openFilePath: state.activeFilePath,
    treeEntries: state.tree.length,
    hasTerminal: state.terminalIds.length > 0,
  }
}

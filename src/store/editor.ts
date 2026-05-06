import { create } from 'zustand'

export interface OpenFile {
  path: string
  name: string
  content: string
  isDirty: boolean
  projectId: string
}

interface EditorState {
  // Project context
  activeProjectId: string | null
  activeProjectPath: string | null
  projects: Project[]
  
  // Files
  openFiles: OpenFile[]
  activeFilePathByProject: Record<string, string | null>

  // Actions
  setActiveProject: (id: string | null, path: string | null) => void
  setProjects: (projects: Project[]) => void
  openFile: (file: { path: string; name: string; content: string; projectId: string }) => void
  closeFile: (projectId: string, path: string) => void
  setActiveFile: (projectId: string, path: string | null) => void
  updateFileContent: (path: string, content: string) => void
  markFileSaved: (path: string) => void
  removeProjectState: (projectId: string) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  activeProjectId: null,
  activeProjectPath: null,
  projects: [],
  openFiles: [],
  activeFilePathByProject: {},

  setActiveProject: (id, path) => set({
    activeProjectId: id,
    activeProjectPath: path,
  }),

  setProjects: (projects) => set({ projects }),

  openFile: (file) => set((state) => {
    const exists = state.openFiles.some(
      (f) => f.path === file.path && f.projectId === file.projectId,
    )
    return {
      openFiles: exists ? state.openFiles : [...state.openFiles, { ...file, isDirty: false }],
      activeFilePathByProject: {
        ...state.activeFilePathByProject,
        [file.projectId]: file.path,
      },
    }
  }),

  closeFile: (projectId, path) => set((state) => ({
    openFiles: state.openFiles.filter(
      (f) => !(f.path === path && f.projectId === projectId),
    ),
    activeFilePathByProject: state.activeFilePathByProject[projectId] === path
      ? { ...state.activeFilePathByProject, [projectId]: null }
      : state.activeFilePathByProject,
  })),

  setActiveFile: (projectId, path) => set((state) => ({
    activeFilePathByProject: {
      ...state.activeFilePathByProject,
      [projectId]: path,
    },
  })),

  updateFileContent: (path, content) => set((state) => ({
    openFiles: state.openFiles.map((f) =>
      f.path === path ? { ...f, content, isDirty: true } : f,
    ),
  })),

  markFileSaved: (path) => set((state) => ({
    openFiles: state.openFiles.map((f) =>
      f.path === path ? { ...f, isDirty: false } : f,
    ),
  })),

  removeProjectState: (projectId) => set((state) => ({
    openFiles: state.openFiles.filter((f) => f.projectId !== projectId),
    activeFilePathByProject: Object.fromEntries(
      Object.entries(state.activeFilePathByProject).filter(
        ([key]) => key !== projectId,
      ),
    ),
  })),
}))

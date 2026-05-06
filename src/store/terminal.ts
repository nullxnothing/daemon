import { create } from 'zustand'

export interface TerminalTab {
  id: string
  label: string
  agentId: string | null
  projectId: string
}

interface TerminalState {
  terminals: TerminalTab[]
  activeTerminalIdByProject: Record<string, string | null>

  // Actions
  addTerminal: (projectId: string, id: string, label?: string, agentId?: string | null) => void
  removeTerminal: (projectId: string, id: string) => void
  setActiveTerminal: (projectId: string, id: string | null) => void
  removeProjectState: (projectId: string) => void
}

export const useTerminalStore = create<TerminalState>((set) => ({
  terminals: [],
  activeTerminalIdByProject: {},

  addTerminal: (projectId, id, label = 'Terminal', agentId = null) => set((state) => {
    const newTerminal: TerminalTab = {
      id,
      label,
      agentId,
      projectId,
    }

    const exists = state.terminals.some((t) => t.id === id)
    return {
      terminals: exists ? state.terminals : [...state.terminals, newTerminal],
      activeTerminalIdByProject: {
        ...state.activeTerminalIdByProject,
        [projectId]: id,
      },
    }
  }),

  removeTerminal: (projectId, id) => set((state) => ({
    terminals: state.terminals.filter((t) => !(t.id === id && t.projectId === projectId)),
    activeTerminalIdByProject: state.activeTerminalIdByProject[projectId] === id
      ? { ...state.activeTerminalIdByProject, [projectId]: null }
      : state.activeTerminalIdByProject,
  })),

  setActiveTerminal: (projectId, id) => set((state) => ({
    activeTerminalIdByProject: {
      ...state.activeTerminalIdByProject,
      [projectId]: id,
    },
  })),

  removeProjectState: (projectId) => set((state) => ({
    terminals: state.terminals.filter((t) => t.projectId !== projectId),
    activeTerminalIdByProject: Object.fromEntries(
      Object.entries(state.activeTerminalIdByProject).filter(
        ([key]) => key !== projectId,
      ),
    ),
  })),
}))

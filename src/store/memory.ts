import { create } from 'zustand'
import type {
  CheckDefinition,
  CheckResult,
  KnowledgeItem,
  MemoryUpdateInput,
  ProjectMemory,
} from '../../electron/shared/types'
import { daemon } from '../lib/daemonBridge'
import { runIpc } from '../lib/runIpc'

interface MemoryState {
  memories: ProjectMemory[]
  knowledge: KnowledgeItem[]
  checks: CheckDefinition[]
  lastCheckResult: CheckResult | null
  isLoading: boolean
  isExtracting: boolean

  load: (projectId: string | null) => Promise<void>
  loadKnowledge: (projectId: string | null) => Promise<void>
  extract: (projectPath: string, projectId: string | null) => Promise<void>
  approve: (id: string) => Promise<void>
  reject: (id: string) => Promise<void>
  remove: (id: string) => Promise<void>
  update: (id: string, patch: MemoryUpdateInput) => Promise<void>
  discoverChecks: (projectPath: string) => Promise<void>
  runCheck: (projectPath: string, check: CheckDefinition) => Promise<void>
}

const CTX = 'Memory'

export const useMemoryStore = create<MemoryState>((set, get) => ({
  memories: [],
  knowledge: [],
  checks: [],
  lastCheckResult: null,
  isLoading: false,
  isExtracting: false,

  load: async (projectId) => {
    set({ isLoading: true })
    const data = await runIpc(daemon.memory.list(projectId), { context: CTX })
    set({ memories: data ?? [], isLoading: false })
    void get().loadKnowledge(projectId)
  },

  loadKnowledge: async (projectId) => {
    const data = await runIpc(daemon.memory.listKnowledge(projectId), { context: CTX })
    set({ knowledge: data ?? [] })
  },

  extract: async (projectPath, projectId) => {
    set({ isExtracting: true })
    await runIpc(daemon.memory.extract(projectPath, projectId), { context: CTX })
    set({ isExtracting: false })
    await get().load(projectId)
  },

  approve: async (id) => {
    const updated = await runIpc(daemon.memory.approve(id), { context: CTX })
    if (updated) {
      set({ memories: get().memories.map((m) => (m.id === id ? updated : m)) })
      void get().loadKnowledge(updated.projectId)
    }
  },

  reject: async (id) => {
    const updated = await runIpc(daemon.memory.reject(id), { context: CTX })
    if (updated) {
      set({ memories: get().memories.map((m) => (m.id === id ? updated : m)) })
      void get().loadKnowledge(updated.projectId)
    }
  },

  remove: async (id) => {
    const res = await runIpc(daemon.memory.delete(id), { context: CTX })
    if (res !== null) {
      set({
        memories: get().memories.filter((m) => m.id !== id),
        knowledge: get().knowledge.filter((k) => k.id !== id),
      })
    }
  },

  update: async (id, patch) => {
    const updated = await runIpc(daemon.memory.update(id, patch), { context: CTX })
    if (updated) set({ memories: get().memories.map((m) => (m.id === id ? updated : m)) })
  },

  discoverChecks: async (projectPath) => {
    const data = await runIpc(daemon.memory.discoverChecks(projectPath), { context: CTX })
    set({ checks: data ?? [] })
  },

  runCheck: async (projectPath, check) => {
    const result = await runIpc(daemon.memory.runCheck(projectPath, check), { context: CTX })
    set({ lastCheckResult: result })
  },
}))

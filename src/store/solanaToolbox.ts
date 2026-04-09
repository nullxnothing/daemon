import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'
import { SOLANA_MCP_CATALOG, type SolanaMcpCategory } from '../panels/SolanaToolbox/catalog'

export interface SolanaMcpEntry {
  name: string
  label: string
  description: string
  category: SolanaMcpCategory
  enabled: boolean
  docsUrl?: string
}

export interface ValidatorState {
  type: 'surfpool' | 'test-validator' | null
  status: 'stopped' | 'starting' | 'running' | 'error'
  terminalId: string | null
  port: number | null
}

export interface SolanaProjectInfo {
  isSolanaProject: boolean
  framework: 'anchor' | 'native' | 'client-only' | null
  indicators: string[]
  suggestedMcps: string[]
}

export interface SolanaToolchainStatus {
  solanaCli: { installed: boolean; version: string | null }
  anchor: { installed: boolean; version: string | null }
  avm: { installed: boolean; version: string | null }
  surfpool: { installed: boolean; version: string | null }
  testValidator: { installed: boolean; version: string | null }
  litesvm: { installed: boolean; source: 'project' | 'none' }
}

interface SolanaToolboxState {
  mcps: SolanaMcpEntry[]
  validator: ValidatorState
  projectInfo: SolanaProjectInfo | null
  toolchain: SolanaToolchainStatus | null
  loading: boolean
  dismissed: boolean
  collapsedSections: Record<string, boolean>

  loadMcps: (projectPath: string) => Promise<void>
  toggleMcp: (projectPath: string, name: string, enabled: boolean) => Promise<void>
  startValidator: (type: 'surfpool' | 'test-validator') => Promise<void>
  stopValidator: () => Promise<void>
  detectProject: (projectPath: string) => Promise<void>
  loadToolchain: (projectPath?: string) => Promise<void>
  refreshValidatorStatus: () => Promise<void>
  dismiss: () => void
  toggleSection: (section: string) => void
}

const SOLANA_MCP_NAMES = Object.keys(SOLANA_MCP_CATALOG)

export const useSolanaToolboxStore = create<SolanaToolboxState>((set, get) => ({
  mcps: [],
  validator: { type: null, status: 'stopped', terminalId: null, port: null },
  projectInfo: null,
  toolchain: null,
  loading: false,
  dismissed: false,
  collapsedSections: { capabilities: true },

  loadMcps: async (projectPath) => {
    set({ loading: true })
    try {
      const res = await daemon.claude.projectMcpAll(projectPath)
      if (res.ok && res.data) {
        const allMcps = res.data as Array<{ name: string; enabled: boolean }>
        const solanaMcps: SolanaMcpEntry[] = SOLANA_MCP_NAMES.map((name) => {
          const catalog = SOLANA_MCP_CATALOG[name]
          const found = allMcps.find((m) => m.name === name)
          return {
            name,
            label: catalog.label,
            description: catalog.description,
            category: catalog.category,
            enabled: found?.enabled ?? false,
            docsUrl: catalog.docsUrl,
          }
        })
        set({ mcps: solanaMcps, loading: false })
      } else {
        set({ loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  toggleMcp: async (projectPath, name, enabled) => {
    const prev = get().mcps
    set({ mcps: prev.map((m) => m.name === name ? { ...m, enabled } : m) })
    try {
      await daemon.claude.projectMcpToggle(projectPath, name, enabled)
    } catch {
      set({ mcps: prev })
    }
  },

  startValidator: async (type) => {
    set({ validator: { type, status: 'starting', terminalId: null, port: null } })
    try {
      const res = await daemon.validator.start(type)
      if (res.ok && res.data) {
        set({ validator: { type, status: 'running', terminalId: res.data.terminalId, port: res.data.port ?? 8899 } })
      } else {
        set({ validator: { type, status: 'error', terminalId: null, port: null } })
      }
    } catch {
      set({ validator: { type, status: 'error', terminalId: null, port: null } })
    }
  },

  stopValidator: async () => {
    const { validator } = get()
    if (validator.terminalId) {
      try {
        await daemon.validator.stop()
      } catch { /* ignore */ }
    }
    set({ validator: { type: null, status: 'stopped', terminalId: null, port: null } })
  },

  refreshValidatorStatus: async () => {
    try {
      const res = await daemon.validator.status()
      if (res.ok && res.data) {
        set({
          validator: {
            type: res.data.type as 'surfpool' | 'test-validator' | null,
            status: res.data.status as ValidatorState['status'],
            terminalId: res.data.terminalId ?? null,
            port: res.data.port ?? null,
          },
        })
      }
    } catch { /* ignore */ }
  },

  detectProject: async (projectPath) => {
    try {
      const res = await daemon.validator.detectProject(projectPath)
      if (res.ok && res.data) {
        set({ projectInfo: res.data as SolanaProjectInfo })
      } else {
        set({ projectInfo: null })
      }
    } catch {
      set({ projectInfo: null })
    }
  },

  loadToolchain: async (projectPath) => {
    try {
      const res = await daemon.validator.toolchainStatus(projectPath)
      if (res.ok && res.data) {
        set({ toolchain: res.data as SolanaToolchainStatus })
      } else {
        set({ toolchain: null })
      }
    } catch {
      set({ toolchain: null })
    }
  },

  dismiss: () => set({ dismissed: true }),

  toggleSection: (section) => set((s) => ({
    collapsedSections: { ...s.collapsedSections, [section]: !s.collapsedSections[section] },
  })),
}))

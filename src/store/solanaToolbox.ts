import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'

export interface SolanaMcpEntry {
  name: string
  label: string
  description: string
  category: 'rpc' | 'payments' | 'defi'
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

interface SolanaToolboxState {
  mcps: SolanaMcpEntry[]
  validator: ValidatorState
  projectInfo: SolanaProjectInfo | null
  loading: boolean
  dismissed: boolean
  collapsedSections: Record<string, boolean>

  loadMcps: (projectPath: string) => Promise<void>
  toggleMcp: (projectPath: string, name: string, enabled: boolean) => Promise<void>
  startValidator: (type: 'surfpool' | 'test-validator') => Promise<void>
  stopValidator: () => Promise<void>
  detectProject: (projectPath: string) => Promise<void>
  refreshValidatorStatus: () => Promise<void>
  dismiss: () => void
  toggleSection: (section: string) => void
}

const SOLANA_MCP_CATALOG: Record<string, { label: string; description: string; category: 'rpc' | 'payments' | 'defi'; docsUrl?: string }> = {
  'helius': { label: 'Helius', description: 'Solana RPC, DAS API, webhooks, priority fees', category: 'rpc', docsUrl: 'https://docs.helius.dev' },
  'solana-mcp-server': { label: 'Solana MCP', description: 'Program deployment, account inspection, docs', category: 'rpc' },
  'payai-mcp-server': { label: 'PayAI', description: 'x402 payment protocol via PayAI facilitator', category: 'payments', docsUrl: 'https://docs.payai.network' },
  'x402-mcp': { label: 'x402', description: 'HTTP 402 payment tools for paid APIs', category: 'payments', docsUrl: 'https://github.com/coinbase/x402' },
}

const SOLANA_MCP_NAMES = Object.keys(SOLANA_MCP_CATALOG)

export const useSolanaToolboxStore = create<SolanaToolboxState>((set, get) => ({
  mcps: [],
  validator: { type: null, status: 'stopped', terminalId: null, port: null },
  projectInfo: null,
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

  dismiss: () => set({ dismissed: true }),

  toggleSection: (section) => set((s) => ({
    collapsedSections: { ...s.collapsedSections, [section]: !s.collapsedSections[section] },
  })),
}))

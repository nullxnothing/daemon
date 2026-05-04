import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'
import { useNotificationsStore } from './notifications'
import { useUIStore } from './ui'
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
  projectPath: string | null
  command: string | null
  studioPort: number | null
  startedAt: number | null
}

export interface SolanaDetectedProgram {
  name: string
  cluster: string
  address: string
  source: 'Anchor.toml' | 'IDL'
}

export interface SolanaDetectedIdl {
  name: string
  path: string
  address: string | null
}

export interface SolanaDetectedScript {
  name: string
  command: string
  source: 'package.json'
}

export interface SolanaProjectRuntimeProfile {
  cluster: string | null
  providerWallet: string | null
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | null
  files: {
    anchorToml: boolean
    cargoToml: boolean
    packageJson: boolean
    programsDir: boolean
    targetIdlDir: boolean
    surfpoolToml: boolean
    testsDir: boolean
  }
  programs: SolanaDetectedProgram[]
  idls: SolanaDetectedIdl[]
  scripts: SolanaDetectedScript[]
  tests: { litesvm: boolean; anchorTests: boolean }
}

export interface SolanaProjectInfo {
  isSolanaProject: boolean
  framework: 'anchor' | 'native' | 'client-only' | null
  indicators: string[]
  suggestedMcps: string[]
  runtime?: SolanaProjectRuntimeProfile
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
  startValidator: (type: 'surfpool' | 'test-validator', options?: { reset?: boolean }) => Promise<void>
  stopValidator: () => Promise<void>
  detectProject: (projectPath: string) => Promise<void>
  loadToolchain: (projectPath?: string) => Promise<void>
  refreshValidatorStatus: () => Promise<void>
  dismiss: () => void
  toggleSection: (section: string) => void
}

const SOLANA_MCP_NAMES = Object.keys(SOLANA_MCP_CATALOG)

function getActiveProjectActivityContext() {
  const { activeProjectId, projects } = useUIStore.getState()
  return {
    projectId: activeProjectId,
    projectName: activeProjectId ? projects.find((project) => project.id === activeProjectId)?.name ?? null : null,
  }
}

export const useSolanaToolboxStore = create<SolanaToolboxState>((set, get) => ({
  mcps: [],
  validator: { type: null, status: 'stopped', terminalId: null, port: null, projectPath: null, command: null, studioPort: null, startedAt: null },
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

  startValidator: async (type, options = {}) => {
    const activeProjectPath = useUIStore.getState().activeProjectPath
    set({ validator: { type, status: 'starting', terminalId: null, port: null, projectPath: activeProjectPath, command: null, studioPort: null, startedAt: null } })
    const projectContext = getActiveProjectActivityContext()
    useNotificationsStore.getState().addActivity({
      kind: 'info',
      context: 'Runtime',
      message: options.reset ? `Starting ${type} validator with reset` : `Starting ${type} validator`,
      ...projectContext,
    })
    try {
      const res = await daemon.validator.start({
        type,
        projectPath: activeProjectPath ?? undefined,
        reset: options.reset,
      })
      if (res.ok && res.data) {
        set({
          validator: {
            type,
            status: 'running',
            terminalId: res.data.terminalId,
            port: res.data.port ?? 8899,
            projectPath: res.data.projectPath ?? activeProjectPath,
            command: res.data.command ?? null,
            studioPort: res.data.studioPort ?? null,
            startedAt: Date.now(),
          },
        })
        useNotificationsStore.getState().addActivity({
          kind: 'success',
          context: 'Runtime',
          message: `${type} validator running on port ${res.data.port ?? 8899}`,
          ...projectContext,
        })
      } else {
        set({ validator: { type, status: 'error', terminalId: null, port: null, projectPath: activeProjectPath, command: null, studioPort: null, startedAt: null } })
        useNotificationsStore.getState().addActivity({
          kind: 'error',
          context: 'Runtime',
          message: res.error ?? `${type} validator failed to start`,
          ...projectContext,
        })
      }
    } catch (err) {
      set({ validator: { type, status: 'error', terminalId: null, port: null, projectPath: activeProjectPath, command: null, studioPort: null, startedAt: null } })
      useNotificationsStore.getState().addActivity({
        kind: 'error',
        context: 'Runtime',
        message: err instanceof Error ? err.message : `${type} validator failed to start`,
        ...projectContext,
      })
    }
  },

  stopValidator: async () => {
    const { validator } = get()
    const projectContext = getActiveProjectActivityContext()
    if (validator.terminalId) {
      try {
        await daemon.validator.stop()
        useNotificationsStore.getState().addActivity({
          kind: 'info',
          context: 'Runtime',
          message: `Stopped ${validator.type ?? 'local'} validator`,
          ...projectContext,
        })
      } catch { /* ignore */ }
    }
    set({ validator: { type: null, status: 'stopped', terminalId: null, port: null, projectPath: null, command: null, studioPort: null, startedAt: null } })
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
            projectPath: res.data.projectPath ?? null,
            command: res.data.command ?? null,
            studioPort: res.data.studioPort ?? null,
            startedAt: res.data.startedAt ?? null,
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
        if (res.data.isSolanaProject) {
          useNotificationsStore.getState().addActivity({
            kind: 'success',
            context: 'Runtime',
            message: `Detected Solana project${res.data.framework ? ` (${res.data.framework})` : ''} at ${projectPath}`,
            ...getActiveProjectActivityContext(),
          })
        }
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
        const missing = [
          res.data.solanaCli.installed ? null : 'Solana CLI',
          res.data.anchor.installed ? null : 'Anchor',
          res.data.surfpool.installed ? null : 'Surfpool',
        ].filter(Boolean)
        useNotificationsStore.getState().addActivity({
          kind: missing.length === 0 ? 'success' : 'warning',
          context: 'Runtime',
          message: missing.length === 0
            ? 'Runtime toolchain check passed'
            : `Runtime toolchain check found missing tools: ${missing.join(', ')}`,
          ...getActiveProjectActivityContext(),
        })
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

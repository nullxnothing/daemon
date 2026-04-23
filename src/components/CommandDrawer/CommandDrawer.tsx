import { useState, useRef, useEffect, useCallback, useMemo, Suspense, type ComponentType, type DragEvent } from 'react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { PanelErrorBoundary } from '../ErrorBoundary'
import { lazyNamedWithReload, lazyWithReload } from '../../utils/lazyWithReload'
import './CommandDrawer.css'

// All drawer-renderable tools (built-in + plugins)
interface DrawerTool {
  id: string
  name: string
  description: string
  icon: ComponentType<{ size?: number }>
  component: React.LazyExoticComponent<ComponentType>
  preload?: () => void
  category: 'dev' | 'crypto' | 'create' | 'system'
}

// Built-in tool icons — exported for sidebar pinning
export function GitIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      <defs>
        <linearGradient id="git-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0f0f0">
            <animate attributeName="stop-color" values="#f0f0f0;#6e40c9;#f0f0f0" dur="5s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#6e40c9">
            <animate attributeName="stop-color" values="#6e40c9;#238636;#6e40c9" dur="5s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#238636">
            <animate attributeName="stop-color" values="#238636;#f0f0f0;#238636" dur="5s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <circle cx="12" cy="6" r="3" stroke="url(#git-flow)"/><circle cx="6" cy="18" r="3" stroke="url(#git-flow)"/><circle cx="18" cy="18" r="3" stroke="url(#git-flow)"/><line x1="12" y1="9" x2="12" y2="12" stroke="url(#git-flow)"/><line x1="12" y1="12" x2="6" y2="15" stroke="url(#git-flow)"/><line x1="12" y1="12" x2="18" y2="15" stroke="url(#git-flow)"/>
    </svg>
  )
}
function EnvIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
}
function DeployIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L12 16M12 2L8 6M12 2L16 6"/><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/></svg>
}
function EmailIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="14" height="12" rx="2" /><path d="M2 5l7 5 7-5" /></svg>
}
function WalletIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V9h1.5A1.5 1.5 0 0 1 22 10.5v5a1.5 1.5 0 0 1-1.5 1.5H19v1.5A2.5 2.5 0 0 1 16.5 21h-11A2.5 2.5 0 0 1 3 18.5v-11Z"/><circle cx="18" cy="13" r="1"/></svg>
}
function SettingsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
function PortsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/></svg>
}
function ProcessIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="10" y1="4" x2="10" y2="20"/></svg>
}
function PaintIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><path d="M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/><path d="M7 13.5Q9 9 12 13.5T17 10"/></svg>
}
function BrowserIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="browser-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa">
            <animate attributeName="stop-color" values="#60a5fa;#38bdf8;#818cf8;#60a5fa" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#38bdf8">
            <animate attributeName="stop-color" values="#38bdf8;#818cf8;#60a5fa;#38bdf8" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#818cf8">
            <animate attributeName="stop-color" values="#818cf8;#60a5fa;#38bdf8;#818cf8" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" stroke="url(#browser-flow)" /><line x1="2" y1="12" x2="22" y2="12" stroke="url(#browser-flow)" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="url(#browser-flow)" />
    </svg>
  )
}
function DocsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
}
function StarterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="starter-flow" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3ecf8e">
            <animate attributeName="stop-color" values="#3ecf8e;#60a5fa;#3ecf8e" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#60a5fa">
            <animate attributeName="stop-color" values="#60a5fa;#3ecf8e;#60a5fa" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="url(#starter-flow)" />
    </svg>
  )
}
function ScannerIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <line x1="7" y1="12" x2="17" y2="12"/><line x1="12" y1="7" x2="12" y2="17"/>
    </svg>
  )
}
function DashboardIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
}
function SessionsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}
function HackathonIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12V6a6 6 0 0 1 12 0v6"/><line x1="2" y1="12" x2="14" y2="12"/><line x1="5" y1="12" x2="5" y2="7"/><line x1="8" y1="12" x2="8" y2="5"/><line x1="11" y1="12" x2="11" y2="7"/></svg>
}
function PluginsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
}
function RecoveryIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
}
function SolanaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 397.7 311.7">
      <defs>
        <linearGradient id="solana-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FFA3">
            <animate attributeName="stop-color" values="#00FFA3;#DC1FFF;#00FFA3" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#9945FF">
            <animate attributeName="stop-color" values="#9945FF;#00FFA3;#9945FF" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#DC1FFF">
            <animate attributeName="stop-color" values="#DC1FFF;#9945FF;#DC1FFF" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <path fill="url(#solana-flow)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"/>
      <path fill="url(#solana-flow)" d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"/>
      <path fill="url(#solana-flow)" d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"/>
    </svg>
  )
}
function TokenLaunchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <path d="M10 14 15 9" />
      <path d="M11 9h4v4" />
    </svg>
  )
}

// Icon lookup for pinned sidebar tools
export const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  git: GitIcon, deploy: DeployIcon, env: EnvIcon,
  wallet: WalletIcon, email: EmailIcon, browser: BrowserIcon,
  ports: PortsIcon, processes: ProcessIcon, settings: SettingsIcon,
  'image-editor': PaintIcon, 'solana-toolbox': SolanaIcon, 'block-scanner': ScannerIcon, docs: DocsIcon, starter: StarterIcon,
  'token-launch': TokenLaunchIcon,
  dashboard: DashboardIcon, sessions: SessionsIcon, hackathon: HackathonIcon, plugins: PluginsIcon, recovery: RecoveryIcon,
}

// Tool name lookup
export const TOOL_NAMES: Record<string, string> = {
  git: 'Git', deploy: 'Deploy', env: 'Env',
  wallet: 'Wallet', email: 'Email', browser: 'Browser',
  ports: 'Ports', processes: 'Processes', settings: 'Settings',
  'image-editor': 'Image Editor', 'solana-toolbox': 'Solana', 'block-scanner': 'Block Scanner', docs: 'Docs', starter: 'New Project',
  'token-launch': 'Token Launch',
  dashboard: 'Dashboard', sessions: 'Sessions', hackathon: 'Hackathon', plugins: 'Plugins', recovery: 'Recovery',
}

// Lazy-load all tool components
const loadGitPanel = () => import('../../panels/GitPanel/GitPanel')
const loadEnvManager = () => import('../../panels/EnvManager/EnvManager')
const loadDeployPanel = () => import('../../panels/plugins/Deploy/Deploy')
const loadEmailPanel = () => import('../../panels/plugins/Email/EmailPanel')
const loadWalletPanel = () => import('../../panels/WalletPanel/WalletPanel')
const loadSettingsPanel = () => import('../../panels/SettingsPanel/SettingsPanel')
const loadPortsPanel = () => import('../../panels/PortsPanel/PortsPanel')
const loadProcessManager = () => import('../../panels/ProcessManager/ProcessManager')
const loadImageEditor = () => import('../../panels/ImageEditor/ImageEditor')
const loadSolanaToolbox = () => import('../../panels/SolanaToolbox/SolanaToolbox')
const loadTokenLaunchTool = () => import('../../panels/TokenLaunchTool/TokenLaunchTool')
const loadBlockScanner = () => import('../../panels/BlockScanner/BlockScanner')
const loadDocsPanel = () => import('../../panels/DocsPanel/DocsPanel')
const loadProjectStarter = () => import('../../panels/ProjectStarter/ProjectStarter')
const loadDashboardCanvas = () => import('../../panels/Dashboard/DashboardCanvas')
const loadSessionHistory = () => import('../../panels/SessionRegistry/SessionHistory')
const loadHackathonPanel = () => import('../../panels/Colosseum/HackathonPanel')
const loadPluginManager = () => import('../../panels/PluginManager/PluginManager')
const loadRecoveryPanel = () => import('../../panels/RecoveryPanel/RecoveryPanel')

const GitPanel = lazyNamedWithReload('git-panel', loadGitPanel, (m) => m.GitPanel)
const EnvManager = lazyNamedWithReload('env-manager', loadEnvManager, (m) => m.EnvManager)
const DeployPanel = lazyWithReload('deploy-panel', loadDeployPanel)
const EmailPanel = lazyWithReload('email-panel', loadEmailPanel)
const WalletPanel = lazyNamedWithReload('wallet-panel', loadWalletPanel, (m) => m.WalletPanel)
const SettingsPanel = lazyNamedWithReload('settings-panel', loadSettingsPanel, (m) => m.SettingsPanel)
const PortsPanel = lazyNamedWithReload('ports-panel', loadPortsPanel, (m) => m.PortsPanel)
const ProcessManager = lazyNamedWithReload('process-manager', loadProcessManager, (m) => m.ProcessManager)
const ImageEditor = lazyWithReload('image-editor', loadImageEditor)
const SolanaToolbox = lazyWithReload('solana-toolbox', loadSolanaToolbox)
const TokenLaunchTool = lazyWithReload('token-launch-tool', loadTokenLaunchTool)
const BlockScanner = lazyWithReload('block-scanner', loadBlockScanner)
const DocsPanel = lazyNamedWithReload('docs-panel', loadDocsPanel, (m) => m.DocsPanel)
const ProjectStarter = lazyWithReload('project-starter', loadProjectStarter)
const DashboardCanvas = lazyNamedWithReload('dashboard-canvas', loadDashboardCanvas, (m) => m.DashboardCanvas)
const SessionHistory = lazyNamedWithReload('session-history', loadSessionHistory, (m) => m.SessionHistory)
const HackathonPanel = lazyNamedWithReload('hackathon-panel', loadHackathonPanel, (m) => m.HackathonPanel)
const PluginManager = lazyNamedWithReload('plugin-manager', loadPluginManager, (m) => m.PluginManager)
const RecoveryPanel = lazyNamedWithReload('recovery-panel', loadRecoveryPanel, (m) => m.RecoveryPanel)

// Per-tool accent colors for the drawer grid and sidebar
export const TOOL_COLORS: Record<string, string> = {
  starter: '#3ecf8e',
  git: '#a78bfa',
  deploy: '#60a5fa',
  env: '#f0b429',
  wallet: '#f472b6',
  email: '#fb923c',
  ports: '#38bdf8',
  processes: '#ef5350',
  settings: '#9ca3af',
  'image-editor': '#e879f9',
  'solana-toolbox': '#14f195',
  'token-launch': '#38d39f',
  'block-scanner': '#38bdf8',
  docs: '#94a3b8',
}

// Built-in tools registry — exported so other modules can enumerate all tool IDs
// Note: 'browser' is intentionally excluded — it opens as a pinned editor tab (Ctrl+Shift+B), not a drawer panel
export const BUILTIN_TOOLS: DrawerTool[] = [
  { id: 'starter', name: 'New Project', description: 'Scaffold a Solana project with AI', icon: StarterIcon, component: ProjectStarter, preload: () => { void loadProjectStarter() }, category: 'dev' },
  { id: 'git', name: 'Git', description: 'Source control', icon: GitIcon, component: GitPanel, preload: () => { void loadGitPanel() }, category: 'dev' },
  { id: 'deploy', name: 'Deploy', description: 'Vercel & Railway', icon: DeployIcon, component: DeployPanel, preload: () => { void loadDeployPanel() }, category: 'dev' },
  { id: 'env', name: 'Env', description: 'Environment variables', icon: EnvIcon, component: EnvManager, preload: () => { void loadEnvManager() }, category: 'dev' },
  { id: 'wallet', name: 'Wallet', description: 'Solana wallets', icon: WalletIcon, component: WalletPanel, preload: () => { void loadWalletPanel() }, category: 'crypto' },
  { id: 'email', name: 'Email', description: 'Gmail & iCloud', icon: EmailIcon, component: EmailPanel, preload: () => { void loadEmailPanel() }, category: 'create' },
  { id: 'ports', name: 'Ports', description: 'Port scanner', icon: PortsIcon, component: PortsPanel, preload: () => { void loadPortsPanel() }, category: 'system' },
  { id: 'processes', name: 'Processes', description: 'System monitor', icon: ProcessIcon, component: ProcessManager, preload: () => { void loadProcessManager() }, category: 'system' },
  { id: 'settings', name: 'Settings', description: 'App configuration', icon: SettingsIcon, component: SettingsPanel, preload: () => { void loadSettingsPanel() }, category: 'system' },
  { id: 'image-editor', name: 'Image Editor', description: 'Edit images with layers & filters', icon: PaintIcon, component: ImageEditor, preload: () => { void loadImageEditor() }, category: 'create' },
  { id: 'token-launch', name: 'Token Launch', description: 'Unified Pump.fun, Raydium, and Meteora launch workflow', icon: TokenLaunchIcon, component: TokenLaunchTool, preload: () => { void loadTokenLaunchTool() }, category: 'crypto' },
  { id: 'solana-toolbox', name: 'Solana', description: 'Solana tools, MCPs, validator', icon: SolanaIcon, component: SolanaToolbox, preload: () => { void loadSolanaToolbox() }, category: 'crypto' },
  { id: 'block-scanner', name: 'Block Scanner', description: 'Solana explorer powered by Orb', icon: ScannerIcon, component: BlockScanner, preload: () => { void loadBlockScanner() }, category: 'crypto' },
  { id: 'docs', name: 'Docs', description: 'DAEMON documentation', icon: DocsIcon, component: DocsPanel, preload: () => { void loadDocsPanel() }, category: 'system' },
  { id: 'dashboard', name: 'Dashboard', description: 'Market data and watchlist', icon: DashboardIcon, component: DashboardCanvas, preload: () => { void loadDashboardCanvas() }, category: 'crypto' },
  { id: 'sessions', name: 'Sessions', description: 'Agent session history', icon: SessionsIcon, component: SessionHistory, preload: () => { void loadSessionHistory() }, category: 'dev' },
  { id: 'hackathon', name: 'Hackathon', description: 'Colosseum tracker', icon: HackathonIcon, component: HackathonPanel, preload: () => { void loadHackathonPanel() }, category: 'crypto' },
  { id: 'plugins', name: 'Plugins', description: 'Manage plugins', icon: PluginsIcon, component: PluginManager, preload: () => { void loadPluginManager() }, category: 'system' },
  { id: 'recovery', name: 'Recovery', description: 'Crash recovery and snapshots', icon: RecoveryIcon, component: RecoveryPanel, preload: () => { void loadRecoveryPanel() }, category: 'system' },
]

const BUILTIN_TOOL_PRELOADERS = new Map(
  BUILTIN_TOOLS
    .filter((tool) => typeof tool.preload === 'function')
    .map((tool) => [tool.id, tool.preload as () => void]),
)

export function preloadToolPanel(toolId: string) {
  BUILTIN_TOOL_PRELOADERS.get(toolId)?.()
}

function getDrawerTools(toolVisibility: Record<string, boolean>): DrawerTool[] {
  const tools = [...BUILTIN_TOOLS]

  // Add enabled plugins
  const plugins = usePluginStore.getState().plugins
  for (const p of plugins) {
    if (!p.enabled) continue
    const manifest = PLUGIN_REGISTRY[p.id]
    if (!manifest) continue
    // Skip plugins already represented as built-in tools
    if (BUILTIN_TOOLS.some(t => t.id === p.id)) continue
    tools.push({
      id: p.id,
      name: manifest.name,
      description: manifest.description,
      icon: manifest.icon,
      component: manifest.component,
      category: 'crypto',
    })
  }

  // Filter by workspace profile visibility
  return tools.filter((t) => {
    if (t.id === 'settings') return true
    if (!(t.id in toolVisibility)) return true
    return toolVisibility[t.id]
  })
}

function ToolFallback({ tool }: { tool?: DrawerTool | null }) {
  return (
    <div className="drawer-loading">
      <div className="drawer-loading-title">{tool?.name ?? 'Loading tool'}</div>
      <div className="drawer-loading-copy">Preparing panel...</div>
    </div>
  )
}

// Shared MIME type for tool drag-and-drop (drawer <-> sidebar)
export const TOOL_DND_MIME = 'application/x-daemon-tool'

export function CommandDrawer() {
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const drawerTool = useUIStore((s) => s.drawerTool)
  const drawerFullscreen = useUIStore((s) => s.drawerFullscreen)
  const drawerToolOrder = useUIStore((s) => s.drawerToolOrder)
  const setDrawerTool = useUIStore((s) => s.setDrawerTool)
  const closeDrawer = useUIStore((s) => s.closeDrawer)
  const toggleDrawerFullscreen = useUIStore((s) => s.toggleDrawerFullscreen)

  const [search, setSearch] = useState('')
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const plugins = usePluginStore((s) => s.plugins)
  const toolVisibility = useWorkspaceProfileStore((s) => s.toolVisibility)
  const rawTools = useMemo(() => getDrawerTools(toolVisibility), [plugins, toolVisibility]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply custom ordering if set
  const allTools = useMemo(() => {
    if (!drawerToolOrder.length) return rawTools
    const byId = new Map(rawTools.map((t) => [t.id, t]))
    const ordered: DrawerTool[] = []
    for (const id of drawerToolOrder) {
      const tool = byId.get(id)
      if (tool) { ordered.push(tool); byId.delete(id) }
    }
    // Append any tools not in the saved order (new tools)
    for (const tool of byId.values()) ordered.push(tool)
    return ordered
  }, [rawTools, drawerToolOrder])

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allTools
    return allTools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    )
  }, [allTools, search])

  // Focus search input when drawer opens in grid mode
  useEffect(() => {
    if (drawerOpen && !drawerTool) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [drawerOpen, drawerTool])

  useEffect(() => {
    if (!drawerOpen || drawerTool) return
    const visibleToolIds = filteredTools
      .slice(0, 8)
      .map((tool) => tool.id)

    let cancelled = false
    const prewarmVisibleTools = () => {
      if (cancelled) return
      visibleToolIds.forEach((toolId) => preloadToolPanel(toolId))
    }

    const idleCallback = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }).requestIdleCallback

    if (typeof idleCallback === 'function') {
      const idleId = idleCallback(prewarmVisibleTools, { timeout: 1200 })
      return () => {
        cancelled = true
        window.cancelIdleCallback?.(idleId)
      }
    }

    const timeoutId = window.setTimeout(prewarmVisibleTools, 75)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [drawerOpen, drawerTool, filteredTools])

  // Esc to close or go back to grid
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (document.querySelector('.agent-launcher-overlay, .palette-overlay')) return
      e.preventDefault()
      e.stopPropagation()
      if (drawerTool) {
        useUIStore.setState({ drawerTool: null, drawerFullscreen: false })
      } else {
        closeDrawer()
      }
    }
  }, [drawerTool, closeDrawer])

  useEffect(() => {
    if (!drawerOpen) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [drawerOpen, handleKeyDown])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredTools.length > 0) {
      e.preventDefault()
      setDrawerTool(filteredTools[0].id)
      setSearch('')
    }
  }

  const handleToolClick = (toolId: string) => {
    preloadToolPanel(toolId)
    setDrawerTool(toolId)
    setSearch('')
  }

  // --- Drag-and-drop for reordering ---
  const handleDragStart = useCallback((e: DragEvent<HTMLButtonElement>, toolId: string) => {
    e.dataTransfer.setData(TOOL_DND_MIME, toolId)
    e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('drawer-tool-card--dragging')
  }, [])

  const handleDragEnd = useCallback((e: DragEvent<HTMLButtonElement>) => {
    ;(e.currentTarget as HTMLElement).classList.remove('drawer-tool-card--dragging')
    setDragOverIdx(null)
  }, [])

  const handleCardDragOver = useCallback((e: DragEvent<HTMLButtonElement>, idx: number) => {
    if (!e.dataTransfer.types.includes(TOOL_DND_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }, [])

  const handleCardDrop = useCallback((e: DragEvent<HTMLButtonElement>, targetIdx: number) => {
    e.preventDefault()
    setDragOverIdx(null)
    const draggedId = e.dataTransfer.getData(TOOL_DND_MIME)
    if (!draggedId) return
    const currentOrder = allTools.map((t) => t.id)
    const fromIdx = currentOrder.indexOf(draggedId)
    if (fromIdx === -1 || fromIdx === targetIdx) return
    currentOrder.splice(fromIdx, 1)
    currentOrder.splice(targetIdx, 0, draggedId)
    useUIStore.getState().setDrawerToolOrder(currentOrder)
  }, [allTools])

  if (!drawerOpen) return null

  const activeTool = drawerTool ? allTools.find(t => t.id === drawerTool) : null

  return (
    <div className={`command-drawer${drawerFullscreen ? ' command-drawer--fullscreen' : ''}`} ref={drawerRef}>
      {/* Header */}
      <div className="drawer-header">
        {activeTool ? (
          <>
            <button className="drawer-back" onClick={() => useUIStore.setState({ drawerTool: null, drawerFullscreen: false })} title="Back to tools">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <span className="drawer-title">{activeTool.name}</span>
          </>
        ) : (
          <input
            ref={searchRef}
            className="drawer-search"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        )}
        {activeTool && (
          <button className="drawer-fullscreen" onClick={toggleDrawerFullscreen} title={drawerFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {drawerFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            )}
          </button>
        )}
        <button className="drawer-close" onClick={closeDrawer} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="drawer-content">
        {activeTool ? (
            <PanelErrorBoundary fallbackLabel="Tool crashed — press Esc to go back">
            <Suspense fallback={<ToolFallback tool={activeTool} />}>
              <activeTool.component />
            </Suspense>
          </PanelErrorBoundary>
        ) : (
          <DrawerGrid
            tools={filteredTools}
            search={search}
            dragOverIdx={dragOverIdx}
            onToolClick={handleToolClick}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onCardDragOver={handleCardDragOver}
            onCardDragLeave={() => setDragOverIdx(null)}
            onCardDrop={handleCardDrop}
          />
        )}
      </div>
    </div>
  )
}

// --- Drawer grid (categorized when not searching, flat when searching) ---

const CATEGORY_LABELS: Record<DrawerTool['category'], string> = {
  dev: 'Development',
  crypto: 'Crypto',
  create: 'Create',
  system: 'System',
}

const CATEGORY_ORDER: DrawerTool['category'][] = ['dev', 'crypto', 'create', 'system']

interface DrawerGridProps {
  tools: DrawerTool[]
  search: string
  dragOverIdx: number | null
  onToolClick: (id: string) => void
  onDragStart: (e: DragEvent<HTMLButtonElement>, id: string) => void
  onDragEnd: (e: DragEvent<HTMLButtonElement>) => void
  onCardDragOver: (e: DragEvent<HTMLButtonElement>, idx: number) => void
  onCardDragLeave: () => void
  onCardDrop: (e: DragEvent<HTMLButtonElement>, idx: number) => void
}

function DrawerGrid({
  tools, search, dragOverIdx,
  onToolClick, onDragStart, onDragEnd, onCardDragOver, onCardDragLeave, onCardDrop,
}: DrawerGridProps) {
  if (tools.length === 0) {
    return <div className="drawer-empty">No tools match "{search}"</div>
  }

  // When searching, render a flat grid
  if (search) {
    return (
      <div className="drawer-grid">
        {tools.map((tool, idx) => (
          <DrawerCard
            key={tool.id}
            tool={tool}
            idx={idx}
            isDropTarget={dragOverIdx === idx}
            onClick={onToolClick}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardDragOver={onCardDragOver}
            onCardDragLeave={onCardDragLeave}
            onCardDrop={onCardDrop}
          />
        ))}
      </div>
    )
  }

  // When browsing, render categorized sections
  const grouped = new Map<DrawerTool['category'], DrawerTool[]>()
  for (const tool of tools) {
    const arr = grouped.get(tool.category) ?? []
    arr.push(tool)
    grouped.set(tool.category, arr)
  }

  // Use a global index across categories so the drag-drop reorder still works
  let globalIdx = 0
  return (
    <div className="drawer-grid-categorized">
      {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => (
        <section key={category} className="drawer-category-section">
          <div className="drawer-category-header">{CATEGORY_LABELS[category]}</div>
          <div className="drawer-grid">
            {grouped.get(category)!.map((tool) => {
              const idx = globalIdx++
              return (
                <DrawerCard
                  key={tool.id}
                  tool={tool}
                  idx={idx}
                  isDropTarget={dragOverIdx === idx}
                  onClick={onToolClick}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onCardDragOver={onCardDragOver}
                  onCardDragLeave={onCardDragLeave}
                  onCardDrop={onCardDrop}
                />
              )
            })}
          </div>
        </section>
      ))}
      <div className="drawer-hint">Drag favorites to sidebar</div>
    </div>
  )
}

interface DrawerCardProps {
  tool: DrawerTool
  idx: number
  isDropTarget: boolean
  onClick: (id: string) => void
  onDragStart: (e: DragEvent<HTMLButtonElement>, id: string) => void
  onDragEnd: (e: DragEvent<HTMLButtonElement>) => void
  onCardDragOver: (e: DragEvent<HTMLButtonElement>, idx: number) => void
  onCardDragLeave: () => void
  onCardDrop: (e: DragEvent<HTMLButtonElement>, idx: number) => void
}

function DrawerCard({
  tool, idx, isDropTarget,
  onClick, onDragStart, onDragEnd, onCardDragOver, onCardDragLeave, onCardDrop,
}: DrawerCardProps) {
  const Icon = tool.icon
  const color = TOOL_COLORS[tool.id] ?? '#3ecf8e'
  return (
    <button
      className={`drawer-tool-card${isDropTarget ? ' drawer-tool-card--drop-target' : ''}`}
      style={{ '--tool-color': color, '--tool-glow': `${color}20` } as React.CSSProperties}
      draggable
      onClick={() => onClick(tool.id)}
      onDragStart={(e) => onDragStart(e, tool.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onCardDragOver(e, idx)}
      onDragLeave={onCardDragLeave}
      onDrop={(e) => onCardDrop(e, idx)}
      onMouseEnter={tool.preload}
      onFocus={tool.preload}
    >
      <div className="drawer-tool-icon"><Icon size={20} /></div>
      <div className="drawer-tool-name">{tool.name}</div>
      <div className="drawer-tool-desc">{tool.description}</div>
    </button>
  )
}

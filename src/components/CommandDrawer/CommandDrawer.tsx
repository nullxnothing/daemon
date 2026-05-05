import { useState, useRef, useEffect, useCallback, useMemo, type ComponentType, type DragEvent } from 'react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { TOOL_DISPLAY_NAMES } from '../../constants/toolRegistry'
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

// Built-in tool icons — exported for sidebar pinning.
// These use one restrained line-icon language; color is applied by the card/rail.
type IconProps = { size?: number }

function ToolIconBase({ size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function GitIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <circle cx="7" cy="6" r="2.1" />
      <circle cx="17" cy="12" r="2.1" />
      <circle cx="7" cy="18" r="2.1" />
      <path d="M7 8.1v7.8M9.1 6h2.4a4 4 0 0 1 4 4v0" />
    </ToolIconBase>
  )
}

function EnvIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M6 8h12M6 16h12" />
      <circle cx="9" cy="8" r="2.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="16" r="2.1" fill="currentColor" stroke="none" />
    </ToolIconBase>
  )
}

function DeployIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M8.2 18.5H7a4 4 0 0 1-.8-7.9 6 6 0 0 1 11.5-1.7A4.8 4.8 0 0 1 17 18.5h-1.2" />
      <path d="M12 18.5v-8M9 13.5l3-3 3 3" />
    </ToolIconBase>
  )
}

function EmailIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <rect x="4" y="5.5" width="16" height="13" rx="2.3" />
      <path d="m5 8 7 5 7-5" />
    </ToolIconBase>
  )
}

function WalletIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M5 7.5h12.5A2.5 2.5 0 0 1 20 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5H16" />
      <path d="M16.5 12.5H21v4h-4.5a2 2 0 0 1 0-4Z" />
      <path d="M17 14.5h.01" />
    </ToolIconBase>
  )
}

function SettingsIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M12 3.8 14 4.4l1.7-1 1.9 1.9-1 1.7.6 2 1.8.9v2.8l-1.8.9-.6 2 1 1.7-1.9 1.9-1.7-1-2 .6-1 1.8H8.2l-1-1.8-2-.6-1.7 1-1.9-1.9 1-1.7-.6-2-1.8-.9V9.9L2 9l.6-2-1-1.7 1.9-1.9 1.7 1 2-.6 1-1.8H12Z" />
      <circle cx="12" cy="12" r="3" />
    </ToolIconBase>
  )
}

function PortsIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M7 7h10v5H7zM12 12v5M8.5 17h7" />
      <path d="M8 4v3M12 4v3M16 4v3" />
    </ToolIconBase>
  )
}

function ProcessIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
      <path d="M10 10h4v4h-4z" />
    </ToolIconBase>
  )
}

function PaintIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="8.2" cy="9.2" r="1.2" fill="currentColor" stroke="none" />
      <path d="m6.5 16 4-4 2.5 2.5 2-2 2.5 3.5" />
    </ToolIconBase>
  )
}

function BrowserIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5a12 12 0 0 1 0 17M12 3.5a12 12 0 0 0 0 17" />
    </ToolIconBase>
  )
}

function DocsIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M7 3.5h7l4 4V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
      <path d="M14 3.5V8h4M8 12h8M8 15h8M8 18h5" />
    </ToolIconBase>
  )
}

function StarterIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M7 3.5h7l4 4V20H7a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
      <path d="M14 3.5V8h4M11.5 11.5v5M9 14h5" />
    </ToolIconBase>
  )
}

function ReplayIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M4.5 11a7.5 7.5 0 1 1 2.2 5.3" />
      <path d="M4.5 6.5V11H9" />
      <path d="m11 9.5 4 2.5-4 2.5Z" fill="currentColor" stroke="none" />
    </ToolIconBase>
  )
}

function ScannerIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M7 4H5.5A1.5 1.5 0 0 0 4 5.5V7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17M17 20h1.5a1.5 1.5 0 0 0 1.5-1.5V17" />
      <rect x="7" y="7" width="10" height="10" rx="1.8" />
      <path d="M9.5 12h5" />
    </ToolIconBase>
  )
}

function DashboardIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M5 19V9M12 19V5M19 19v-7" />
      <path d="M4 19h16" />
      <path d="m5 9 7-4 7 7" />
    </ToolIconBase>
  )
}

function SessionsIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3 1.8" />
      <path d="M8 4.6 6.6 3.4M16 4.6l1.4-1.2" />
    </ToolIconBase>
  )
}

function HackathonIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.5A2.5 2.5 0 0 0 8 10.2M16 6h2.5a2.5 2.5 0 0 1-2.5 4.2" />
      <path d="M12 11v4M9 20h6M10 15h4v5h-4z" />
    </ToolIconBase>
  )
}

function PluginsIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M9 4a2 2 0 1 1 4 0v2h3a2 2 0 0 1 2 2v3h-2a2 2 0 1 0 0 4h2v3a2 2 0 0 1-2 2h-3v-2a2 2 0 1 0-4 0v2H6a2 2 0 0 1-2-2v-3h2a2 2 0 1 0 0-4H4V8a2 2 0 0 1 2-2h3V4Z" />
    </ToolIconBase>
  )
}

function RecoveryIcon({ size = 18 }: IconProps) {
  return (
    <ToolIconBase size={size}>
      <path d="M5 12a7 7 0 1 0 2.1-5" />
      <path d="M5 4v5h5" />
      <path d="M12 8v5l3 1.5" />
    </ToolIconBase>
  )
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
function IntegrationsIcon({ size = 18 }: { size?: number }) {
  return (
    <ToolIconBase size={size}>
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="m7.5 10.5 3-3M13.5 7.5l3 3M16.5 13.5l-3 3M10.5 16.5l-3-3" />
    </ToolIconBase>
  )
}
function ReadinessIcon({ size = 18 }: { size?: number }) {
  return (
    <ToolIconBase size={size}>
      <path d="M9 11.5 11.2 14 16 8.5" />
      <path d="M5 6.5h3M5 12h2M5 17.5h3" />
      <path d="M10.5 6.5H19M10.5 17.5H19" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    </ToolIconBase>
  )
}
function TokenLaunchIcon({ size = 18 }: { size?: number }) {
  return (
    <ToolIconBase size={size}>
      <path d="M8 15.5c-1.3 1-2 2.7-1.8 4.3 1.6.2 3.3-.5 4.3-1.8l6.8-8A3 3 0 0 0 13 5.7l-8 6.8Z" />
      <path d="m13 5.7 5.3 5.3M8.5 11.5l4 4" />
      <path d="M18 4h2v2M4 18v2h2" />
    </ToolIconBase>
  )
}
function ProIcon({ size = 18 }: { size?: number }) {
  return (
    <ToolIconBase size={size}>
      <path d="M12 3.5 19 6v5.3c0 4.2-2.7 7.2-7 9.2-4.3-2-7-5-7-9.2V6l7-2.5Z" />
      <path d="m12 8.2 1.1 2.2 2.4.4-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.4L12 8.2Z" />
    </ToolIconBase>
  )
}
function ActivityIcon({ size = 18 }: { size?: number }) {
  return (
    <ToolIconBase size={size}>
      <path d="M4 13h4l2-6 4 12 2-6h4" />
      <path d="M4 20h16" opacity="0.45" />
    </ToolIconBase>
  )
}

// Icon lookup for pinned sidebar tools
function AgentStationIcon({ size = 18 }: { size?: number }) {
  return (
    <ToolIconBase size={size}>
      <rect x="5" y="6" width="14" height="10" rx="3" />
      <path d="M12 3.5V6M9 19h6M12 16v3" />
      <circle cx="9.2" cy="11" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.8" cy="11" r="1" fill="currentColor" stroke="none" />
    </ToolIconBase>
  )
}

function AgentWorkIcon({ size = 18 }: { size?: number }) {
  return (
    <ToolIconBase size={size}>
      <path d="M5 7.5h9.5L19 12v6.5A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-11Z" />
      <path d="M14.5 7.5V12H19" />
      <path d="M8.5 14h7M8.5 17h4.5" />
      <path d="M7.5 3.5h5l1.5 2" />
    </ToolIconBase>
  )
}

export const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  git: GitIcon, deploy: DeployIcon, env: EnvIcon,
  wallet: WalletIcon, email: EmailIcon, browser: BrowserIcon,
  ports: PortsIcon, processes: ProcessIcon, settings: SettingsIcon,
  'image-editor': PaintIcon, 'solana-toolbox': SolanaIcon, 'block-scanner': ScannerIcon, 'replay-engine': ReplayIcon, docs: DocsIcon, starter: StarterIcon,
  'token-launch': TokenLaunchIcon, integrations: IntegrationsIcon, 'project-readiness': ReadinessIcon,
  dashboard: DashboardIcon, sessions: SessionsIcon, hackathon: HackathonIcon, plugins: PluginsIcon, recovery: RecoveryIcon, pro: ProIcon, activity: ActivityIcon,
  'agent-station': AgentStationIcon,
  'agent-work': AgentWorkIcon,
}

// Tool name lookup
export const TOOL_NAMES: Record<string, string> = { ...TOOL_DISPLAY_NAMES }

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
const loadIntegrationCommandCenter = () => import('../../panels/IntegrationCommandCenter/IntegrationCommandCenter')
const loadProjectReadiness = () => import('../../panels/ProjectReadiness/ProjectReadiness')
const loadTokenLaunchTool = () => import('../../panels/TokenLaunchTool/TokenLaunchTool')
const loadBlockScanner = () => import('../../panels/BlockScanner/BlockScanner')
const loadDocsPanel = () => import('../../panels/DocsPanel/DocsPanel')
const loadProjectStarter = () => import('../../panels/ProjectStarter/ProjectStarter')
const loadDashboardCanvas = () => import('../../panels/Dashboard/DashboardCanvas')
const loadSessionHistory = () => import('../../panels/SessionRegistry/SessionHistory')
const loadHackathonPanel = () => import('../../panels/Colosseum/HackathonPanel')
const loadPluginManager = () => import('../../panels/PluginManager/PluginManager')
const loadRecoveryPanel = () => import('../../panels/RecoveryPanel/RecoveryPanel')
const loadProPanel = () => import('../../panels/ProPanel/ProPanel')
const loadActivityTimeline = () => import('../../panels/ActivityTimeline/ActivityTimeline')
const loadAgentStation = () => import('../../panels/AgentStation/AgentStation')
const loadReplayEngine = () => import('../../panels/ReplayEngine/ReplayEngine')
const loadAgentWork = () => import('../../panels/AgentWork/AgentWork')

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
const IntegrationCommandCenter = lazyWithReload('integration-command-center', loadIntegrationCommandCenter)
const ProjectReadiness = lazyWithReload('project-readiness', loadProjectReadiness)
const TokenLaunchTool = lazyWithReload('token-launch-tool', loadTokenLaunchTool)
const BlockScanner = lazyWithReload('block-scanner', loadBlockScanner)
const DocsPanel = lazyNamedWithReload('docs-panel', loadDocsPanel, (m) => m.DocsPanel)
const ProjectStarter = lazyWithReload('project-starter', loadProjectStarter)
const DashboardCanvas = lazyNamedWithReload('dashboard-canvas', loadDashboardCanvas, (m) => m.DashboardCanvas)
const SessionHistory = lazyNamedWithReload('session-history', loadSessionHistory, (m) => m.SessionHistory)
const HackathonPanel = lazyNamedWithReload('hackathon-panel', loadHackathonPanel, (m) => m.HackathonPanel)
const PluginManager = lazyNamedWithReload('plugin-manager', loadPluginManager, (m) => m.PluginManager)
const RecoveryPanel = lazyNamedWithReload('recovery-panel', loadRecoveryPanel, (m) => m.RecoveryPanel)
const ProPanel = lazyNamedWithReload('pro-panel', loadProPanel, (m) => m.ProPanel)
const ActivityTimeline = lazyNamedWithReload('activity-timeline', loadActivityTimeline, (m) => m.ActivityTimeline)
const AgentStationPanel = lazyNamedWithReload('agent-station', loadAgentStation, (m) => m.AgentStation)
const ReplayEngine = lazyNamedWithReload('replay-engine', loadReplayEngine, (m) => m.ReplayEngine)
const AgentWork = lazyNamedWithReload('agent-work', loadAgentWork, (m) => m.AgentWork)

// Per-tool accent colors for the drawer grid and sidebar
export const TOOL_COLORS: Record<string, string> = {
  starter: '#7dd3fc',
  git: '#a78bfa',
  deploy: '#60a5fa',
  env: '#f6c768',
  wallet: '#f0abfc',
  email: '#fb923c',
  browser: '#60a5fa',
  ports: '#67e8f9',
  processes: '#f87171',
  settings: '#a3aab8',
  'image-editor': '#d8b4fe',
  'solana-toolbox': '#14f195',
  integrations: '#5eead4',
  'project-readiness': '#86efac',
  'token-launch': '#34d399',
  'block-scanner': '#38bdf8',
  'replay-engine': '#7dd3fc',
  docs: '#fbbf24',
  dashboard: '#22c55e',
  sessions: '#38bdf8',
  hackathon: '#facc15',
  plugins: '#cbd5e1',
  recovery: '#fb7185',
  pro: '#fde047',
  activity: '#2dd4bf',
  'agent-station': '#c4b5fd',
  'agent-work': '#38bdf8',
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
  { id: 'project-readiness', name: 'Project Readiness', description: 'Solana project, wallet, RPC, MCP, and first-action checklist', icon: ReadinessIcon, component: ProjectReadiness, preload: () => { void loadProjectReadiness() }, category: 'crypto' },
  { id: 'solana-toolbox', name: 'Solana', description: 'Solana tools, MCPs, validator', icon: SolanaIcon, component: SolanaToolbox, preload: () => { void loadSolanaToolbox() }, category: 'crypto' },
  { id: 'integrations', name: 'Integrations', description: 'Guided Solana integration setup and safe checks', icon: IntegrationsIcon, component: IntegrationCommandCenter, preload: () => { void loadIntegrationCommandCenter() }, category: 'crypto' },
  { id: 'block-scanner', name: 'Block Scanner', description: 'Solana explorer powered by Orb', icon: ScannerIcon, component: BlockScanner, preload: () => { void loadBlockScanner() }, category: 'crypto' },
  { id: 'replay-engine', name: 'Replay', description: 'Replay any Solana transaction with on-chain context and AI handoff', icon: ReplayIcon, component: ReplayEngine, preload: () => { void loadReplayEngine() }, category: 'crypto' },
  { id: 'docs', name: 'Docs', description: 'DAEMON documentation', icon: DocsIcon, component: DocsPanel, preload: () => { void loadDocsPanel() }, category: 'system' },
  { id: 'dashboard', name: 'Dashboard', description: 'Market data and watchlist', icon: DashboardIcon, component: DashboardCanvas, preload: () => { void loadDashboardCanvas() }, category: 'crypto' },
  { id: 'agent-work', name: 'Agent Work', description: 'Wallet-funded agent jobs, receipts, verification, and settlement', icon: AgentWorkIcon, component: AgentWork, preload: () => { void loadAgentWork() }, category: 'crypto' },
  { id: 'sessions', name: 'Sessions', description: 'Agent session history', icon: SessionsIcon, component: SessionHistory, preload: () => { void loadSessionHistory() }, category: 'dev' },
  { id: 'hackathon', name: 'Hackathon', description: 'Colosseum tracker', icon: HackathonIcon, component: HackathonPanel, preload: () => { void loadHackathonPanel() }, category: 'crypto' },
  { id: 'pro', name: 'Daemon Pro', description: 'Arena, Pro skills, MCP sync, and priority API', icon: ProIcon, component: ProPanel, preload: () => { void loadProPanel() }, category: 'crypto' },
  { id: 'activity', name: 'Activity', description: 'Flight recorder for Solana development', icon: ActivityIcon, component: ActivityTimeline, preload: () => { void loadActivityTimeline() }, category: 'system' },
  { id: 'plugins', name: 'Plugins', description: 'Manage plugins', icon: PluginsIcon, component: PluginManager, preload: () => { void loadPluginManager() }, category: 'system' },
  { id: 'recovery', name: 'Recovery', description: 'Crash recovery and snapshots', icon: RecoveryIcon, component: RecoveryPanel, preload: () => { void loadRecoveryPanel() }, category: 'system' },
  { id: 'agent-station', name: 'Agent Station', description: 'Scaffold and run Solana AI agents powered by SAK', icon: AgentStationIcon, component: AgentStationPanel, preload: () => { void loadAgentStation() }, category: 'crypto' },
]

const BUILTIN_TOOL_PRELOADERS = new Map(
  BUILTIN_TOOLS
    .filter((tool) => typeof tool.preload === 'function')
    .map((tool) => [tool.id, tool.preload as () => void]),
)

export function preloadToolPanel(toolId: string) {
  BUILTIN_TOOL_PRELOADERS.get(toolId)?.()
}

function getDrawerTools(isToolVisible: (toolId: string) => boolean): DrawerTool[] {
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
  return tools.filter((t) => isToolVisible(t.id))
}

// Shared MIME type for tool drag-and-drop (drawer <-> sidebar)
export const TOOL_DND_MIME = 'application/x-daemon-tool'

export function CommandDrawer() {
  const drawerOpen = useWorkflowShellStore((s) => s.drawerOpen)
  const drawerToolOrder = useUIStore((s) => s.drawerToolOrder)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const closeDrawer = useWorkflowShellStore((s) => s.closeDrawer)

  const [search, setSearch] = useState('')
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const plugins = usePluginStore((s) => s.plugins)
  const isToolVisible = useWorkspaceProfileStore((s) => s.isToolVisible)
  const rawTools = useMemo(() => getDrawerTools(isToolVisible), [plugins, isToolVisible])

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
    if (drawerOpen) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [drawerOpen])

  useEffect(() => {
    if (!drawerOpen) return
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
  }, [drawerOpen, filteredTools])

  // Esc to close or go back to grid
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (document.querySelector('.agent-launcher-overlay, .palette-overlay')) return
      e.preventDefault()
      e.stopPropagation()
      closeDrawer()
    }
  }, [closeDrawer])

  useEffect(() => {
    if (!drawerOpen) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [drawerOpen, handleKeyDown])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredTools.length > 0) {
      e.preventDefault()
      openWorkspaceTool(filteredTools[0].id)
      setSearch('')
    }
  }

  const handleToolClick = (toolId: string) => {
    preloadToolPanel(toolId)
    openWorkspaceTool(toolId)
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

  return (
    <div className="command-drawer" ref={drawerRef}>
      {/* Header */}
      <div className="drawer-header">
        <input
          ref={searchRef}
          className="drawer-search"
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <button className="drawer-close" onClick={closeDrawer} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="drawer-content">
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

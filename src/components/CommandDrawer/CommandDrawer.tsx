import { useState, useRef, useEffect, useCallback, useMemo, type ComponentType, type DragEvent } from 'react'
import {
  ArrowClockwise,
  Briefcase,
  ChartLineUp,
  ClockCounterClockwise,
  CloudArrowUp,
  Coins,
  Cpu,
  Database,
  DesktopTower,
  EnvelopeSimple,
  FilePlus,
  FileText,
  GearSix,
  GitBranch,
  GlobeHemisphereWest,
  ImageSquare,
  Lifebuoy,
  ListChecks,
  ArrowsClockwise,
  Gauge,
  Plugs,
  PuzzlePiece,
  Robot,
  RocketLaunch,
  Receipt,
  Scan,
  ShareNetwork,
  ShieldStar,
  SlidersHorizontal,
  Sparkle,
  Trophy,
  Wallet,
  type Icon,
} from '@phosphor-icons/react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { TOOL_DISPLAY_NAMES } from '../../constants/toolRegistry'
import { lazyNamedWithReload, lazyWithReload } from '../../utils/lazyWithReload'
import {
  DAEMON_SOLANA_LOGO_COLORS,
  DAEMON_TOOL_ACCENT_FALLBACK,
  DAEMON_TOOL_COLORS,
} from '../../styles/daemonTheme'
import { ClawpumpGlyph } from '../../lib/ClawpumpGlyph'
import { SignalhouseGlyph } from '../../lib/SignalhouseGlyph'
import './CommandDrawer.css'

// All drawer-renderable tools (built-in + plugins)
interface DrawerTool {
  id: string
  name: string
  description: string
  icon: ComponentType<{ size?: number }>
  component: React.LazyExoticComponent<ComponentType>
  preload?: () => void
  category: 'dev' | 'solana-core' | 'launch' | 'agents' | 'markets' | 'partners' | 'create' | 'system'
  // Folded into a pack host panel as a sub-view: hidden from the drawer and
  // sidebar, reachable only via its tool-id alias (see toolAliases.ts). The
  // component stays registered so direct activation still resolves.
  folded?: boolean
}

// Built-in tool icons, exported for sidebar pinning.
type IconProps = { size?: number }

function createPhosphorIcon(IconComponent: Icon, weight: 'duotone' | 'regular' = 'duotone') {
  return function PhosphorToolIcon({ size = 18 }: IconProps) {
    return <IconComponent size={size} weight={weight} aria-hidden="true" />
  }
}

export const GitIcon = createPhosphorIcon(GitBranch, 'regular')
const EnvIcon = createPhosphorIcon(SlidersHorizontal)
const DeployIcon = createPhosphorIcon(CloudArrowUp)
const EmailIcon = createPhosphorIcon(EnvelopeSimple)
const WalletIcon = createPhosphorIcon(Wallet)
const SettingsIcon = createPhosphorIcon(GearSix)
const PortsIcon = createPhosphorIcon(Plugs)
const ProcessIcon = createPhosphorIcon(Cpu)
const PaintIcon = createPhosphorIcon(ImageSquare)
const BrowserIcon = createPhosphorIcon(GlobeHemisphereWest, 'regular')
const DocsIcon = createPhosphorIcon(FileText)
const StarterIcon = createPhosphorIcon(FilePlus)
const ReplayIcon = createPhosphorIcon(ArrowClockwise)
const ScannerIcon = createPhosphorIcon(Scan)
const DashboardIcon = createPhosphorIcon(ChartLineUp)
const SessionsIcon = createPhosphorIcon(ClockCounterClockwise)
const HackathonIcon = createPhosphorIcon(Trophy)
const PluginsIcon = createPhosphorIcon(PuzzlePiece)
const RecoveryIcon = createPhosphorIcon(Lifebuoy)
function SolanaIcon({ size = 18 }: { size?: number }) {
  const { green, purple, magenta } = DAEMON_SOLANA_LOGO_COLORS
  return (
    <svg width={size} height={size} viewBox="0 0 397.7 311.7">
      <defs>
        <linearGradient id="solana-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={green}>
            <animate attributeName="stop-color" values={`${green};${magenta};${green}`} dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor={purple}>
            <animate attributeName="stop-color" values={`${purple};${green};${purple}`} dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor={magenta}>
            <animate attributeName="stop-color" values={`${magenta};${purple};${magenta}`} dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <path fill="url(#solana-flow)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"/>
      <path fill="url(#solana-flow)" d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"/>
      <path fill="url(#solana-flow)" d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"/>
    </svg>
  )
}
const IntegrationsIcon = createPhosphorIcon(ShareNetwork)
const ZauthIcon = createPhosphorIcon(Database)
const ReadinessIcon = createPhosphorIcon(ListChecks)
const TokenLaunchIcon = createPhosphorIcon(RocketLaunch)
const FlywheelIcon = createPhosphorIcon(ArrowsClockwise)
const AutopilotIcon = createPhosphorIcon(Gauge)
const ProofPoolIcon = createPhosphorIcon(ShieldStar)
const ProIcon = createPhosphorIcon(ShieldStar)
const DaemonAIIcon = createPhosphorIcon(Robot)
const ActivityIcon = createPhosphorIcon(Sparkle)
const AgentStationIcon = createPhosphorIcon(DesktopTower)
const AgentWorkIcon = createPhosphorIcon(Briefcase)
const MeterflowIcon = createPhosphorIcon(Receipt)
const AgentEconomyIcon = createPhosphorIcon(Coins)
const ClawpumpIcon = ClawpumpGlyph
const DegenToolsIcon = createPhosphorIcon(Sparkle)
const SignalhouseIcon = SignalhouseGlyph
const AgentOpsIcon = createPhosphorIcon(ShareNetwork)

export const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  git: GitIcon, deploy: DeployIcon, env: EnvIcon,
  wallet: WalletIcon, email: EmailIcon, browser: BrowserIcon,
  ports: PortsIcon, processes: ProcessIcon, settings: SettingsIcon,
  'image-editor': PaintIcon, 'solana-toolbox': SolanaIcon, 'block-scanner': ScannerIcon, 'replay-engine': ReplayIcon, docs: DocsIcon, starter: StarterIcon,
  'token-launch': TokenLaunchIcon, 'proof-pool': ProofPoolIcon, integrations: IntegrationsIcon, 'metaplex-demo': IntegrationsIcon, zauth: ZauthIcon, 'project-readiness': ReadinessIcon,
  dashboard: DashboardIcon, sessions: SessionsIcon, hackathon: HackathonIcon, plugins: PluginsIcon, recovery: RecoveryIcon, pro: ProIcon, activity: ActivityIcon,
  'daemon-ai': DaemonAIIcon,
  'agent-station': AgentStationIcon,
  'agent-work': AgentWorkIcon,
  meterflow: MeterflowIcon,
  'agent-economy': AgentEconomyIcon,
  'clawpump': ClawpumpIcon,
  'degentools': DegenToolsIcon,
  'signalhouse': SignalhouseIcon,
  'flywheel': FlywheelIcon,
  autopilot: AutopilotIcon,
  ricomaps: AgentOpsIcon,
  agentops: AgentOpsIcon,
}

// Tool name lookup
export const TOOL_NAMES: Record<string, string> = { ...TOOL_DISPLAY_NAMES, 'agent-economy': 'Agent Economy' }

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
const loadMetaplexDemo = () => import('../../panels/MetaplexDemo/MetaplexDemoPanel')
const loadAgentOps = () => import('../../panels/AgentOps/AgentOpsPanel')
const loadZauthPanel = () => import('../../panels/Zauth/ZauthPanel')
const loadProjectReadiness = () => import('../../panels/ProjectReadiness/ProjectReadiness')
const loadTokenLaunchTool = () => import('../../panels/TokenLaunchTool/TokenLaunchTool')
const loadProofPoolPanel = () => import('../../panels/ProofPool/ProofPoolPanel')
const loadBlockScanner = () => import('../../panels/BlockScanner/BlockScanner')
const loadDocsPanel = () => import('../../panels/DocsPanel/DocsPanel')
const loadProjectStarter = () => import('../../panels/ProjectStarter/ProjectStarter')
const loadDashboardCanvas = () => import('../../panels/Dashboard/DashboardCanvas')
const loadSessionHistory = () => import('../../panels/SessionRegistry/SessionHistory')
const loadHackathonPanel = () => import('../../panels/Colosseum/HackathonPanel')
const loadDaemonAIPanel = () => import('../../panels/DaemonAI/DaemonAIPanel')
const loadPluginManager = () => import('../../panels/PluginManager/PluginManager')
const loadCapabilityManager = () => import('../../panels/CapabilityManager/CapabilityManager')
const loadRecoveryPanel = () => import('../../panels/RecoveryPanel/RecoveryPanel')
const loadProPanel = () => import('../../panels/ProPanel/ProPanel')
const loadActivityTimeline = () => import('../../panels/ActivityTimeline/ActivityTimeline')
const loadAgentStation = () => import('../../panels/AgentStation/AgentStation')
const loadReplayEngine = () => import('../../panels/ReplayEngine/ReplayEngine')
const loadAgentWork = () => import('../../panels/AgentWork/AgentWork')
const loadMeterflow = () => import('../../panels/Meterflow/MeterflowPanel')
const loadAgentEconomy = () => import('../../panels/AgentEconomy/AgentEconomyPanel')
const loadClawpump = () => import('../../panels/Clawpump/ClawpumpPanel')
const loadDegenTools = () => import('../../panels/DegenTools/DegenToolsPanel')
const loadSignalhouse = () => import('../../panels/Signalhouse/SignalhousePanel')
const loadFlywheel = () => import('../../panels/Flywheel/FlywheelPanel')
const loadAutopilot = () => import('../../panels/Autopilot/AutopilotPanel')
const loadRicoMaps = () => import('../../panels/RicoMaps/RicoMapsPanel')

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
const MetaplexDemoPanel = lazyNamedWithReload('metaplex-demo', loadMetaplexDemo, (m) => m.MetaplexDemoPanel)
const AgentOpsPanel = lazyNamedWithReload('agentops', loadAgentOps, (m) => m.AgentOpsPanel)
const ZauthPanel = lazyNamedWithReload('zauth-panel', loadZauthPanel, (m) => m.ZauthPanel)
const ProjectReadiness = lazyWithReload('project-readiness', loadProjectReadiness)
const TokenLaunchTool = lazyWithReload('token-launch-tool', loadTokenLaunchTool)
const ProofPoolPanel = lazyNamedWithReload('proof-pool-panel', loadProofPoolPanel, (m) => m.ProofPoolPanel)
const BlockScanner = lazyWithReload('block-scanner', loadBlockScanner)
const DocsPanel = lazyNamedWithReload('docs-panel', loadDocsPanel, (m) => m.DocsPanel)
const ProjectStarter = lazyWithReload('project-starter', loadProjectStarter)
const DashboardCanvas = lazyNamedWithReload('dashboard-canvas', loadDashboardCanvas, (m) => m.DashboardCanvas)
const SessionHistory = lazyNamedWithReload('session-history', loadSessionHistory, (m) => m.SessionHistory)
const HackathonPanel = lazyNamedWithReload('hackathon-panel', loadHackathonPanel, (m) => m.HackathonPanel)
const DaemonAIPanel = lazyNamedWithReload('daemon-ai-panel', loadDaemonAIPanel, (m) => m.DaemonAIPanel)
const PluginManager = lazyNamedWithReload('plugin-manager', loadPluginManager, (m) => m.PluginManager)
const CapabilityManager = lazyNamedWithReload('capability-manager', loadCapabilityManager, (m) => m.CapabilityManager)
const RecoveryPanel = lazyNamedWithReload('recovery-panel', loadRecoveryPanel, (m) => m.RecoveryPanel)
const ProPanel = lazyNamedWithReload('pro-panel', loadProPanel, (m) => m.ProPanel)
const ActivityTimeline = lazyNamedWithReload('activity-timeline', loadActivityTimeline, (m) => m.ActivityTimeline)
const AgentStationPanel = lazyNamedWithReload('agent-station', loadAgentStation, (m) => m.AgentStation)
const ReplayEngine = lazyNamedWithReload('replay-engine', loadReplayEngine, (m) => m.ReplayEngine)
const AgentWork = lazyNamedWithReload('agent-work', loadAgentWork, (m) => m.AgentWork)
const MeterflowPanel = lazyNamedWithReload('meterflow', loadMeterflow, (m) => m.MeterflowPanel)
const AgentEconomyPanel = lazyNamedWithReload('agent-economy', loadAgentEconomy, (m) => m.AgentEconomyPanel)
const ClawpumpPanel = lazyNamedWithReload('clawpump', loadClawpump, (m) => m.ClawpumpPanel)
const DegenToolsPanel = lazyNamedWithReload('degentools', loadDegenTools, (m) => m.DegenToolsPanel)
const SignalhousePanel = lazyNamedWithReload('signalhouse', loadSignalhouse, (m) => m.SignalhousePanel)
const FlywheelPanel = lazyNamedWithReload('flywheel', loadFlywheel, (m) => m.FlywheelPanel)
const AutopilotPanel = lazyNamedWithReload('autopilot', loadAutopilot, (m) => m.AutopilotPanel)
const RicoMapsPanel = lazyNamedWithReload('ricomaps', loadRicoMaps, (m) => m.RicoMapsPanel)

// Per-tool accent colors for the drawer grid and sidebar.
export const TOOL_COLORS = DAEMON_TOOL_COLORS

// Built-in tools registry — exported so other modules can enumerate all tool IDs
// Note: 'browser' is intentionally excluded — it opens as a pinned editor tab (Ctrl+Shift+B), not a drawer panel
export const BUILTIN_TOOLS: DrawerTool[] = [
  { id: 'starter', name: 'New Project', description: 'Scaffold a Solana project template', icon: StarterIcon, component: ProjectStarter, preload: () => { void loadProjectStarter() }, category: 'dev' },
  { id: 'git', name: 'Git', description: 'Source control', icon: GitIcon, component: GitPanel, preload: () => { void loadGitPanel() }, category: 'dev' },
  { id: 'deploy', name: 'Deploy', description: 'Vercel & Railway', icon: DeployIcon, component: DeployPanel, preload: () => { void loadDeployPanel() }, category: 'dev' },
  { id: 'env', name: 'Env', description: 'Environment variables', icon: EnvIcon, component: EnvManager, preload: () => { void loadEnvManager() }, category: 'dev' },
  { id: 'wallet', name: 'Wallet', description: 'Solana wallets', icon: WalletIcon, component: WalletPanel, preload: () => { void loadWalletPanel() }, category: 'solana-core' },
  { id: 'email', name: 'Email', description: 'Gmail & iCloud', icon: EmailIcon, component: EmailPanel, preload: () => { void loadEmailPanel() }, category: 'create' },
  { id: 'ports', name: 'Ports', description: 'Port scanner', icon: PortsIcon, component: PortsPanel, preload: () => { void loadPortsPanel() }, category: 'system' },
  { id: 'processes', name: 'Processes', description: 'System monitor', icon: ProcessIcon, component: ProcessManager, preload: () => { void loadProcessManager() }, category: 'system' },
  { id: 'settings', name: 'Settings', description: 'App configuration', icon: SettingsIcon, component: SettingsPanel, preload: () => { void loadSettingsPanel() }, category: 'system' },
  { id: 'image-editor', name: 'Image Editor', description: 'Edit images with layers & filters', icon: PaintIcon, component: ImageEditor, preload: () => { void loadImageEditor() }, category: 'create' },
  { id: 'token-launch', name: 'Token Launch', description: 'Unified Pump.fun, Raydium, Meteora, and basedbid launch workflow', icon: TokenLaunchIcon, component: TokenLaunchTool, preload: () => { void loadTokenLaunchTool() }, category: 'launch' },
  { id: 'proof-pool', name: 'Proof Pool', description: 'Pooled Pump.fun launches with verified backer slots', icon: ProofPoolIcon, component: ProofPoolPanel, preload: () => { void loadProofPoolPanel() }, category: 'launch', folded: true },
  { id: 'project-readiness', name: 'Solana Start', description: 'Project, wallet, RPC, MCP, AI, and first safe action checklist', icon: ReadinessIcon, component: ProjectReadiness, preload: () => { void loadProjectReadiness() }, category: 'solana-core', folded: true },
  { id: 'solana-toolbox', name: 'Solana Workflow', description: 'Start, Connect, Build, Launch, Inspect, and Debug for Solana projects', icon: SolanaIcon, component: SolanaToolbox, preload: () => { void loadSolanaToolbox() }, category: 'solana-core' },
  { id: 'agentops', name: 'AgentOps', description: 'Simple Metaplex agent control and website handoff', icon: AgentOpsIcon, component: AgentOpsPanel, preload: () => { void loadAgentOps() }, category: 'agents', folded: true },
  { id: 'metaplex-demo', name: 'Metaplex Demo', description: 'Native Core, DAS, launch, and Agent Registry demo', icon: IntegrationsIcon, component: MetaplexDemoPanel, preload: () => { void loadMetaplexDemo() }, category: 'solana-core', folded: true },
  { id: 'zauth', name: 'Zauth', description: 'x402 database and Provider Hub', icon: ZauthIcon, component: ZauthPanel, preload: () => { void loadZauthPanel() }, category: 'partners', folded: true },
  { id: 'block-scanner', name: 'Block Scanner', description: 'Solana explorer powered by Orb', icon: ScannerIcon, component: BlockScanner, preload: () => { void loadBlockScanner() }, category: 'solana-core', folded: true },
  { id: 'replay-engine', name: 'Replay', description: 'Replay any Solana transaction with on-chain context and AI handoff', icon: ReplayIcon, component: ReplayEngine, preload: () => { void loadReplayEngine() }, category: 'solana-core', folded: true },
  { id: 'docs', name: 'Docs', description: 'DAEMON documentation', icon: DocsIcon, component: DocsPanel, preload: () => { void loadDocsPanel() }, category: 'system' },
  { id: 'dashboard', name: 'Dashboard', description: 'Market data and watchlist', icon: DashboardIcon, component: DashboardCanvas, preload: () => { void loadDashboardCanvas() }, category: 'markets', folded: true },
  { id: 'agent-work', name: 'Agent Work', description: 'Wallet-funded agent jobs, receipts, verification, and settlement', icon: AgentWorkIcon, component: AgentWork, preload: () => { void loadAgentWork() }, category: 'agents', folded: true },
  { id: 'meterflow', name: 'Meterflow', description: 'x402 receipts, meters, budgets, and paid agent call readiness', icon: MeterflowIcon, component: MeterflowPanel, preload: () => { void loadMeterflow() }, category: 'agents', folded: true },
  { id: 'agent-economy', name: 'Agent Economy', description: 'Profiles, spend policy, paid resources, receipts, and devnet identity', icon: AgentEconomyIcon, component: AgentEconomyPanel, preload: () => { void loadAgentEconomy() }, category: 'agents' },
  { id: 'sessions', name: 'Sessions', description: 'Agent session history', icon: SessionsIcon, component: SessionHistory, preload: () => { void loadSessionHistory() }, category: 'dev' },
  { id: 'hackathon', name: 'Hackathon', description: 'Colosseum tracker', icon: HackathonIcon, component: HackathonPanel, preload: () => { void loadHackathonPanel() }, category: 'markets', folded: true },
  { id: 'daemon-ai', name: 'Daemon AI', description: 'AI workbench for chat, runs, approvals, patches, and receipts', icon: DaemonAIIcon, component: DaemonAIPanel, preload: () => { void loadDaemonAIPanel() }, category: 'agents' },
  { id: 'pro', name: 'Daemon Pro', description: 'Arena, Pro skills, MCP sync, and priority API', icon: ProIcon, component: ProPanel, preload: () => { void loadProPanel() }, category: 'agents' },
  { id: 'activity', name: 'Activity', description: 'Flight recorder for Solana development', icon: ActivityIcon, component: ActivityTimeline, preload: () => { void loadActivityTimeline() }, category: 'system' },
  { id: 'plugins', name: 'Capability Manager', description: 'Enable or disable capability packs and plugins', icon: PluginsIcon, component: CapabilityManager, preload: () => { void loadCapabilityManager() }, category: 'system' },
  { id: 'recovery', name: 'Recovery', description: 'Crash recovery and snapshots', icon: RecoveryIcon, component: RecoveryPanel, preload: () => { void loadRecoveryPanel() }, category: 'system' },
  { id: 'agent-station', name: 'Agent Station', description: 'Scaffold and run Solana AI agents powered by SAK', icon: AgentStationIcon, component: AgentStationPanel, preload: () => { void loadAgentStation() }, category: 'agents', folded: true },
  { id: 'clawpump', name: 'ClawPump', description: 'Launch and manage hosted ClawPump AI trading agents on Solana', icon: ClawpumpIcon, component: ClawpumpPanel, preload: () => { void loadClawpump() }, category: 'partners', folded: true },
  { id: 'degentools', name: 'DegenTools', description: 'Generate meme coin assets, shill copy, token data, and Bags.fm launches', icon: DegenToolsIcon, component: DegenToolsPanel, preload: () => { void loadDegenTools() }, category: 'partners', folded: true },
  { id: 'signalhouse', name: 'Signalhouse', description: 'Browse Drift copy-trading strategies, ProofOfEdge rankings, and live risk verdicts', icon: SignalhouseIcon, component: SignalhousePanel, preload: () => { void loadSignalhouse() }, category: 'markets' },
  { id: 'flywheel', name: 'Fee Flywheel', description: 'Configure on-chain creator-fee splits that buy back and burn $DAEMON', icon: FlywheelIcon, component: FlywheelPanel, preload: () => { void loadFlywheel() }, category: 'launch', folded: true },
  { id: 'autopilot', name: 'Autopilot', description: 'Standing mandates that trade Solana unattended — arm it and walk away', icon: AutopilotIcon, component: AutopilotPanel, preload: () => { void loadAutopilot() }, category: 'markets' },
  { id: 'ricomaps', name: 'RicoMaps', description: 'Token and wallet forensic graphing', icon: AgentOpsIcon, component: RicoMapsPanel, preload: () => { void loadRicoMaps() }, category: 'markets', folded: true },
]

// Tool ids folded into a pack host panel — hidden from the drawer and sidebar.
export const FOLDED_TOOL_IDS = new Set(
  BUILTIN_TOOLS.filter((tool) => tool.folded).map((tool) => tool.id),
)

const BUILTIN_TOOL_PRELOADERS = new Map(
  BUILTIN_TOOLS
    .filter((tool) => typeof tool.preload === 'function')
    .map((tool) => [tool.id, tool.preload as () => void]),
)

export function preloadToolPanel(toolId: string) {
  BUILTIN_TOOL_PRELOADERS.get(toolId)?.()
}

function getDrawerTools(
  isToolVisible: (toolId: string) => boolean,
  plugins: Array<{ id: string; enabled: number | boolean }>,
): DrawerTool[] {
  const tools = [...BUILTIN_TOOLS]

  // Add enabled plugins
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
      category: 'partners',
    })
  }

  // Drop folded tools (they live inside a pack host panel) and filter by
  // workspace profile visibility.
  return tools.filter((t) => !t.folded && isToolVisible(t.id))
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
  // Track the visibility map so the drawer grid recomputes when a capability
  // pack toggles its tools (isToolVisible alone is a stable ref).
  const toolVisibility = useWorkspaceProfileStore((s) => s.toolVisibility)
  const rawTools = useMemo(() => getDrawerTools(isToolVisible, plugins), [plugins, isToolVisible, toolVisibility])

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
    } else if (e.key === 'ArrowDown') {
      // Move from the search field into the first tool card.
      const first = drawerRef.current?.querySelector<HTMLElement>('.drawer-tool-card')
      if (first) { e.preventDefault(); first.focus() }
    }
  }

  const handleToolClick = (toolId: string) => {
    preloadToolPanel(toolId)
    openWorkspaceTool(toolId)
    setSearch('')
  }

  // Spatial arrow-key navigation across the tool card grid. Cards are buttons
  // in a CSS grid, so rows/columns are derived from layout geometry.
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const active = document.activeElement as HTMLElement | null
    if (!active?.classList.contains('drawer-tool-card')) return

    const cards = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('.drawer-tool-card') ?? [])
    const index = cards.indexOf(active)
    if (index === -1) return
    e.preventDefault()

    if (e.key === 'ArrowRight') { cards[Math.min(index + 1, cards.length - 1)]?.focus(); return }
    if (e.key === 'ArrowLeft') {
      if (index === 0) { searchRef.current?.focus(); return }
      cards[index - 1]?.focus(); return
    }

    // Up/Down: find the card in the adjacent row nearest the current column (by x center).
    const rect = active.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const rowGap = rect.height / 2
    const candidates = cards.filter((card) => {
      const r = card.getBoundingClientRect()
      return e.key === 'ArrowDown' ? r.top > rect.top + rowGap : r.bottom < rect.bottom - rowGap
    })
    if (candidates.length === 0) {
      if (e.key === 'ArrowUp') searchRef.current?.focus()
      return
    }
    const targetRowTop = e.key === 'ArrowDown'
      ? Math.min(...candidates.map((c) => c.getBoundingClientRect().top))
      : Math.max(...candidates.map((c) => c.getBoundingClientRect().top))
    const rowCards = candidates.filter((c) => Math.abs(c.getBoundingClientRect().top - targetRowTop) < 4)
    const nearest = rowCards.reduce((best, c) => {
      const r = c.getBoundingClientRect()
      const dist = Math.abs(r.left + r.width / 2 - cx)
      return dist < best.dist ? { card: c, dist } : best
    }, { card: rowCards[0], dist: Infinity })
    nearest.card?.focus()
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
        <button type="button" className="drawer-close" onClick={closeDrawer} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="drawer-content" onKeyDown={handleGridKeyDown}>
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
  'solana-core': 'Solana Core',
  launch: 'Launch',
  agents: 'Agents',
  markets: 'Markets & Intel',
  partners: 'Partners',
  create: 'Create',
  system: 'System',
}

const CATEGORY_ORDER: DrawerTool['category'][] = ['solana-core', 'agents', 'launch', 'markets', 'partners', 'dev', 'create', 'system']

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
  const color = TOOL_COLORS[tool.id] ?? DAEMON_TOOL_ACCENT_FALLBACK
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

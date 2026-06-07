import { useCallback, useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { useGitProject, useGitStore } from '../../store/git'
import { useNotificationsStore } from '../../store/notifications'
import { useSolanaToolboxStore, type SolanaToolchainStatus } from '../../store/solanaToolbox'
import type { EnvFile, WalletListEntry } from '../../types/daemon'
import { buildSolanaRouteReadiness } from '../../lib/solanaReadiness'
import { INTEGRATION_REGISTRY } from '../IntegrationCommandCenter/registry'
import { resolveIntegrationStatus, summarizeRegistry, type IntegrationContext } from '../IntegrationCommandCenter/status'
import { getProductSurface } from '../../constants/productSurfaces'
import { parsePackageInfo, SENDAI_FIRST_AGENT_ENTRY, type PackageInfo } from '../IntegrationCommandCenter/sendaiSetup'
import { confirm } from '../../store/confirm'
import { Button } from '../../components/Button'
import { Badge, Banner, Card, DataRow, MetricCard, ProgressRing, StatusDot } from '../../components/Panel'
import { classifyActivity, formatTime, groupActivity, type ActivityIssueGroup } from '../ActivityTimeline/activityModel'
import { middleEllipsisPath } from '../../utils/textDisplay'
import type { GitFile } from '../../../electron/shared/types'
import './ProjectReadiness.css'

const EMPTY_PACKAGE_INFO: PackageInfo = { packages: new Set(), scripts: new Set(), packageManagerHint: null }

const DEFAULT_WALLET_INFRASTRUCTURE: WalletInfrastructureSettings = {
  cluster: 'devnet',
  rpcProvider: 'helius',
  quicknodeRpcUrl: '',
  customRpcUrl: '',
  swapProvider: 'jupiter',
  preferredWallet: 'phantom',
  executionMode: 'rpc',
  jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
}

interface ReadinessItem {
  id: string
  label: string
  detail: string
  ready: boolean
  actionLabel?: string
  action?: () => void
}

interface QuickSetupAction {
  id: string
  label: string
  detail: string
  ready: boolean
  cta: string
  disabled?: boolean
  run: () => Promise<void> | void
}

type QueueTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'feature'

interface WorkbenchQueueItem {
  id: string
  label: string
  detail: string
  statusLabel: string
  tone: QueueTone
  actionLabel: string
  disabled?: boolean
  run: () => Promise<void> | void
}

interface SecureKeyEntry {
  key_name: string
  hint: string
}

type ProviderConnections = Partial<Record<'claude' | 'codex', {
  hasApiKey?: boolean
  isAuthenticated?: boolean
  authMode?: string
  cliPath?: string
} | null>>

const WORKBENCH_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'activity', label: 'Activity' },
  { id: 'git', label: 'Git' },
  { id: 'providers', label: 'Providers' },
  { id: 'tools', label: 'Tools' },
] as const

const WORKFLOW_TOOL_GROUPS = [
  { group: 'Build', tools: [{ id: 'starter', label: 'New Project' }, { id: 'solana-toolbox', label: 'Solana Workflow' }, { id: 'env', label: 'Env' }] },
  { group: 'Ship', tools: [{ id: 'git', label: 'Git' }, { id: 'deploy', label: 'Deploy' }, { id: 'activity', label: 'Activity' }] },
  { group: 'Launch / Trade', tools: [{ id: 'wallet', label: 'Wallet' }, { id: 'token-launch', label: 'Token Launch' }, { id: 'dashboard', label: 'Dashboard' }] },
  { group: 'Monitor', tools: [{ id: 'block-scanner', label: 'Block Scanner' }, { id: 'replay-engine', label: 'Replay' }, { id: 'sessions', label: 'Sessions' }] },
  { group: 'Agents / Payments', tools: [{ id: 'daemon-ai', label: 'Daemon AI' }, { id: 'agent-work', label: 'Agent Work' }, { id: 'meterflow', label: 'Meterflow' }] },
  { group: 'Partners', tools: [{ id: 'clawpump', label: 'ClawPump' }, { id: 'degentools', label: 'DegenTools' }, { id: 'signalhouse', label: 'Signalhouse' }] },
  { group: 'Account / Security', tools: [{ id: 'settings', label: 'Settings' }, { id: 'zauth', label: 'Zauth' }, { id: 'flywheel', label: 'Fee Flywheel' }] },
]

const START_SURFACE_INTEGRATION_IDS = [
  'sendai-agent-kit',
  'helius',
  'phantom',
  'jupiter',
  'metaplex',
  'clawpump',
  'degentools',
  'signalhouse',
  'flywheel',
  'ricomaps',
  'zauth',
  'idle-protocol',
  'allowances',
]

function joinProjectPath(projectPath: string, child: string): string {
  return `${projectPath.replace(/[\\/]+$/, '')}/${child}`
}

function hasEnvKey(envFiles: EnvFile[], key: string): boolean {
  return envFiles.some((file) => file.vars.some((entry) => !entry.isComment && entry.key === key && entry.value.trim().length > 0))
}

function getRpcLabel(settings: WalletInfrastructureSettings): string {
  if (settings.rpcProvider === 'helius') return 'Helius RPC'
  if (settings.rpcProvider === 'quicknode') return 'QuickNode RPC'
  if (settings.rpcProvider === 'custom') return 'Custom RPC'
  return 'Public RPC'
}

function isRpcReady(settings: WalletInfrastructureSettings, heliusReady: boolean): boolean {
  if (settings.rpcProvider === 'helius') return heliusReady
  if (settings.rpcProvider === 'quicknode') return settings.quicknodeRpcUrl.trim().length > 0
  if (settings.rpcProvider === 'custom') return settings.customRpcUrl.trim().length > 0
  return true
}

function getWritableRpcUrl(settings: WalletInfrastructureSettings): string | null {
  if (settings.rpcProvider === 'quicknode' && settings.quicknodeRpcUrl.trim()) return settings.quicknodeRpcUrl.trim()
  if (settings.rpcProvider === 'custom' && settings.customRpcUrl.trim()) return settings.customRpcUrl.trim()
  if (settings.rpcProvider === 'public') return settings.cluster === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : settings.cluster === 'localnet'
      ? 'http://127.0.0.1:8899'
      : 'https://api.devnet.solana.com'
  return null
}

function compactPath(path: string | null): string {
  if (!path) return 'No project open'
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/')
}

function formatShortAddress(address?: string | null): string {
  if (!address) return 'No wallet'
  if (address.length <= 14) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function getGitFileDisplay(file: GitFile) {
  if (file.staged) return { label: 'Staged', tone: 'success' as const }
  if (file.deleted) return { label: 'Deleted', tone: 'danger' as const }
  if (file.untracked) return { label: 'Untracked', tone: 'info' as const }
  return { label: 'Modified', tone: 'warning' as const }
}

function splitGitPath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  const sep = normalized.lastIndexOf('/')
  const folder = sep > 0 ? normalized.slice(0, sep) : '.'
  const name = sep > 0 ? normalized.slice(sep + 1) : normalized
  return { folder, name, folderLabel: folder === '.' ? 'root' : middleEllipsisPath(folder) }
}

function groupFilesByFolder(files: GitFile[]) {
  const folders = new Map<string, GitFile[]>()
  for (const file of files) {
    const { folder } = splitGitPath(file.path)
    folders.set(folder, [...(folders.get(folder) ?? []), file])
  }
  return [...folders.entries()].map(([folder, folderFiles]) => ({ folder, files: folderFiles }))
}

function keyHint(keys: SecureKeyEntry[], keyName: string): string | null {
  return keys.find((entry) => entry.key_name === keyName)?.hint ?? null
}

function providerConnected(connections: ProviderConnections | null, provider: 'claude' | 'codex'): boolean {
  const connection = connections?.[provider]
  return Boolean(connection && (connection.isAuthenticated || connection.authMode !== 'none' || connection.hasApiKey))
}

function isGitAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean((window as unknown as { daemon?: { git?: unknown } }).daemon?.git)
}

function formatToolchain(toolchain: SolanaToolchainStatus | null): string {
  if (!toolchain) return 'Toolchain not checked yet'
  const ready = [
    toolchain.solanaCli.installed ? 'Solana CLI' : null,
    toolchain.anchor.installed ? 'Anchor' : null,
    toolchain.testValidator.installed ? 'test-validator' : null,
    toolchain.surfpool.installed ? 'Surfpool' : null,
    toolchain.litesvm.installed ? 'LiteSVM' : null,
  ].filter(Boolean)
  return ready.length ? ready.join(', ') : 'No local Solana toolchain detected'
}

export function ProjectReadiness() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const projects = useUIStore((s) => s.projects)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const setIntegrationCommandSelectionId = useUIStore((s) => s.setIntegrationCommandSelectionId)
  const gitState = useGitProject(activeProjectPath)
  const activity = useNotificationsStore((s) => s.activity)
  const loadActivity = useNotificationsStore((s) => s.loadActivity)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const projectInfo = useSolanaToolboxStore((s) => s.projectInfo)
  const toolchain = useSolanaToolboxStore((s) => s.toolchain)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const toggleMcp = useSolanaToolboxStore((s) => s.toggleMcp)
  const detectProject = useSolanaToolboxStore((s) => s.detectProject)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)

  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([])
  const [packageInfo, setPackageInfo] = useState<PackageInfo>(EMPTY_PACKAGE_INFO)
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [walletSignerReady, setWalletSignerReady] = useState<Record<string, boolean>>({})
  const [walletInfrastructure, setWalletInfrastructure] = useState<WalletInfrastructureSettings>(DEFAULT_WALLET_INFRASTRUCTURE)
  const [secureKeys, setSecureKeys] = useState<Record<string, boolean>>({})
  const [keyEntries, setKeyEntries] = useState<SecureKeyEntry[]>([])
  const [providerConnections, setProviderConnections] = useState<ProviderConnections | null>(null)
  const [hasFirstAgent, setHasFirstAgent] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [gitBusy, setGitBusy] = useState<string | null>(null)
  const [gitError, setGitError] = useState<string | null>(null)

  const loadReadiness = useCallback(async (isCancelled: () => boolean = () => false) => {
      setLoading(true)
      setError(null)

      try {
        const listKeys = (daemon.claude as unknown as { listKeys?: () => Promise<{ ok: boolean; data?: SecureKeyEntry[] }> }).listKeys
        const verifyProviders = (daemon as unknown as { provider?: { verifyAll?: () => Promise<{ ok: boolean; data?: ProviderConnections }> } }).provider?.verifyAll
        const [walletRes, heliusRes, jupiterRes, clawpumpRes, degentoolsRes, meterflowRes, infraRes, keysRes, providersRes] = await Promise.all([
          daemon.wallet.list(),
          daemon.wallet.hasHeliusKey(),
          daemon.wallet.hasJupiterKey(),
          daemon.clawpump.isConfigured(),
          daemon.degentools.isConfigured(),
          daemon.meterflow.status(),
          daemon.settings.getWalletInfrastructureSettings(),
          listKeys ? listKeys() : Promise.resolve({ ok: false, data: [] }),
          verifyProviders ? verifyProviders() : Promise.resolve({ ok: false, data: null }),
        ])

        if (isCancelled()) return

        const nextWallets = walletRes.ok && walletRes.data ? walletRes.data : []
        const nextKeyEntries = keysRes.ok && keysRes.data ? keysRes.data : []
        setWallets(nextWallets)
        setWalletInfrastructure(infraRes.ok && infraRes.data ? infraRes.data : DEFAULT_WALLET_INFRASTRUCTURE)
        setSecureKeys({
          HELIUS_API_KEY: Boolean(heliusRes.ok && heliusRes.data),
          JUPITER_API_KEY: Boolean(jupiterRes.ok && jupiterRes.data),
          CLAWPUMP_API_KEY: Boolean(clawpumpRes.ok && clawpumpRes.data),
          DEGENTOOLS_API_KEY: Boolean(degentoolsRes.ok && degentoolsRes.data),
          METERFLOW_API_KEY: Boolean(meterflowRes.ok && meterflowRes.data?.configured),
        })
        setKeyEntries(nextKeyEntries)
        setProviderConnections(providersRes.ok && providersRes.data ? providersRes.data : null)

        const signerEntries = await Promise.all(nextWallets.map(async (wallet) => {
          const signerRes = await daemon.wallet.hasKeypair(wallet.id)
          return [wallet.id, Boolean(signerRes.ok && signerRes.data)] as const
        }))
        if (isCancelled()) return
        setWalletSignerReady(Object.fromEntries(signerEntries))

        if (activeProjectPath) {
          await Promise.all([
            loadMcps(activeProjectPath),
            detectProject(activeProjectPath),
            loadToolchain(activeProjectPath),
          ])

          const [envRes, packageRes, agentRes] = await Promise.all([
            daemon.env.projectVars(activeProjectPath),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'package.json')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, SENDAI_FIRST_AGENT_ENTRY)),
          ])

          if (isCancelled()) return
          setEnvFiles(envRes.ok && envRes.data ? envRes.data : [])
          setPackageInfo(packageRes.ok && packageRes.data ? parsePackageInfo(packageRes.data.content) : EMPTY_PACKAGE_INFO)
          setHasFirstAgent(Boolean(agentRes.ok))
        } else {
          await loadToolchain(undefined)
          if (isCancelled()) return
          setEnvFiles([])
          setPackageInfo(EMPTY_PACKAGE_INFO)
          setHasFirstAgent(false)
        }
      } catch (loadError) {
        if (!isCancelled()) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load Solana readiness.')
        }
      } finally {
        if (!isCancelled()) {
          setHasLoaded(true)
          setLoading(false)
        }
      }
  }, [activeProjectPath, detectProject, loadMcps, loadToolchain])

  useEffect(() => {
    let cancelled = false
    void loadReadiness(() => cancelled)
    return () => { cancelled = true }
  }, [loadReadiness])

  useEffect(() => {
    void loadActivity().catch(() => {})
  }, [loadActivity])

  useEffect(() => {
    if (!activeProjectPath || !isGitAvailable()) return
    void useGitStore.getState().refreshIfStale(activeProjectPath)
  }, [activeProjectPath])

  const defaultWallet = wallets.find((wallet) => wallet.is_default === 1) ?? wallets[0] ?? null
  const defaultWalletSignerReady = defaultWallet ? walletSignerReady[defaultWallet.id] === true : false
  const defaultWalletAssignedToProject = activeProjectId && defaultWallet
    ? defaultWallet.assigned_project_ids.includes(activeProjectId)
    : true
  const rpcLabel = getRpcLabel(walletInfrastructure)
  const rpcReady = isRpcReady(walletInfrastructure, Boolean(secureKeys.HELIUS_API_KEY))
  const envRpcReady = hasEnvKey(envFiles, 'RPC_URL')
  const solanaMcpReady = mcps.some((entry) => entry.name === 'solana-mcp-server' && entry.enabled)
  const heliusMcpReady = mcps.some((entry) => entry.name === 'helius' && entry.enabled)
  const agentKitReady = packageInfo.packages.has('solana-agent-kit')
  const writableRpcUrl = getWritableRpcUrl(walletInfrastructure)

  const walletRoute = buildSolanaRouteReadiness({
    walletPresent: Boolean(defaultWallet),
    walletName: defaultWallet?.name,
    walletAddress: defaultWallet?.address,
    isMainWallet: Boolean(defaultWallet?.is_default === 1),
    signerReady: defaultWalletSignerReady,
    hasActiveProject: Boolean(activeProjectId),
    projectAssigned: defaultWalletAssignedToProject,
    preferredWallet: walletInfrastructure.preferredWallet,
    executionMode: walletInfrastructure.executionMode,
    rpcLabel,
    rpcReady,
  })

  const context = useMemo<IntegrationContext>(() => ({
    envFiles,
    mcps,
    packages: packageInfo.packages,
    walletReady: Boolean(defaultWallet),
    defaultWallet,
    secureKeys,
    toolchain,
  }), [defaultWallet, envFiles, mcps, packageInfo.packages, secureKeys, toolchain])

  const integrationSummary = useMemo(() => summarizeRegistry(INTEGRATION_REGISTRY, context), [context])
  const starterIntegrations = useMemo(() => (
    START_SURFACE_INTEGRATION_IDS
      .map((id) => {
        const integration = INTEGRATION_REGISTRY.find((entry) => entry.id === id)
        if (!integration) return null
        return { integration, summary: resolveIntegrationStatus(integration, context) }
      })
      .filter((entry): entry is { integration: (typeof INTEGRATION_REGISTRY)[number]; summary: ReturnType<typeof resolveIntegrationStatus> } => Boolean(entry))
  ), [context])

  const openIntegration = (integrationId: string) => {
    setIntegrationCommandSelectionId(integrationId)
    openWorkspaceTool('integrations')
  }

  const runQuickAction = async (id: string, successText: string, action: () => Promise<void>) => {
    setBusyAction(id)
    setActionMessage(null)
    try {
      await action()
      setActionMessage({ type: 'success', text: successText })
      await loadReadiness()
    } catch (setupError) {
      setActionMessage({
        type: 'error',
        text: setupError instanceof Error ? setupError.message : 'Setup action failed.',
      })
    } finally {
      setBusyAction(null)
    }
  }

  const assignDefaultWalletToProject = () => runQuickAction('assign-wallet', 'Linked the default wallet to this project.', async () => {
    if (!activeProjectId || !defaultWallet) throw new Error('Open a project and create a wallet first.')
    const result = await daemon.wallet.assignProject(activeProjectId, defaultWallet.id)
    if (!result.ok) throw new Error(result.error ?? 'Could not assign wallet to project.')
  })

  const createDevWallet = () => runQuickAction('create-wallet', 'Generated a local Solana dev wallet.', async () => {
    const result = await daemon.wallet.generate({ name: 'DAEMON Solana Dev Wallet' })
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Could not generate wallet.')
    await daemon.wallet.setDefault(result.data.id)
    if (activeProjectId) await daemon.wallet.assignProject(activeProjectId, result.data.id)
  })

  const writeRpcUrl = () => {
    if (!writableRpcUrl) {
      openWorkspaceTool(walletInfrastructure.rpcProvider === 'helius' ? 'env' : 'wallet')
      return
    }

    return runQuickAction('write-rpc-url', 'Wrote RPC_URL to project env.', async () => {
      if (!activeProjectPath) throw new Error('Open a project before writing env vars.')
      const filePath = envFiles[0]?.filePath ?? joinProjectPath(activeProjectPath, '.env')
      const result = await daemon.env.updateVar(filePath, 'RPC_URL', writableRpcUrl)
      if (!result.ok) throw new Error(result.error ?? 'Could not write RPC_URL.')
    })
  }

  const quickActions: QuickSetupAction[] = [
    {
      id: 'create-wallet',
      label: 'Create dev wallet',
      detail: defaultWallet ? `${defaultWallet.name} is available.` : 'Generate a local signing wallet so previews and dev actions have a clear signer.',
      ready: Boolean(defaultWallet),
      cta: 'Generate wallet',
      run: createDevWallet,
    },
    {
      id: 'assign-wallet',
      label: 'Link wallet to project',
      detail: defaultWalletAssignedToProject ? 'The active project has a wallet route.' : 'Assign the default wallet to this project so DAEMON never guesses which wallet to use.',
      ready: defaultWalletAssignedToProject,
      cta: 'Assign wallet',
      disabled: !activeProjectId || !defaultWallet,
      run: assignDefaultWalletToProject,
    },
    {
      id: 'enable-solana-mcp',
      label: 'Enable Solana MCP',
      detail: solanaMcpReady ? 'Solana MCP is enabled for agent reads.' : 'Turn on the project MCP that exposes Solana tools to agents.',
      ready: solanaMcpReady,
      cta: 'Enable MCP',
      disabled: !activeProjectPath,
      run: () => runQuickAction('enable-solana-mcp', 'Enabled Solana MCP for this project.', async () => {
        if (!activeProjectPath) throw new Error('Open a project before enabling project MCPs.')
        await toggleMcp(activeProjectPath, 'solana-mcp-server', true)
      }),
    },
    {
      id: 'write-rpc-url',
      label: 'Write RPC_URL',
      detail: envRpcReady
        ? 'RPC_URL is already present in project env.'
        : writableRpcUrl
          ? 'Write the selected RPC endpoint into the project .env file.'
          : 'DAEMON needs the actual RPC URL. Helius keys stay secret, so add the URL from Env or Wallet Infra.',
      ready: envRpcReady,
      cta: writableRpcUrl ? 'Write env' : 'Open setup',
      disabled: !activeProjectPath,
      run: writeRpcUrl,
    },
  ]

  const items: ReadinessItem[] = [
    {
      id: 'project',
      label: 'Project open',
      ready: Boolean(activeProjectPath),
      detail: activeProjectPath ? compactPath(activeProjectPath) : 'Open or scaffold a project so DAEMON can inspect packages, env, and MCPs.',
      actionLabel: 'Open New Project',
      action: () => openWorkspaceTool('starter'),
    },
    {
      id: 'solana-project',
      label: 'Solana project detected',
      ready: Boolean(projectInfo?.isSolanaProject),
      detail: projectInfo?.isSolanaProject
        ? `${projectInfo.framework ?? 'Solana'} project indicators: ${projectInfo.indicators.join(', ') || 'detected by DAEMON'}`
        : activeProjectPath
          ? 'This project is open, but DAEMON has not detected Anchor, Solana, or client indicators yet.'
          : 'Open a project before DAEMON can detect Solana framework details.',
      actionLabel: 'Open Solana Workflow',
      action: () => openWorkspaceTool('solana-toolbox'),
    },
    {
      id: 'wallet',
      label: 'Wallet route',
      ready: Boolean(defaultWallet),
      detail: defaultWallet ? `${defaultWallet.name} is available for Solana actions.` : 'Create or import one wallet before checking balances, quotes, or launch flows.',
      actionLabel: 'Open Wallet',
      action: () => openWorkspaceTool('wallet'),
    },
    {
      id: 'signer',
      label: 'Signer ready',
      ready: defaultWalletSignerReady,
      detail: defaultWalletSignerReady ? 'The default wallet can sign follow-up previews and transactions.' : 'The wallet is watch-only until a signer is generated or imported.',
      actionLabel: 'Add signer',
      action: () => openWorkspaceTool('wallet'),
    },
    {
      id: 'project-wallet',
      label: 'Project wallet assigned',
      ready: defaultWalletAssignedToProject,
      detail: defaultWalletAssignedToProject ? 'The active project already has a wallet route.' : 'Assign the default wallet to this project so Solana flows do not guess.',
      actionLabel: 'Assign wallet',
      action: () => {
        if (activeProjectId && defaultWallet) {
          void assignDefaultWalletToProject()
          return
        }
        openWorkspaceTool('wallet')
      },
    },
    {
      id: 'provider',
      label: 'Provider path',
      ready: rpcReady,
      detail: rpcReady ? `${rpcLabel} is ready for DAEMON execution paths.` : `${rpcLabel} is selected but not fully configured.`,
      actionLabel: walletInfrastructure.rpcProvider === 'helius' ? 'Open Env' : 'Open Wallet Infra',
      action: () => openWorkspaceTool(walletInfrastructure.rpcProvider === 'helius' ? 'env' : 'wallet'),
    },
    {
      id: 'env',
      label: 'RPC env',
      ready: envRpcReady,
      detail: envRpcReady ? 'RPC_URL is present for project scripts and agent checks.' : 'Add RPC_URL so generated scripts and MCP-backed reads have a project-local endpoint.',
      actionLabel: 'Open Env',
      action: () => openWorkspaceTool('env'),
    },
    {
      id: 'mcp',
      label: 'MCP tools',
      ready: solanaMcpReady || heliusMcpReady,
      detail: solanaMcpReady || heliusMcpReady ? 'At least one Solana MCP path is enabled for agents.' : 'Enable Solana or Helius MCP so agents can read chain state through a clear boundary.',
      actionLabel: 'Open MCP setup',
      action: () => openWorkspaceTool('solana-toolbox'),
    },
    {
      id: 'sendai',
      label: 'SendAI first agent',
      ready: agentKitReady && hasFirstAgent,
      detail: agentKitReady
        ? hasFirstAgent ? 'SendAI package and first starter agent are present.' : 'SendAI package is installed. Create the starter agent next.'
        : 'Install Agent Kit and scaffold the starter before using agent actions.',
      actionLabel: 'Open SendAI setup',
      action: () => openIntegration('sendai-agent-kit'),
    },
  ]

  const readyCount = items.filter((item) => item.ready).length
  const readinessPct = Math.round((readyCount / items.length) * 100)
  const nextItem = items.find((item) => !item.ready) ?? {
    id: 'first-action',
    label: 'Run first safe action',
    detail: 'The project route is ready. Pick a read-only wallet read, Jupiter quote, Metaplex Core/DAS check, or token-launch preflight.',
    ready: false,
    actionLabel: 'Open Integrations',
    action: () => openWorkspaceTool('integrations'),
  }
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const stagedFiles = gitState.files.filter((file) => file.staged)
  const unstagedFiles = gitState.files.filter((file) => file.unstaged || file.untracked)
  const gitChangeCount = stagedFiles.length + unstagedFiles.length
  const gitFolders = groupFilesByFolder(unstagedFiles).slice(0, 4)
  const activityGroups = useMemo(() => groupActivity(activity), [activity])
  const issueGroups = useMemo(() => {
    const seen = new Set<string>()
    return activityGroups
      .flatMap((group) => group.issueGroups)
      .filter((issue) => {
        if (seen.has(issue.fingerprint)) return false
        seen.add(issue.fingerprint)
        return true
      })
      .sort((a, b) => b.latestAt - a.latestAt)
      .slice(0, 4)
  }, [activityGroups])
  const latestEvents = activity.slice(0, 4)
  const enabledIntegrationCount = integrationSummary.ready + integrationSummary.partial
  const missingRuntimeCount = toolchain
    ? [toolchain.solanaCli, toolchain.anchor, toolchain.testValidator, toolchain.surfpool].filter((entry) => !entry.installed).length
    : 0
  const providerRows = [
    {
      id: 'helius',
      label: 'Helius',
      detail: secureKeys.HELIUS_API_KEY ? keyHint(keyEntries, 'HELIUS_API_KEY') ?? 'Configured' : 'Missing key',
      ready: Boolean(secureKeys.HELIUS_API_KEY),
      tone: secureKeys.HELIUS_API_KEY ? 'success' as const : 'warning' as const,
      action: () => openWorkspaceTool('env'),
      actionLabel: secureKeys.HELIUS_API_KEY ? 'Update' : 'Add',
    },
    {
      id: 'claude',
      label: 'Claude',
      detail: providerConnected(providerConnections, 'claude') ? providerConnections?.claude?.authMode ?? 'Connected' : keyHint(keyEntries, 'ANTHROPIC_API_KEY') ?? 'Not connected',
      ready: providerConnected(providerConnections, 'claude') || Boolean(keyHint(keyEntries, 'ANTHROPIC_API_KEY')),
      tone: providerConnected(providerConnections, 'claude') || keyHint(keyEntries, 'ANTHROPIC_API_KEY') ? 'success' as const : 'warning' as const,
      action: () => openWorkspaceTool('settings'),
      actionLabel: 'Manage',
    },
    {
      id: 'openai',
      label: 'OpenAI',
      detail: keyHint(keyEntries, 'OPENAI_API_KEY') ?? 'Missing key',
      ready: Boolean(keyHint(keyEntries, 'OPENAI_API_KEY')),
      tone: keyHint(keyEntries, 'OPENAI_API_KEY') ? 'success' as const : 'neutral' as const,
      action: () => openWorkspaceTool('settings'),
      actionLabel: keyHint(keyEntries, 'OPENAI_API_KEY') ? 'Update' : 'Add',
    },
    {
      id: 'gmail',
      label: 'Gmail',
      detail: keyHint(keyEntries, 'GMAIL_API_KEY') ?? keyHint(keyEntries, 'GOOGLE_CLIENT_ID') ?? 'Not configured',
      ready: Boolean(keyHint(keyEntries, 'GMAIL_API_KEY') || keyHint(keyEntries, 'GOOGLE_CLIENT_ID')),
      tone: keyHint(keyEntries, 'GMAIL_API_KEY') || keyHint(keyEntries, 'GOOGLE_CLIENT_ID') ? 'success' as const : 'neutral' as const,
      action: () => openWorkspaceTool('settings'),
      actionLabel: 'Manage',
    },
    {
      id: 'gemini',
      label: 'Gemini',
      detail: keyHint(keyEntries, 'GEMINI_API_KEY') ?? 'Missing key',
      ready: Boolean(keyHint(keyEntries, 'GEMINI_API_KEY')),
      tone: keyHint(keyEntries, 'GEMINI_API_KEY') ? 'success' as const : 'neutral' as const,
      action: () => openWorkspaceTool('settings'),
      actionLabel: keyHint(keyEntries, 'GEMINI_API_KEY') ? 'Update' : 'Add',
    },
  ]
  const canPreviewSafeAction = Boolean(activeProjectPath && defaultWallet && defaultWalletAssignedToProject && rpcReady && envRpcReady)
  const primaryAction = !activeProjectPath
    ? { label: 'Start new Solana project', detail: 'Choose a template first, then DAEMON can check wallet and RPC setup.', tone: 'feature' as const, onClick: () => openWorkspaceTool('starter') }
    : !defaultWallet
      ? { label: 'Create dev wallet', detail: 'Generate a local signer before balances, quotes, or previews.', tone: 'warning' as const, onClick: () => { void createDevWallet() } }
      : !defaultWalletSignerReady
        ? { label: 'Add wallet signer', detail: 'The default wallet is watch-only until a signer is available.', tone: 'danger' as const, onClick: () => openWorkspaceTool('wallet') }
        : !defaultWalletAssignedToProject
          ? { label: 'Use wallet for current project', detail: 'Assign the default wallet so DAEMON does not guess.', tone: 'warning' as const, onClick: () => { void assignDefaultWalletToProject() } }
          : !rpcReady
            ? { label: walletInfrastructure.rpcProvider === 'helius' ? 'Add Helius key' : 'Configure RPC', detail: `${rpcLabel} is selected but not ready for project actions.`, tone: 'warning' as const, onClick: () => openWorkspaceTool(walletInfrastructure.rpcProvider === 'helius' ? 'env' : 'wallet') }
            : !envRpcReady
              ? { label: 'Write RPC_URL', detail: 'Project scripts need the same RPC route DAEMON will use.', tone: 'warning' as const, onClick: () => { void writeRpcUrl() } }
              : issueGroups.length > 0
                ? { label: 'Fix runtime issue', detail: issueGroups[0].title, tone: issueGroups[0].kind === 'error' ? 'danger' as const : 'warning' as const, onClick: () => openWorkspaceTool('activity') }
                : canPreviewSafeAction
                  ? { label: 'Preview first safe action', detail: 'Run a read-only wallet read or quote before any send or launch flow.', tone: 'feature' as const, onClick: () => openIntegration(secureKeys.HELIUS_API_KEY ? 'helius' : 'jupiter') }
                  : stagedFiles.length > 0
                    ? { label: 'Commit staged changes', detail: `${stagedFiles.length} staged file${stagedFiles.length === 1 ? '' : 's'} ready.`, tone: 'info' as const, onClick: () => document.getElementById('workbench-git')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
                    : { label: 'Open first safe action', detail: 'Project, wallet, and RPC basics are ready for a read-only check.', tone: 'feature' as const, onClick: () => openWorkspaceTool('integrations') }

  const scrollToWorkbenchSection = (sectionId: string) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const focusCommitInput = () => {
    scrollToWorkbenchSection('workbench-git')
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('.workbench-commit-input')?.focus()
    }, 220)
  }

  const launchAssetSurface = getProductSurface('degentools')
  const hostedAgentSurface = getProductSurface('clawpump')
  const meterflowSurface = getProductSurface('meterflow')
  const flywheelSurface = getProductSurface('flywheel')
  const flywheelEnvReady = hasEnvKey(envFiles, 'HELIUS_API_KEY') && hasEnvKey(envFiles, 'JUPITER_API_KEY')

  const actionQueueCandidates = [
    !activeProjectPath && {
      id: 'open-project',
      label: 'Open a working project',
      detail: 'Project-aware checks, env writes, Git actions, and MCP setup need an active workspace.',
      statusLabel: 'Setup',
      tone: 'warning',
      actionLabel: 'New Project',
      run: () => openWorkspaceTool('starter'),
    },
    !secureKeys.HELIUS_API_KEY && {
      id: 'connect-helius',
      label: 'Connect indexed RPC',
      detail: 'Helius unlocks reliable DAS reads, launch checks, and richer agent context.',
      statusLabel: 'Data path',
      tone: 'warning',
      actionLabel: 'Add key',
      run: () => openWorkspaceTool('env'),
    },
    !defaultWallet && {
      id: 'create-wallet',
      label: 'Create a dev wallet route',
      detail: 'A default wallet gives previews, quotes, launches, and agents one clear signer context.',
      statusLabel: 'Wallet',
      tone: 'warning',
      actionLabel: 'Generate wallet',
      run: createDevWallet,
    },
    defaultWallet && !defaultWalletSignerReady && {
      id: 'add-signer',
      label: 'Make the wallet usable',
      detail: 'The default wallet is watch-only until a signer is generated or imported.',
      statusLabel: 'Signer',
      tone: 'danger',
      actionLabel: 'Open wallet',
      run: () => openWorkspaceTool('wallet'),
    },
    defaultWallet && activeProjectId && !defaultWalletAssignedToProject && {
      id: 'assign-wallet',
      label: 'Bind wallet to this project',
      detail: 'Project-scoped wallet routing avoids accidental actions from the wrong wallet.',
      statusLabel: 'Route',
      tone: 'warning',
      actionLabel: 'Assign',
      run: assignDefaultWalletToProject,
    },
    issueGroups.length > 0 && {
      id: 'review-issue',
      label: issueGroups[0].kind === 'error' ? 'Clear the latest runtime error' : 'Review the latest warning',
      detail: issueGroups[0].title,
      statusLabel: issueGroups[0].category,
      tone: issueGroups[0].kind === 'error' ? 'danger' : 'warning',
      actionLabel: 'Open activity',
      run: () => openWorkspaceTool('activity'),
    },
    unstagedFiles.length > 0 && {
      id: 'review-worktree',
      label: 'Review unstaged work',
      detail: `${unstagedFiles.length} changed file${unstagedFiles.length === 1 ? '' : 's'} need stage, discard, or a closer look.`,
      statusLabel: 'Git',
      tone: 'info',
      actionLabel: 'Review Git',
      disabled: !isGitAvailable(),
      run: () => scrollToWorkbenchSection('workbench-git'),
    },
    stagedFiles.length > 0 && {
      id: 'commit-staged',
      label: 'Commit staged work',
      detail: `${stagedFiles.length} staged file${stagedFiles.length === 1 ? '' : 's'} are ready for a commit message.`,
      statusLabel: 'Ready',
      tone: 'success',
      actionLabel: 'Write commit',
      disabled: !isGitAvailable(),
      run: focusCommitInput,
    },
    activeProjectPath && enabledIntegrationCount === 0 && {
      id: 'first-integration',
      label: 'Set up the first Solana integration',
      detail: 'Start with a guided integration so agents and scripts inherit the same project context.',
      statusLabel: 'Integration',
      tone: 'feature',
      actionLabel: 'Choose setup',
      run: () => openWorkspaceTool('integrations'),
    },
    canPreviewSafeAction && {
      id: 'first-safe-action',
      label: 'Preview the first safe action',
      detail: 'Use Helius wallet read or a Jupiter quote as the first no-send check.',
      statusLabel: 'Safe check',
      tone: 'feature',
      actionLabel: 'Preview',
      run: () => openIntegration(secureKeys.HELIUS_API_KEY ? 'helius' : 'jupiter'),
    },
    activeProjectPath && launchAssetSurface && !secureKeys.DEGENTOOLS_API_KEY && {
      id: 'connect-launch-assets',
      label: 'Connect the launch asset desk',
      detail: launchAssetSurface.primaryAction.detail,
      statusLabel: 'Launch',
      tone: 'feature',
      actionLabel: launchAssetSurface.primaryAction.label,
      run: () => openIntegration('degentools'),
    },
    activeProjectPath && hostedAgentSurface && !secureKeys.CLAWPUMP_API_KEY && {
      id: 'connect-hosted-agents',
      label: 'Connect hosted agent experiments',
      detail: hostedAgentSurface.primaryAction.detail,
      statusLabel: 'Agent lane',
      tone: 'feature',
      actionLabel: hostedAgentSurface.primaryAction.label,
      run: () => openIntegration('clawpump'),
    },
    activeProjectPath && meterflowSurface && !secureKeys.METERFLOW_API_KEY && {
      id: 'connect-paid-call-receipts',
      label: 'Set up paid-call receipts',
      detail: meterflowSurface.primaryAction.detail,
      statusLabel: 'x402',
      tone: 'info',
      actionLabel: meterflowSurface.primaryAction.label,
      run: () => openWorkspaceTool('meterflow'),
    },
    activeProjectPath && defaultWallet && flywheelSurface && !flywheelEnvReady && {
      id: 'prepare-fee-flywheel',
      label: 'Prepare launch fee flywheel',
      detail: flywheelSurface.primaryAction.detail,
      statusLabel: 'Launch',
      tone: 'info',
      actionLabel: flywheelSurface.primaryAction.label,
      run: () => openIntegration('flywheel'),
    },
    readyCount === items.length && issueGroups.length === 0 && gitChangeCount === 0 && {
      id: 'launch-agent',
      label: 'Launch a project-aware agent',
      detail: 'Core wallet, RPC, MCP, and project checks are aligned for agent work.',
      statusLabel: 'Ready',
      tone: 'feature',
      actionLabel: 'Launch agent',
      run: () => openWorkspaceTool('daemon-ai'),
    },
  ]

  const actionQueue = actionQueueCandidates
    .filter((item): item is WorkbenchQueueItem => Boolean(item))
    .slice(0, 4)

  const refreshGit = async () => {
    if (!activeProjectPath || !isGitAvailable()) return
    await useGitStore.getState().refresh(activeProjectPath)
  }

  const runGitAction = async (id: string, action: () => Promise<void>) => {
    setGitBusy(id)
    setGitError(null)
    try {
      await action()
      await refreshGit()
    } catch (error) {
      setGitError(error instanceof Error ? error.message : 'Git action failed')
    } finally {
      setGitBusy(null)
    }
  }

  const stageFile = (filePath: string) => runGitAction(`stage:${filePath}`, async () => {
    if (!activeProjectPath) return
    const result = await window.daemon.git.stage(activeProjectPath, [filePath])
    if (!result.ok) throw new Error(result.error ?? 'Stage failed')
  })

  const stageAll = () => runGitAction('stage-all', async () => {
    if (!activeProjectPath) return
    const paths = unstagedFiles.map((file) => file.path)
    if (paths.length === 0) return
    const result = await window.daemon.git.stage(activeProjectPath, paths)
    if (!result.ok) throw new Error(result.error ?? 'Stage all failed')
  })

  const unstageFile = (filePath: string) => runGitAction(`unstage:${filePath}`, async () => {
    if (!activeProjectPath) return
    const result = await window.daemon.git.unstage(activeProjectPath, [filePath])
    if (!result.ok) throw new Error(result.error ?? 'Unstage failed')
  })

  const discardFile = async (filePath: string) => {
    if (!activeProjectPath) return
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath
    const ok = await confirm({
      title: `Discard changes to ${fileName}?`,
      body: 'This permanently reverts uncommitted changes and cannot be undone.',
      danger: true,
      confirmLabel: 'Discard',
    })
    if (!ok) return
    await runGitAction(`discard:${filePath}`, async () => {
      const result = await window.daemon.git.discard(activeProjectPath, filePath)
      if (!result.ok) throw new Error(result.error ?? 'Discard failed')
    })
  }

  const commitStaged = () => runGitAction('commit', async () => {
    if (!activeProjectPath || !commitMsg.trim()) return
    const result = await window.daemon.git.commit(activeProjectPath, commitMsg.trim())
    if (!result.ok) throw new Error(result.error ?? 'Commit failed')
    setCommitMsg('')
  })

  if (!hasLoaded && loading) {
    return (
      <div className="project-readiness">
        <section className="project-readiness-hero">
          <div className="project-readiness-hero-copy">
            <span className="project-readiness-kicker">Solana Start</span>
            <h1>Checking Solana project status</h1>
            <p>
              DAEMON is checking the active project, {walletInfrastructure.cluster} RPC path, wallet route, MCPs, and local toolchain before showing next steps.
            </p>
          </div>
        </section>
        <section className="project-readiness-initial-loading" aria-live="polite">
          <div className="project-readiness-loading-row"><span /> Project and package metadata</div>
          <div className="project-readiness-loading-row"><span /> Wallet, signer, and RPC readiness</div>
          <div className="project-readiness-loading-row"><span /> Solana CLI, Anchor, MCP, and runtime checks</div>
        </section>
      </div>
    )
  }

  return (
    <div className="project-readiness">
      <section id="workbench-overview" className="project-readiness-hero">
        <div className="project-readiness-hero-copy">
          <span className="project-readiness-kicker">DAEMON Workbench</span>
          <h1>Solana operator command center</h1>
          <p>
            Inspect wallet readiness, integrations, runtime issues, Git state, and setup from one place.
          </p>
          <div className="workbench-legacy-row">
            <span>Solana Start</span>
            <span>Solana project status</span>
          </div>
        </div>

        <Card className={`workbench-primary-card ${primaryAction.tone}`} padding="md">
          <span className="project-readiness-mini">Primary action</span>
          <strong>{primaryAction.label}</strong>
          <p>{primaryAction.detail}</p>
          <Button variant="primary" size="md" onClick={primaryAction.onClick}>
            {primaryAction.label}
          </Button>
        </Card>
      </section>

      <div className="workbench-context-strip" aria-label="Workbench context">
        <span><strong>Project</strong>{activeProject?.name ?? compactPath(activeProjectPath)}</span>
        <span><strong>Cluster</strong>{walletInfrastructure.cluster}</span>
        <span><strong>Wallet</strong><code>{formatShortAddress(defaultWallet?.address)}</code></span>
        <span><strong>RPC</strong>{rpcReady ? rpcLabel : `${rpcLabel} missing`}</span>
        <span><strong>Signer</strong>{defaultWalletSignerReady ? 'Ready' : 'Not ready'}</span>
      </div>

      {error ? (
        <Banner className="project-readiness-error" tone="danger">
          Could not refresh readiness. Last known checks are still shown. {error}
        </Banner>
      ) : null}
      {actionMessage ? (
        <Banner
          className={`project-readiness-action-message ${actionMessage.type}`}
          tone={actionMessage.type === 'success' ? 'success' : 'danger'}
        >
          {actionMessage.text}
        </Banner>
      ) : null}

      <section className="workbench-summary" aria-label="Operational summary">
        <MetricCard label="Project ready" value={`${readyCount}/${items.length}`} detail="Readiness checks" tone={readinessPct >= 80 ? 'success' : 'warn'} size="compact" />
        <MetricCard label="Wallet" value={defaultWallet ? 'Ready' : 'Missing'} detail={defaultWallet ? formatShortAddress(defaultWallet.address) : 'No route'} tone={defaultWallet ? 'success' : 'warn'} size="compact" />
        <MetricCard label="RPC / data" value={secureKeys.HELIUS_API_KEY ? 'Helius ready' : 'Helius missing'} detail={rpcLabel} tone={secureKeys.HELIUS_API_KEY ? 'success' : 'warn'} size="compact" />
        <MetricCard label="Runtime issues" value={issueGroups.length === 0 ? 'Quiet' : issueGroups.length} detail={missingRuntimeCount > 0 ? `${missingRuntimeCount} tool checks missing` : 'No grouped issues'} tone={issueGroups.length === 0 ? 'default' : 'warn'} size="compact" />
        <MetricCard label="Git changes" value={gitChangeCount} detail={`${stagedFiles.length} staged`} tone={gitChangeCount > 0 ? 'info' : 'default'} size="compact" />
        <MetricCard label="Integrations" value={enabledIntegrationCount} detail={`${integrationSummary.missing} setup needed`} tone={integrationSummary.missing > 0 ? 'warn' : 'success'} size="compact" />
      </section>

      <section className="workbench-action-queue" aria-label="Action queue">
        <div className="workbench-queue-head">
          <div>
            <span className="project-readiness-mini">Action queue</span>
            <h2>Best next moves</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void loadReadiness()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
        <div className="workbench-queue-list">
          {actionQueue.map((item, index) => (
            <article key={item.id} className={`workbench-queue-card ${item.tone}`}>
              <span className="workbench-queue-index">{index + 1}</span>
              <div className="workbench-queue-main">
                <div className="workbench-queue-title-row">
                  <StatusDot tone={item.tone} label={item.statusLabel} />
                  <strong>{item.label}</strong>
                  <Badge tone={item.tone}>{item.statusLabel}</Badge>
                </div>
                <p>{item.detail}</p>
              </div>
              <Button variant={item.tone === 'danger' ? 'destructive' : item.tone === 'feature' ? 'primary' : 'secondary'} size="sm" disabled={item.disabled} onClick={() => void item.run()}>
                {item.actionLabel}
              </Button>
            </article>
          ))}
        </div>
      </section>

      <nav className="workbench-section-nav" aria-label="Workbench sections">
        {WORKBENCH_SECTIONS.map((section) => (
          <a key={section.id} href={`#workbench-${section.id}`}>{section.label}</a>
        ))}
      </nav>

      <section className="project-readiness-next">
        <div className="project-readiness-score">
          <ProgressRing value={readinessPct} label="Solana readiness score" />
          <small>{readyCount}/{items.length} ready</small>
        </div>
        <div>
          <span className="project-readiness-mini">Next best step</span>
          <strong>{nextItem.label}</strong>
          <p>{nextItem.detail}</p>
        </div>
        {nextItem.action && nextItem.actionLabel ? (
          <Button variant="secondary" size="md" onClick={nextItem.action}>
            {nextItem.actionLabel}
          </Button>
        ) : null}
      </section>

      <section className="project-readiness-section project-readiness-quick">
        <div className="project-readiness-section-head">
          <div>
            <span className="project-readiness-mini">Quick setup</span>
            <h2>Blocking checks</h2>
          </div>
          <button type="button" className="project-readiness-secondary" onClick={() => void loadReadiness()}>
            Refresh checks
          </button>
        </div>
        <div className="project-readiness-quick-grid">
          {quickActions.map((action) => (
            <article key={action.id} className={`project-readiness-quick-card${action.ready ? ' ready' : ''}`}>
              <span className={`project-readiness-dot${action.ready ? ' ready' : ''}`} />
              <div>
                <strong>{action.label}</strong>
                <p>{action.detail}</p>
              </div>
              <button
                type="button"
                className="project-readiness-secondary"
                disabled={action.ready || action.disabled || busyAction === action.id}
                onClick={() => void action.run()}
              >
                {busyAction === action.id ? 'Working...' : action.ready ? 'Ready' : action.cta}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="project-readiness-grid" aria-label="Readiness checks">
        {items.map((item) => (
          <article key={item.id} className={`project-readiness-card${item.ready ? ' ready' : ''}`}>
            <span className={`project-readiness-dot${item.ready ? ' ready' : ''}`} />
            <div>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
              {!item.ready && item.action && item.actionLabel ? (
                <button type="button" className="project-readiness-link" onClick={item.action}>
                  {item.actionLabel}
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      <section id="workbench-wallet" className="project-readiness-section workbench-module">
        <div className="project-readiness-section-head">
          <div>
            <span className="project-readiness-mini">Wallet</span>
            <h2>Wallet readiness first</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => openWorkspaceTool('wallet')}>Open wallet</Button>
        </div>
        <div className="workbench-two-column">
          <Card className="workbench-feature-card" padding="md">
            <div className="workbench-card-head">
              <div>
                <span className="project-readiness-mini">Readiness</span>
                <strong>{walletRoute.headline}</strong>
              </div>
              <Badge tone={defaultWallet && defaultWalletSignerReady ? 'success' : 'warning'}>
                {defaultWallet && defaultWalletSignerReady ? 'Ready' : 'Needs setup'}
              </Badge>
            </div>
            <div className="workbench-readiness-list">
              {items.filter((item) => ['wallet', 'signer', 'project-wallet', 'provider'].includes(item.id)).map((item) => {
                const label = item.id === 'provider' ? 'RPC route' : item.label
                return (
                  <DataRow
                    key={item.id}
                    density="compact"
                    leading={<StatusDot tone={item.ready ? 'success' : 'warning'} label={item.ready ? `${label} ready` : `${label} needs setup`} />}
                    title={label}
                    detail={item.detail}
                    actions={!item.ready && item.action && item.actionLabel ? <Button variant="ghost" size="sm" onClick={item.action}>{item.actionLabel}</Button> : null}
                  />
                )
              })}
            </div>
          </Card>
          <Card className="workbench-feature-card" padding="md">
            <div className="workbench-card-head">
              <div>
                <span className="project-readiness-mini">Route</span>
                <strong>{defaultWallet?.name ?? 'No active wallet'}</strong>
              </div>
              <Badge tone={walletInfrastructure.cluster === 'mainnet-beta' ? 'warning' : 'info'}>{walletInfrastructure.cluster}</Badge>
            </div>
            <div className="workbench-fact-grid">
              <div><span>Address</span><code>{formatShortAddress(defaultWallet?.address)}</code></div>
              <div><span>RPC</span><strong>{rpcLabel}</strong></div>
              <div><span>Signer</span><strong>{defaultWalletSignerReady ? 'Ready' : 'Missing'}</strong></div>
              <div><span>Recent activity</span><strong>Secondary</strong></div>
            </div>
          </Card>
        </div>
      </section>

      <section id="workbench-integrations" className="project-readiness-section workbench-module">
        <div className="project-readiness-section-head">
          <div>
            <span className="project-readiness-mini">First safe actions</span>
            <h2>First actions</h2>
          </div>
          <button type="button" className="project-readiness-secondary" onClick={() => openWorkspaceTool('integrations')}>
            Open all integrations
          </button>
        </div>
        <div className="project-readiness-action-grid">
          {starterIntegrations.map(({ integration, summary }) => {
            const surface = integration.toolId ? getProductSurface(integration.toolId) : null
            return (
              <button
                key={integration.id}
                type="button"
                className={`project-readiness-action ${summary.status}`}
                onClick={() => openIntegration(integration.id)}
              >
                <span>{integration.name}</span>
                <strong>{summary.status === 'ready' ? 'Ready' : summary.status === 'partial' ? 'Needs one step' : 'Setup needed'}</strong>
                <small>{surface ? `${surface.name}: ${surface.primaryAction.detail}` : integration.tagline}</small>
              </button>
            )
          })}
        </div>
      </section>

      <section id="workbench-activity" className="project-readiness-section workbench-module">
        <div className="project-readiness-section-head">
          <div>
            <span className="project-readiness-mini">Activity</span>
            <h2>Important issues</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => openWorkspaceTool('activity')}>Open activity</Button>
        </div>
        <div className="workbench-activity-grid">
          <Card padding="md" className="workbench-feature-card">
            {issueGroups.length === 0 ? (
              <div className="workbench-empty-state">
                <Badge tone="neutral">Activity</Badge>
                <strong>No grouped issues</strong>
                <p>Runtime and toolchain activity will surface here when it needs review.</p>
              </div>
            ) : (
              <div className="workbench-row-stack">
                {issueGroups.map((issue) => (
                  <IssueRow key={issue.id} issue={issue} />
                ))}
              </div>
            )}
          </Card>
          <Card padding="md" className="workbench-feature-card quiet">
            <div className="workbench-card-head">
              <div>
                <span className="project-readiness-mini">Latest</span>
                <strong>Recent events</strong>
              </div>
            </div>
            <div className="workbench-row-stack">
              {latestEvents.length === 0 ? (
                <div className="workbench-muted-line">No activity recorded yet.</div>
              ) : latestEvents.map((entry) => (
                <DataRow
                  key={entry.id}
                  density="compact"
                  leading={<StatusDot tone={entry.kind === 'success' ? 'success' : entry.kind === 'error' ? 'danger' : entry.kind === 'warning' ? 'warning' : 'info'} label={entry.kind} />}
                  title={entry.context ?? classifyActivity(entry)}
                  meta={<time>{formatTime(entry.createdAt)}</time>}
                  detail={entry.message}
                />
              ))}
            </div>
          </Card>
        </div>
      </section>

      <section id="workbench-git" className="project-readiness-section workbench-module">
        <div className="project-readiness-section-head">
          <div>
            <span className="project-readiness-mini">Git</span>
            <h2>Compact source control</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => openWorkspaceTool('git')}>Open Git</Button>
        </div>
        <div className="workbench-git-metrics">
          <MetricCard label="Branch" value={gitState.branch ?? '—'} size="compact" />
          <MetricCard label="Working tree" value={`${gitChangeCount} changes`} size="compact" tone={gitChangeCount > 0 ? 'info' : 'default'} />
          <MetricCard label="Ready to commit" value={`${stagedFiles.length} staged`} size="compact" tone={stagedFiles.length > 0 ? 'success' : 'default'} />
          <MetricCard label="Deploy link" value="No linked deploy" size="compact" />
        </div>
        {gitError ? <Banner tone="danger" className="project-readiness-error">{gitError}</Banner> : null}
        <Card padding="md" className="workbench-feature-card">
          <div className="workbench-commit-row">
            <input
              className="workbench-commit-input"
              placeholder="Commit message..."
              value={commitMsg}
              onChange={(event) => setCommitMsg(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void commitStaged()}
            />
            <Button variant="secondary" size="md" onClick={() => void stageAll()} disabled={unstagedFiles.length === 0 || gitBusy === 'stage-all' || !isGitAvailable()}>
              Stage all
            </Button>
            <Button variant="primary" size="md" onClick={() => void commitStaged()} disabled={stagedFiles.length === 0 || !commitMsg.trim() || gitBusy === 'commit' || !isGitAvailable()}>
              {gitBusy === 'commit' ? 'Committing...' : 'Commit'}
            </Button>
          </div>
          {gitChangeCount === 0 ? (
            <div className="workbench-empty-state compact">
              <Badge tone="neutral">Git</Badge>
              <strong>Working tree clean</strong>
            </div>
          ) : (
            <div className="workbench-row-stack">
              {stagedFiles.slice(0, 6).map((file) => (
                <GitChangeRow key={file.path} file={file} onStage={stageFile} onUnstage={unstageFile} onDiscard={discardFile} busy={gitBusy} />
              ))}
              {gitFolders.map(({ folder, files: folderFiles }) => (
                <div key={folder} className="workbench-folder-group">
                  <div className="workbench-folder-header">
                    <span title={folder}>{folder === '.' ? 'root' : `${middleEllipsisPath(folder)}/`}</span>
                    <Badge tone="neutral">{folderFiles.length} {folderFiles.length === 1 ? 'file' : 'files'}</Badge>
                  </div>
                  {folderFiles.slice(0, 6).map((file) => (
                    <GitChangeRow key={file.path} file={file} onStage={stageFile} onUnstage={unstageFile} onDiscard={discardFile} busy={gitBusy} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section id="workbench-providers" className="project-readiness-section workbench-module">
        <div className="project-readiness-section-head">
          <div>
            <span className="project-readiness-mini">Providers</span>
            <h2>API keys and provider state</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => openWorkspaceTool('settings')}>Open settings</Button>
        </div>
        <div className="workbench-provider-grid">
          {providerRows.map((provider) => (
            <DataRow
              key={provider.id}
              density="spacious"
              leading={<StatusDot tone={provider.ready ? 'success' : provider.tone === 'warning' ? 'warning' : 'neutral'} label={`${provider.label}: ${provider.ready ? 'configured' : 'missing'}`} />}
              title={provider.label}
              meta={<Badge tone={provider.ready ? 'success' : provider.tone === 'warning' ? 'warning' : 'neutral'}>{provider.ready ? 'Configured' : provider.tone === 'warning' ? 'Missing key' : 'Not configured'}</Badge>}
              detail={<span className="workbench-masked-value">{provider.detail}</span>}
              actions={<Button variant="ghost" size="sm" onClick={provider.action}>{provider.actionLabel}</Button>}
            />
          ))}
        </div>
      </section>

      <section id="workbench-tools" className="project-readiness-section workbench-module">
        <div className="project-readiness-section-head">
          <div>
            <span className="project-readiness-mini">Tools</span>
            <h2>Workflow groups</h2>
          </div>
        </div>
        <div className="workbench-tool-grid">
          {WORKFLOW_TOOL_GROUPS.map((group) => (
            <Card key={group.group} padding="md" className="workbench-tool-group">
              <span className="project-readiness-mini">{group.group}</span>
              <div className="workbench-tool-list">
                {group.tools.map((tool) => (
                  <button key={tool.id} type="button" onClick={() => openWorkspaceTool(tool.id)}>
                    {tool.label}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="project-readiness-strip">
        <div>
          <span className="project-readiness-mini">Runtime</span>
          <strong>{formatToolchain(toolchain)}</strong>
        </div>
        <div>
          <span className="project-readiness-mini">Integrations</span>
          <strong>{integrationSummary.ready} ready · {integrationSummary.partial} partial · {integrationSummary.missing} missing</strong>
        </div>
        <div>
          <span className="project-readiness-mini">Wallet route</span>
          <strong>{walletRoute.headline}</strong>
        </div>
      </section>

      {loading ? <Banner className="project-readiness-loading" tone="info">Checking project, wallet, RPC, MCP, and integration setup...</Banner> : null}
    </div>
  )
}

export default ProjectReadiness

function IssueRow({ issue }: { issue: ActivityIssueGroup }) {
  const tone = issue.kind === 'error' ? 'danger' : 'warning'
  const seenLabel = issue.entries.length === 1
    ? `1 seen · ${formatTime(issue.latestAt)}`
    : `${issue.entries.length} seen · latest ${formatTime(issue.latestAt)}`

  return (
    <DataRow
      density="spacious"
      leading={<StatusDot tone={tone} label={`${issue.kind}: ${issue.title}`} />}
      title={issue.title}
      meta={(
        <>
          <Badge tone={tone}>{issue.category}</Badge>
          <time>{seenLabel}</time>
        </>
      )}
      detail={issue.context ?? 'Runtime'}
    />
  )
}

function GitChangeRow({
  file,
  onStage,
  onUnstage,
  onDiscard,
  busy,
}: {
  file: GitFile
  onStage: (filePath: string) => Promise<void>
  onUnstage: (filePath: string) => Promise<void>
  onDiscard: (filePath: string) => Promise<void>
  busy: string | null
}) {
  const display = getGitFileDisplay(file)
  const path = splitGitPath(file.path)
  const isBusy = busy?.endsWith(file.path) ?? false

  return (
    <DataRow
      className="workbench-git-file-row"
      density="compact"
      leading={<Badge tone={display.tone}>{display.label}</Badge>}
      title={<span className="workbench-git-file-name" title={file.path}>{path.name}</span>}
      meta={<span>{file.staged ? 'Ready to commit' : 'Needs review'}</span>}
      detail={<span className="workbench-git-folder" title={path.folder}>{path.folderLabel}</span>}
      actions={file.staged ? (
        <Button variant="ghost" size="sm" onClick={() => void onUnstage(file.path)} disabled={isBusy || !isGitAvailable()}>
          Unstage
        </Button>
      ) : (
        <>
          <Button variant="destructive" size="sm" onClick={() => void onDiscard(file.path)} disabled={isBusy || !isGitAvailable()}>
            Discard
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void onStage(file.path)} disabled={isBusy || !isGitAvailable()}>
            Stage
          </Button>
        </>
      )}
    />
  )
}

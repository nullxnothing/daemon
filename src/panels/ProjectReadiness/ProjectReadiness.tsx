import { useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore, type SolanaToolchainStatus } from '../../store/solanaToolbox'
import type { EnvFile, WalletListEntry } from '../../types/daemon'
import { buildSolanaRouteReadiness } from '../../lib/solanaReadiness'
import { INTEGRATION_REGISTRY } from '../IntegrationCommandCenter/registry'
import { resolveIntegrationStatus, summarizeRegistry, type IntegrationContext } from '../IntegrationCommandCenter/status'
import { parsePackageInfo, SENDAI_FIRST_AGENT_ENTRY, type PackageInfo } from '../IntegrationCommandCenter/sendaiSetup'
import './ProjectReadiness.css'

const EMPTY_PACKAGE_INFO: PackageInfo = { packages: new Set(), scripts: new Set(), packageManagerHint: null }

const DEFAULT_WALLET_INFRASTRUCTURE: WalletInfrastructureSettings = {
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

function compactPath(path: string | null): string {
  if (!path) return 'No project open'
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/')
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
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const setIntegrationCommandSelectionId = useUIStore((s) => s.setIntegrationCommandSelectionId)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const projectInfo = useSolanaToolboxStore((s) => s.projectInfo)
  const toolchain = useSolanaToolboxStore((s) => s.toolchain)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const detectProject = useSolanaToolboxStore((s) => s.detectProject)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([])
  const [packageInfo, setPackageInfo] = useState<PackageInfo>(EMPTY_PACKAGE_INFO)
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [walletSignerReady, setWalletSignerReady] = useState<Record<string, boolean>>({})
  const [walletInfrastructure, setWalletInfrastructure] = useState<WalletInfrastructureSettings>(DEFAULT_WALLET_INFRASTRUCTURE)
  const [secureKeys, setSecureKeys] = useState<Record<string, boolean>>({})
  const [hasFirstAgent, setHasFirstAgent] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadReadiness() {
      setLoading(true)
      setError(null)

      try {
        const [walletRes, heliusRes, jupiterRes, infraRes] = await Promise.all([
          daemon.wallet.list(),
          daemon.wallet.hasHeliusKey(),
          daemon.wallet.hasJupiterKey(),
          daemon.settings.getWalletInfrastructureSettings(),
        ])

        if (cancelled) return

        const nextWallets = walletRes.ok && walletRes.data ? walletRes.data : []
        setWallets(nextWallets)
        setWalletInfrastructure(infraRes.ok && infraRes.data ? infraRes.data : DEFAULT_WALLET_INFRASTRUCTURE)
        setSecureKeys({
          HELIUS_API_KEY: Boolean(heliusRes.ok && heliusRes.data),
          JUPITER_API_KEY: Boolean(jupiterRes.ok && jupiterRes.data),
        })

        const signerEntries = await Promise.all(nextWallets.map(async (wallet) => {
          const signerRes = await daemon.wallet.hasKeypair(wallet.id)
          return [wallet.id, Boolean(signerRes.ok && signerRes.data)] as const
        }))
        if (cancelled) return
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

          if (cancelled) return
          setEnvFiles(envRes.ok && envRes.data ? envRes.data : [])
          setPackageInfo(packageRes.ok && packageRes.data ? parsePackageInfo(packageRes.data.content) : EMPTY_PACKAGE_INFO)
          setHasFirstAgent(Boolean(agentRes.ok))
        } else {
          await loadToolchain(undefined)
          if (cancelled) return
          setEnvFiles([])
          setPackageInfo(EMPTY_PACKAGE_INFO)
          setHasFirstAgent(false)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load Solana readiness.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadReadiness()
    return () => { cancelled = true }
  }, [activeProjectPath, detectProject, loadMcps, loadToolchain])

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
    ['sendai-agent-kit', 'helius', 'phantom', 'jupiter', 'metaplex', 'light-protocol']
      .map((id) => {
        const integration = INTEGRATION_REGISTRY.find((entry) => entry.id === id)!
        return { integration, summary: resolveIntegrationStatus(integration, context) }
      })
  ), [context])

  const openIntegration = (integrationId: string) => {
    setIntegrationCommandSelectionId(integrationId)
    openWorkspaceTool('integrations')
  }

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
      actionLabel: 'Open Solana Toolbox',
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
      action: () => openWorkspaceTool('wallet'),
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
    detail: 'The project route is ready. Pick a read-only wallet read, Jupiter quote, metadata draft, or token-launch preflight.',
    ready: false,
    actionLabel: 'Open Integrations',
    action: () => openWorkspaceTool('integrations'),
  }

  return (
    <div className="project-readiness">
      <section className="project-readiness-hero">
        <div className="project-readiness-hero-copy">
          <span className="project-readiness-kicker">Project Readiness</span>
          <h1>Start Solana development from one checklist</h1>
          <p>
            DAEMON checks the active project, wallet route, RPC path, MCPs, and first-action integrations so new Solana developers know exactly what to do next.
          </p>
        </div>
        <div className="project-readiness-score" aria-label="Solana readiness score">
          <span>{readinessPct}%</span>
          <small>{readyCount}/{items.length} ready</small>
        </div>
      </section>

      {error ? <div className="project-readiness-error">{error}</div> : null}

      <section className="project-readiness-next">
        <div>
          <span className="project-readiness-mini">Next best step</span>
          <strong>{nextItem.label}</strong>
          <p>{nextItem.detail}</p>
        </div>
        {nextItem.action && nextItem.actionLabel ? (
          <button type="button" className="project-readiness-primary" onClick={nextItem.action}>
            {nextItem.actionLabel}
          </button>
        ) : null}
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

      <section className="project-readiness-section">
        <div className="project-readiness-section-head">
          <div>
            <span className="project-readiness-mini">First safe actions</span>
            <h2>Pick the workflow that proves the project works</h2>
          </div>
          <button type="button" className="project-readiness-secondary" onClick={() => openWorkspaceTool('integrations')}>
            Open all integrations
          </button>
        </div>
        <div className="project-readiness-action-grid">
          {starterIntegrations.map(({ integration, summary }) => (
            <button
              key={integration.id}
              type="button"
              className={`project-readiness-action ${summary.status}`}
              onClick={() => openIntegration(integration.id)}
            >
              <span>{integration.name}</span>
              <strong>{summary.status === 'ready' ? 'Ready' : summary.status === 'partial' ? 'Needs one step' : 'Setup needed'}</strong>
              <small>{integration.tagline}</small>
            </button>
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

      <section className="project-readiness-shortcuts" aria-label="Project readiness shortcuts">
        <button type="button" onClick={() => openWorkspaceTool('starter')}>New Project</button>
        <button type="button" onClick={() => openWorkspaceTool('wallet')}>Wallet</button>
        <button type="button" onClick={() => openWorkspaceTool('env')}>Env</button>
        <button type="button" onClick={() => openWorkspaceTool('solana-toolbox')}>Solana Toolbox</button>
        <button type="button" onClick={() => openWorkspaceTool('token-launch')}>Token Launch</button>
      </section>

      {loading ? <div className="project-readiness-loading">Refreshing readiness...</div> : null}
    </div>
  )
}

export default ProjectReadiness

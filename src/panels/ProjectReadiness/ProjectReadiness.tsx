import { useCallback, useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore, type SolanaToolchainStatus } from '../../store/solanaToolbox'
import type { EnvFile, WalletListEntry } from '../../types/daemon'
import { buildSolanaRouteReadiness } from '../../lib/solanaReadiness'
import { INTEGRATION_REGISTRY } from '../IntegrationCommandCenter/registry'
import { resolveIntegrationStatus, summarizeRegistry, type IntegrationContext } from '../IntegrationCommandCenter/status'
import { parsePackageInfo, SENDAI_FIRST_AGENT_ENTRY, type PackageInfo } from '../IntegrationCommandCenter/sendaiSetup'
import { Banner, ProgressRing } from '../../components/Panel'
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

interface QuickSetupAction {
  id: string
  label: string
  detail: string
  ready: boolean
  cta: string
  disabled?: boolean
  run: () => Promise<void> | void
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

function getWritableRpcUrl(settings: WalletInfrastructureSettings): string | null {
  if (settings.rpcProvider === 'quicknode' && settings.quicknodeRpcUrl.trim()) return settings.quicknodeRpcUrl.trim()
  if (settings.rpcProvider === 'custom' && settings.customRpcUrl.trim()) return settings.customRpcUrl.trim()
  if (settings.rpcProvider === 'public') return 'https://api.mainnet-beta.solana.com'
  return null
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
  const toggleMcp = useSolanaToolboxStore((s) => s.toggleMcp)
  const detectProject = useSolanaToolboxStore((s) => s.detectProject)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([])
  const [packageInfo, setPackageInfo] = useState<PackageInfo>(EMPTY_PACKAGE_INFO)
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [walletSignerReady, setWalletSignerReady] = useState<Record<string, boolean>>({})
  const [walletInfrastructure, setWalletInfrastructure] = useState<WalletInfrastructureSettings>(DEFAULT_WALLET_INFRASTRUCTURE)
  const [secureKeys, setSecureKeys] = useState<Record<string, boolean>>({})
  const [hasFirstAgent, setHasFirstAgent] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['quick-setup', 'blocking']))

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const loadReadiness = useCallback(async (isCancelled: () => boolean = () => false) => {
      setLoading(true)
      setError(null)

      try {
        const [walletRes, heliusRes, jupiterRes, infraRes] = await Promise.all([
          daemon.wallet.list(),
          daemon.wallet.hasHeliusKey(),
          daemon.wallet.hasJupiterKey(),
          daemon.settings.getWalletInfrastructureSettings(),
        ])

        if (isCancelled()) return

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
        if (!isCancelled()) setLoading(false)
      }
  }, [activeProjectPath, detectProject, loadMcps, loadToolchain])

  useEffect(() => {
    let cancelled = false
    void loadReadiness(() => cancelled)
    return () => { cancelled = true }
  }, [loadReadiness])

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

  const quickActions: QuickSetupAction[] = [
    {
      id: 'create-wallet',
      label: 'Create dev wallet',
      detail: defaultWallet ? `${defaultWallet.name} is available.` : 'Generate a local signing wallet so previews and dev actions have a clear signer.',
      ready: Boolean(defaultWallet),
      cta: 'Generate wallet',
      run: () => runQuickAction('create-wallet', 'Generated a local Solana dev wallet.', async () => {
        const result = await daemon.wallet.generate({ name: 'DAEMON Solana Dev Wallet' })
        if (!result.ok || !result.data) throw new Error(result.error ?? 'Could not generate wallet.')
        await daemon.wallet.setDefault(result.data.id)
        if (activeProjectId) await daemon.wallet.assignProject(activeProjectId, result.data.id)
      }),
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
      run: () => {
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
      },
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
          <h1>Solana project status</h1>
          <p>
            Active project, wallet route, RPC path, MCPs, and first-action integrations.
          </p>
        </div>
        <div className="project-readiness-score">
          <ProgressRing value={readinessPct} label="Solana readiness score" />
          <small>{readyCount}/{items.length} ready</small>
        </div>
      </section>

      {error ? <Banner className="project-readiness-error" tone="danger">{error}</Banner> : null}
      {actionMessage ? (
        <Banner
          className={`project-readiness-action-message ${actionMessage.type}`}
          tone={actionMessage.type === 'success' ? 'success' : 'danger'}
        >
          {actionMessage.text}
        </Banner>
      ) : null}

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

      <section className="project-readiness-section project-readiness-quick">
        <button
          type="button"
          className="project-readiness-section-head"
          onClick={() => toggleSection('quick-setup')}
        >
          <div>
            <span className="project-readiness-mini">Quick setup</span>
            <h2>{expandedSections.has('quick-setup') ? '▼' : '▶'} Blocking checks</h2>
          </div>
          <button
            type="button"
            className="project-readiness-secondary"
            onClick={(e) => { e.stopPropagation(); void loadReadiness(); }}
          >
            Refresh checks
          </button>
        </button>
        {expandedSections.has('quick-setup') && (
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
        )}
      </section>

      <section className="project-readiness-section" aria-label="Readiness checks">
        <button
          type="button"
          className="project-readiness-section-head"
          onClick={() => toggleSection('blocking')}
        >
          <div>
            <span className="project-readiness-mini">System readiness</span>
            <h2>{expandedSections.has('blocking') ? '▼' : '▶'} All checks ({readyCount}/{items.length})</h2>
          </div>
        </button>
        {expandedSections.has('blocking') && (
        <div className="project-readiness-grid">
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
        </div>
        )}
      </section>

      <section className="project-readiness-section">
        <button
          type="button"
          className="project-readiness-section-head"
          onClick={() => toggleSection('integrations')}
        >
          <div>
            <span className="project-readiness-mini">First safe actions</span>
            <h2>{expandedSections.has('integrations') ? '▼' : '▶'} Starter integrations</h2>
          </div>
          <button
            type="button"
            className="project-readiness-secondary"
            onClick={(e) => { e.stopPropagation(); openWorkspaceTool('integrations'); }}
          >
            Open all integrations
          </button>
        </button>
        {expandedSections.has('integrations') && (
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
        )}
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

      {loading ? <Banner className="project-readiness-loading" tone="info">Refreshing readiness...</Banner> : null}
    </div>
  )
}

export default ProjectReadiness

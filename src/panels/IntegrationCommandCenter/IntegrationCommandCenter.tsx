import { useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import type { EnvFile, WalletListEntry } from '../../types/daemon'
import { INTEGRATION_CATEGORIES, INTEGRATION_REGISTRY, type IntegrationCategory, type IntegrationDefinition } from './registry'
import { runIntegrationAction, type IntegrationActionResult } from './actionRunner'
import { resolveIntegrationStatus, summarizeRegistry, type IntegrationContext, type IntegrationStatusSummary } from './status'
import './IntegrationCommandCenter.css'

function joinProjectPath(projectPath: string, child: string): string {
  return `${projectPath.replace(/[\\/]+$/, '')}/${child}`
}

function collectPackages(packageJson: string): Set<string> {
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    return new Set([
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
      ...Object.keys(parsed.optionalDependencies ?? {}),
    ])
  } catch {
    return new Set()
  }
}

function statusLabel(summary: IntegrationStatusSummary): string {
  if (summary.status === 'ready') return 'Ready'
  if (summary.status === 'partial') return 'Partial'
  return 'Setup needed'
}

function RiskPill({ risk }: { risk: string }) {
  return <span className={`icc-risk icc-risk--${risk}`}>{risk.replace('-', ' ')}</span>
}

function RequirementList({ summary }: { summary: IntegrationStatusSummary }) {
  return (
    <div className="icc-requirements">
      {summary.requirements.map((requirement) => (
        <div key={`${requirement.type}:${requirement.key}`} className={`icc-requirement ${requirement.ready ? 'ready' : ''}`}>
          <span className={`icc-requirement-dot ${requirement.ready ? 'ready' : ''}`} />
          <div>
            <span className="icc-requirement-label">
              {requirement.label}
              {requirement.optional ? <span className="icc-optional"> optional</span> : null}
            </span>
            <span className="icc-requirement-detail">{requirement.detail}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function IntegrationCard({
  integration,
  selected,
  summary,
  onSelect,
}: {
  integration: IntegrationDefinition
  selected: boolean
  summary: IntegrationStatusSummary
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`icc-card ${selected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <span className={`icc-status-dot ${summary.status}`} />
      <div className="icc-card-main">
        <div className="icc-card-top">
          <span className="icc-card-name">{integration.name}</span>
          <span className={`icc-status-badge ${summary.status}`}>{statusLabel(summary)}</span>
        </div>
        <span className="icc-card-tagline">{integration.tagline}</span>
        <span className="icc-card-desc">{integration.description}</span>
      </div>
    </button>
  )
}

export function IntegrationCommandCenter() {
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const toolchain = useSolanaToolboxStore((s) => s.toolchain)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)

  const [category, setCategory] = useState<IntegrationCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(INTEGRATION_REGISTRY[0]?.id ?? '')
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([])
  const [packages, setPackages] = useState<Set<string>>(new Set())
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [secureKeys, setSecureKeys] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [actionResult, setActionResult] = useState<IntegrationActionResult | null>(null)
  const [runningActionId, setRunningActionId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadContext() {
      setLoading(true)
      setActionResult(null)

      try {
        const [walletRes, heliusRes, jupiterRes] = await Promise.all([
          daemon.wallet.list(),
          daemon.wallet.hasHeliusKey(),
          daemon.wallet.hasJupiterKey(),
        ])

        if (cancelled) return

        setWallets(walletRes.ok && walletRes.data ? walletRes.data : [])
        setSecureKeys({
          HELIUS_API_KEY: Boolean(heliusRes.ok && heliusRes.data),
          JUPITER_API_KEY: Boolean(jupiterRes.ok && jupiterRes.data),
        })

        if (activeProjectPath) {
          await Promise.all([
            loadMcps(activeProjectPath),
            loadToolchain(activeProjectPath),
          ])

          const [envRes, packageRes] = await Promise.all([
            daemon.env.projectVars(activeProjectPath),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'package.json')),
          ])

          if (cancelled) return

          setEnvFiles(envRes.ok && envRes.data ? envRes.data : [])
          setPackages(packageRes.ok && packageRes.data ? collectPackages(packageRes.data.content) : new Set())
        } else {
          setEnvFiles([])
          setPackages(new Set())
          await loadToolchain(undefined)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadContext()
    return () => {
      cancelled = true
    }
  }, [activeProjectPath, activeProjectId, loadMcps, loadToolchain])

  const defaultWallet = useMemo(
    () => wallets.find((wallet) => wallet.is_default === 1) ?? wallets[0] ?? null,
    [wallets],
  )

  const context: IntegrationContext = useMemo(() => ({
    envFiles,
    mcps,
    packages,
    walletReady: Boolean(defaultWallet),
    defaultWallet,
    secureKeys,
    toolchain,
  }), [envFiles, mcps, packages, defaultWallet, secureKeys, toolchain])

  const registrySummary = useMemo(() => summarizeRegistry(INTEGRATION_REGISTRY, context), [context])

  const visibleIntegrations = useMemo(() => {
    const query = search.trim().toLowerCase()
    return INTEGRATION_REGISTRY.filter((integration) => {
      const matchesCategory = category === 'all' || integration.category === category
      const matchesSearch = !query || [
        integration.name,
        integration.tagline,
        integration.description,
        integration.category,
        ...integration.recommendedFor,
      ].some((value) => value.toLowerCase().includes(query))
      return matchesCategory && matchesSearch
    })
  }, [category, search])

  const selectedIntegration = visibleIntegrations.find((integration) => integration.id === selectedId) ?? visibleIntegrations[0] ?? INTEGRATION_REGISTRY[0]
  const selectedSummary = resolveIntegrationStatus(selectedIntegration, context)

  async function handleRunAction(actionId: string) {
    const action = selectedIntegration.actions.find((candidate) => candidate.id === actionId)
    if (!action) return

    if (action.kind === 'setup') {
      if (action.id === 'open-env') openWorkspaceTool('env')
      else if (action.id === 'open-wallet') openWorkspaceTool('wallet')
      else if (action.id === 'open-token-launch') openWorkspaceTool('token-launch')
      else openWorkspaceTool('solana-toolbox')
      return
    }

    setRunningActionId(actionId)
    setActionResult(null)
    try {
      const result = await runIntegrationAction(actionId, context)
      setActionResult(result)
    } finally {
      setRunningActionId(null)
    }
  }

  function openDocs() {
    void daemon.shell.openExternal(selectedIntegration.docsUrl)
  }

  return (
    <div className="icc-shell">
      <header className="drawer-shared-header icc-header">
        <div className="drawer-shared-kicker">Integration Command Center</div>
        <div className="drawer-shared-title">Make Solana integrations obvious before anything runs</div>
        <p className="drawer-shared-subtitle">
          Review setup, safe checks, and next actions for the protocols DAEMON should help with first.
        </p>
      </header>

      <section className="icc-metrics" aria-label="Integration readiness summary">
        <div className="icc-metric"><span>{registrySummary.ready}</span><small>ready</small></div>
        <div className="icc-metric"><span>{registrySummary.partial}</span><small>partial</small></div>
        <div className="icc-metric"><span>{registrySummary.missing}</span><small>need setup</small></div>
        <div className="icc-metric"><span>{registrySummary.safeActions}</span><small>safe checks</small></div>
      </section>

      <div className="icc-toolbar">
        <input
          className="icc-search"
          value={search}
          placeholder="Search integrations, actions, protocols..."
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="icc-filter-row" role="tablist" aria-label="Integration categories">
          {INTEGRATION_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`icc-filter ${category === item.id ? 'active' : ''}`}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <main className="icc-layout">
        <section className="icc-list" aria-label="Integrations">
          {visibleIntegrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              selected={integration.id === selectedIntegration.id}
              summary={resolveIntegrationStatus(integration, context)}
              onSelect={() => {
                setSelectedId(integration.id)
                setActionResult(null)
              }}
            />
          ))}
          {visibleIntegrations.length === 0 && (
            <div className="icc-empty">No integrations match this filter.</div>
          )}
        </section>

        <aside className="icc-detail" aria-label={`${selectedIntegration.name} details`}>
          <div className="icc-detail-head">
            <div>
              <span className="icc-detail-kicker">{selectedIntegration.category}</span>
              <h2>{selectedIntegration.name}</h2>
              <p>{selectedIntegration.description}</p>
            </div>
            <span className={`icc-status-badge ${selectedSummary.status}`}>{statusLabel(selectedSummary)}</span>
          </div>

          <div className="icc-detail-section">
            <div className="icc-section-title">Setup</div>
            <RequirementList summary={selectedSummary} />
          </div>

          <div className="icc-detail-section">
            <div className="icc-section-title">Best for</div>
            <div className="icc-tags">
              {selectedIntegration.recommendedFor.map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>

          {selectedIntegration.installCommand && (
            <div className="icc-install">
              <span>Install</span>
              <code>{selectedIntegration.installCommand}</code>
            </div>
          )}

          <div className="icc-detail-section">
            <div className="icc-section-title">Actions</div>
            <div className="icc-actions">
              {selectedIntegration.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="icc-action"
                  onClick={() => void handleRunAction(action.id)}
                  disabled={runningActionId === action.id}
                >
                  <span className="icc-action-main">
                    <span>{runningActionId === action.id ? 'Running...' : action.label}</span>
                    <small>{action.description}</small>
                  </span>
                  <RiskPill risk={action.risk} />
                </button>
              ))}
            </div>
          </div>

          {actionResult && (
            <div className={`icc-result ${actionResult.status}`}>
              <span className="icc-result-title">{actionResult.title}</span>
              <p>{actionResult.detail}</p>
              {actionResult.items?.length ? (
                <div className="icc-result-items">
                  {actionResult.items.map((item) => <code key={item}>{item}</code>)}
                </div>
              ) : null}
            </div>
          )}

          <div className="icc-footer-actions">
            <button type="button" className="icc-secondary" onClick={openDocs}>Open docs</button>
            <button type="button" className="icc-primary" onClick={() => openWorkspaceTool('solana-toolbox')}>Open Solana Toolbox</button>
          </div>

          {loading && <div className="icc-loading">Refreshing setup context...</div>}
        </aside>
      </main>
    </div>
  )
}

export default IntegrationCommandCenter

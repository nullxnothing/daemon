import { useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { useAppActions } from '../../store/appActions'
import { useUIStore } from '../../store/ui'
import { useSolanaToolboxStore } from '../../store/solanaToolbox'
import type { EnvFile, WalletListEntry } from '../../types/daemon'
import { INTEGRATION_CATEGORIES, INTEGRATION_REGISTRY, type IntegrationCategory, type IntegrationDefinition } from './registry'
import { runIntegrationAction, type IntegrationActionResult } from './actionRunner'
import { resolveIntegrationStatus, summarizeRegistry, type IntegrationContext, type IntegrationStatusSummary } from './status'
import {
  buildFirstSolanaAgentFile,
  buildFirstSolanaAgentReadme,
  createFirstAgentPlan,
  createSendAiSetupPlan,
  mergeEnvExample,
  parsePackageInfo,
  upsertPackageJsonScript,
  SENDAI_FIRST_AGENT_ENTRY,
  type PackageInfo,
  type PackageManager,
  type FirstAgentPlan,
  type SendAiSetupPlan,
} from './sendaiSetup'
import './IntegrationCommandCenter.css'

function joinProjectPath(projectPath: string, child: string): string {
  return `${projectPath.replace(/[\\/]+$/, '')}/${child}`
}

function statusLabel(summary: IntegrationStatusSummary): string {
  if (summary.status === 'ready') return 'Ready'
  if (summary.status === 'partial') return 'Partial'
  return 'Setup needed'
}

const EMPTY_PACKAGE_INFO: PackageInfo = { packages: new Set(), scripts: new Set(), packageManagerHint: null }

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

function SendAiSetupWorkflow({
  plan,
  applying,
  onApply,
}: {
  plan: SendAiSetupPlan
  applying: boolean
  onApply: () => void
}) {
  return (
    <div className="icc-setup-workflow">
      <div className="icc-setup-head">
        <div>
          <span className="icc-section-title">Guided setup</span>
          <h3>Add Solana Agent Kit to this project</h3>
          <p>Preview what DAEMON will do, then apply only the package install and env template changes.</p>
        </div>
        <span className="icc-status-badge partial">{plan.packageManager}</span>
      </div>

      <div className="icc-plan-grid">
        <div className="icc-plan-card">
          <span>Install command</span>
          <code>{plan.installCommand ?? 'All SendAI packages are already installed'}</code>
        </div>
        <div className="icc-plan-card">
          <span>Env template</span>
          <code>{plan.envFileName} adds {plan.missingEnvKeys.length} missing key{plan.missingEnvKeys.length === 1 ? '' : 's'}</code>
        </div>
      </div>

      <div className="icc-plan-columns">
        <div>
          <span className="icc-mini-title">Packages</span>
          <div className="icc-check-list">
            {plan.missingPackages.map((name) => <span key={name}>Install {name}</span>)}
            {plan.missingPackages.length === 0 ? <span>All recommended packages are present</span> : null}
          </div>
        </div>
        <div>
          <span className="icc-mini-title">Env keys</span>
          <div className="icc-check-list">
            {plan.missingEnvKeys.map((key) => <span key={key}>Template {key}</span>)}
            {plan.missingEnvKeys.length === 0 ? <span>Env template keys already detected</span> : null}
          </div>
        </div>
      </div>

      <div className="icc-safety-notes">
        {plan.safetyNotes.map((note) => <span key={note}>{note}</span>)}
      </div>

      <button type="button" className="icc-primary icc-apply-setup" onClick={onApply} disabled={applying}>
        {applying ? 'Applying setup...' : 'Apply Setup'}
      </button>
    </div>
  )
}

function SendAiFirstAgentWorkflow({
  plan,
  scaffolding,
  running,
  onScaffold,
  onRun,
}: {
  plan: FirstAgentPlan
  scaffolding: boolean
  running: boolean
  onScaffold: () => void
  onRun: () => void
}) {
  return (
    <div className="icc-setup-workflow icc-setup-workflow--secondary">
      <div className="icc-setup-head">
        <div>
          <span className="icc-section-title">First success</span>
          <h3>Create your first Solana agent</h3>
          <p>DAEMON can scaffold a starter file, add one package script, and give the project a single command to run.</p>
        </div>
        <span className={`icc-status-badge ${plan.alreadyScaffolded ? 'ready' : 'partial'}`}>
          {plan.alreadyScaffolded ? 'scaffolded' : 'ready to scaffold'}
        </span>
      </div>

      <div className="icc-plan-grid">
        <div className="icc-plan-card">
          <span>Starter file</span>
          <code>{plan.entryFilePath}</code>
        </div>
        <div className="icc-plan-card">
          <span>Run command</span>
          <code>{plan.runCommand}</code>
        </div>
      </div>

      <div className="icc-plan-columns">
        <div>
          <span className="icc-mini-title">What DAEMON adds</span>
          <div className="icc-check-list">
            <span>{plan.entryFilePath}</span>
            <span>{plan.readmePath}</span>
            <span>{plan.scriptName} in package.json</span>
          </div>
        </div>
        <div>
          <span className="icc-mini-title">Readiness</span>
          <div className="icc-check-list">
            {plan.prerequisites.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </div>

      {plan.missingPackages.length > 0 && (
        <div className="icc-inline-note">
          Install the SendAI runtime packages first. The scaffold is safe to create now, but the starter check should wait until install completes.
        </div>
      )}

      <div className="icc-safety-notes">
        {plan.safetyNotes.map((note) => <span key={note}>{note}</span>)}
      </div>

      <div className="icc-setup-actions">
        <button type="button" className="icc-secondary" onClick={onScaffold} disabled={!plan.canScaffold || scaffolding}>
          {scaffolding ? 'Creating files...' : plan.alreadyScaffolded ? 'Starter files created' : 'Create Starter Files'}
        </button>
        <button type="button" className="icc-primary" onClick={onRun} disabled={!plan.canRun || running}>
          {running ? 'Opening terminal...' : 'Run Starter Check'}
        </button>
      </div>
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
  const addTerminal = useUIStore((s) => s.addTerminal)
  const focusTerminal = useAppActions((s) => s.focusTerminal)
  const mcps = useSolanaToolboxStore((s) => s.mcps)
  const toolchain = useSolanaToolboxStore((s) => s.toolchain)
  const loadMcps = useSolanaToolboxStore((s) => s.loadMcps)
  const loadToolchain = useSolanaToolboxStore((s) => s.loadToolchain)

  const [category, setCategory] = useState<IntegrationCategory | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(INTEGRATION_REGISTRY[0]?.id ?? '')
  const [envFiles, setEnvFiles] = useState<EnvFile[]>([])
  const [packageInfo, setPackageInfo] = useState<PackageInfo>(EMPTY_PACKAGE_INFO)
  const [packageJsonContent, setPackageJsonContent] = useState<string | null>(null)
  const [lockfiles, setLockfiles] = useState<Partial<Record<PackageManager, boolean>>>({})
  const [hasStarterAgentFile, setHasStarterAgentFile] = useState(false)
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [secureKeys, setSecureKeys] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [applyingSetup, setApplyingSetup] = useState(false)
  const [scaffoldingFirstAgent, setScaffoldingFirstAgent] = useState(false)
  const [runningStarterCheck, setRunningStarterCheck] = useState(false)
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

          const [envRes, packageRes, pnpmLockRes, npmLockRes, yarnLockRes, bunLockRes, starterFileRes] = await Promise.all([
            daemon.env.projectVars(activeProjectPath),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'package.json')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'pnpm-lock.yaml')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'package-lock.json')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'yarn.lock')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, 'bun.lockb')),
            daemon.fs.readFile(joinProjectPath(activeProjectPath, SENDAI_FIRST_AGENT_ENTRY)),
          ])

          if (cancelled) return

          setEnvFiles(envRes.ok && envRes.data ? envRes.data : [])
          setPackageInfo(packageRes.ok && packageRes.data ? parsePackageInfo(packageRes.data.content) : EMPTY_PACKAGE_INFO)
          setPackageJsonContent(packageRes.ok && packageRes.data ? packageRes.data.content : null)
          setLockfiles({
            pnpm: Boolean(pnpmLockRes.ok),
            npm: Boolean(npmLockRes.ok),
            yarn: Boolean(yarnLockRes.ok),
            bun: Boolean(bunLockRes.ok),
          })
          setHasStarterAgentFile(Boolean(starterFileRes.ok))
        } else {
          setEnvFiles([])
          setPackageInfo(EMPTY_PACKAGE_INFO)
          setPackageJsonContent(null)
          setLockfiles({})
          setHasStarterAgentFile(false)
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
    packages: packageInfo.packages,
    walletReady: Boolean(defaultWallet),
    defaultWallet,
    secureKeys,
    toolchain,
  }), [envFiles, mcps, packageInfo, defaultWallet, secureKeys, toolchain])

  const registrySummary = useMemo(() => summarizeRegistry(INTEGRATION_REGISTRY, context), [context])
  const envKeys = useMemo(() => new Set(
    envFiles.flatMap((file) => file.vars.filter((envVar) => !envVar.isComment).map((envVar) => envVar.key)),
  ), [envFiles])
  const sendAiSetupPlan = useMemo(
    () => createSendAiSetupPlan({ packageInfo, lockfiles, envKeys }),
    [packageInfo, lockfiles, envKeys],
  )
  const firstAgentPlan = useMemo(
    () => createFirstAgentPlan({
      packageInfo,
      lockfiles,
      hasPackageJson: Boolean(packageJsonContent),
      hasStarterFile: hasStarterAgentFile,
    }),
    [packageInfo, lockfiles, packageJsonContent, hasStarterAgentFile],
  )

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

  async function handleApplySendAiSetup(plan: SendAiSetupPlan) {
    if (!activeProjectPath || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs an active project before it can install packages or write .env.example.',
      })
      return
    }

    setApplyingSetup(true)
    setActionResult(null)

    try {
      const envExamplePath = joinProjectPath(activeProjectPath, plan.envFileName)
      const currentEnvRes = await daemon.fs.readFile(envExamplePath)
      const currentEnv = currentEnvRes.ok && currentEnvRes.data ? currentEnvRes.data.content : ''
      const nextEnv = mergeEnvExample(currentEnv)
      const changedFiles: string[] = []

      if (nextEnv !== currentEnv) {
        const writeRes = await daemon.fs.writeFile(envExamplePath, nextEnv)
        if (!writeRes.ok) {
          throw new Error(writeRes.error ?? `Could not write ${plan.envFileName}`)
        }
        changedFiles.push(plan.envFileName)
      }

      if (plan.installCommand) {
        const terminalRes = await daemon.terminal.create({
          cwd: activeProjectPath,
          startupCommand: plan.installCommand,
          userInitiated: true,
        })
        if (!terminalRes.ok || !terminalRes.data) {
          throw new Error(terminalRes.error ?? 'Could not start package install terminal')
        }
        addTerminal(activeProjectId, terminalRes.data.id, 'Install SendAI', terminalRes.data.agentId)
        focusTerminal()
        changedFiles.push(`terminal: ${plan.installCommand}`)
      }

      setActionResult({
        title: 'SendAI setup started',
        status: 'success',
        detail: plan.installCommand
          ? 'DAEMON updated the env template and opened a visible terminal for package installation.'
          : 'DAEMON updated the env template. Required SendAI packages were already present.',
        items: changedFiles.length > 0 ? changedFiles : ['No changes needed'],
      })
    } catch (error) {
      setActionResult({
        title: 'SendAI setup failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not apply the setup plan.',
      })
    } finally {
      setApplyingSetup(false)
    }
  }

  async function ensureDir(path: string) {
    const result = await daemon.fs.createDir(path)
    if (!result.ok && !/exist/i.test(result.error ?? '')) {
      throw new Error(result.error ?? `Could not create ${path}`)
    }
  }

  async function handleCreateFirstAgent(plan: FirstAgentPlan) {
    if (!activeProjectPath || !packageJsonContent) {
      setActionResult({
        title: 'Create a Node project first',
        status: 'warning',
        detail: 'DAEMON needs an active project with package.json before it can scaffold a first SendAI agent.',
      })
      return
    }

    setScaffoldingFirstAgent(true)
    setActionResult(null)

    try {
      const packageJsonPath = joinProjectPath(activeProjectPath, 'package.json')
      const packageRes = await daemon.fs.readFile(packageJsonPath)
      if (!packageRes.ok || !packageRes.data) {
        throw new Error(packageRes.error ?? 'Could not read package.json')
      }

      const nextPackageJson = upsertPackageJsonScript(packageRes.data.content, plan.scriptName, plan.scriptCommand)
      const srcDir = joinProjectPath(activeProjectPath, 'src')
      const agentsDir = joinProjectPath(activeProjectPath, 'src/agents')
      const changedFiles: string[] = []

      if (nextPackageJson !== packageRes.data.content) {
        const writePackageRes = await daemon.fs.writeFile(packageJsonPath, nextPackageJson)
        if (!writePackageRes.ok) {
          throw new Error(writePackageRes.error ?? 'Could not update package.json')
        }
        changedFiles.push('package.json')
        setPackageJsonContent(nextPackageJson)
        setPackageInfo(parsePackageInfo(nextPackageJson))
      }

      await ensureDir(srcDir)
      await ensureDir(agentsDir)

      const entryRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, plan.entryFilePath),
        buildFirstSolanaAgentFile(),
      )
      if (!entryRes.ok) {
        throw new Error(entryRes.error ?? `Could not write ${plan.entryFilePath}`)
      }
      changedFiles.push(plan.entryFilePath)

      const readmeRes = await daemon.fs.writeFile(
        joinProjectPath(activeProjectPath, plan.readmePath),
        buildFirstSolanaAgentReadme(plan.runCommand),
      )
      if (!readmeRes.ok) {
        throw new Error(readmeRes.error ?? `Could not write ${plan.readmePath}`)
      }
      changedFiles.push(plan.readmePath)
      setHasStarterAgentFile(true)

      setActionResult({
        title: 'Starter agent scaffolded',
        status: 'success',
        detail: 'DAEMON wrote a first Solana agent file, added a simple package script, and left the run step as a visible terminal action.',
        items: changedFiles,
      })
    } catch (error) {
      setActionResult({
        title: 'Starter scaffold failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not create the starter agent files.',
      })
    } finally {
      setScaffoldingFirstAgent(false)
    }
  }

  async function handleRunFirstAgent(plan: FirstAgentPlan) {
    if (!activeProjectPath || !activeProjectId) {
      setActionResult({
        title: 'Open a project first',
        status: 'warning',
        detail: 'DAEMON needs an active project before it can open the starter run command in a terminal.',
      })
      return
    }

    setRunningStarterCheck(true)
    setActionResult(null)

    try {
      const terminalRes = await daemon.terminal.create({
        cwd: activeProjectPath,
        startupCommand: plan.runCommand,
        userInitiated: true,
      })
      if (!terminalRes.ok || !terminalRes.data) {
        throw new Error(terminalRes.error ?? 'Could not start starter terminal')
      }

      addTerminal(activeProjectId, terminalRes.data.id, 'SendAI Starter Check', terminalRes.data.agentId)
      focusTerminal()
      setActionResult({
        title: 'Starter check opened',
        status: 'success',
        detail: 'DAEMON opened a visible terminal so you can watch the first-agent readiness check run.',
        items: [plan.runCommand],
      })
    } catch (error) {
      setActionResult({
        title: 'Starter check failed',
        status: 'error',
        detail: error instanceof Error ? error.message : 'DAEMON could not open the starter terminal.',
      })
    } finally {
      setRunningStarterCheck(false)
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

          {selectedIntegration.id === 'sendai-agent-kit' && (
            <>
              <SendAiSetupWorkflow
                plan={sendAiSetupPlan}
                applying={applyingSetup}
                onApply={() => void handleApplySendAiSetup(sendAiSetupPlan)}
              />
              <SendAiFirstAgentWorkflow
                plan={firstAgentPlan}
                scaffolding={scaffoldingFirstAgent}
                running={runningStarterCheck}
                onScaffold={() => void handleCreateFirstAgent(firstAgentPlan)}
                onRun={() => void handleRunFirstAgent(firstAgentPlan)}
              />
            </>
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

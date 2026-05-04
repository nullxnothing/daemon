import type {
  SolanaMcpEntry,
  SolanaProjectInfo,
  SolanaToolchainStatus,
  ValidatorState,
} from '../../store/solanaToolbox'
import './ProjectControlCenter.css'

type ReadinessStatus = 'ready' | 'warning' | 'missing'

interface ReadinessItem {
  id: string
  label: string
  status: ReadinessStatus
  detail: string
}

interface NextAction {
  id: string
  label: string
  detail: string
  tone: 'primary' | 'default' | 'warning'
  command?: string
  onClick?: () => void
}

interface ProjectControlCenterProps {
  projectPath: string | null | undefined
  projectInfo: SolanaProjectInfo | null
  toolchain: SolanaToolchainStatus | null
  validator: ValidatorState
  mcps: SolanaMcpEntry[]
  onStartValidator: (type: 'surfpool' | 'test-validator') => void
  onOpenDebug: () => void
  onOpenConnect: () => void
  onOpenLaunch: () => void
}

const BUILD_LOOP = [
  {
    label: 'Detect',
    detail: 'Classify the active repo and surface Solana indicators.',
  },
  {
    label: 'Prepare',
    detail: 'Verify CLI, Anchor, AVM, runtime, and project-level test harnesses.',
  },
  {
    label: 'Run',
    detail: 'Start localnet or forked runtime before tests and transaction work.',
  },
  {
    label: 'Debug',
    detail: 'Use failures, logs, and project context to guide the agent loop.',
  },
  {
    label: 'Ship',
    detail: 'Move toward safe deploy, IDL, upgrade authority, and monitoring flows.',
  },
]

function statusLabel(status: ReadinessStatus): string {
  if (status === 'ready') return 'Ready'
  if (status === 'warning') return 'Needs Review'
  return 'Missing'
}

function getProjectKind(projectInfo: SolanaProjectInfo | null): string {
  if (!projectInfo) return 'No active scan'
  if (!projectInfo.isSolanaProject) return 'Non-Solana or undetected'
  if (projectInfo.framework === 'anchor') return 'Anchor program workspace'
  if (projectInfo.framework === 'native') return 'Native Solana program'
  if (projectInfo.framework === 'client-only') return 'Solana client app'
  return 'Solana project'
}

function getRuntimeLabel(validator: ValidatorState): string {
  if (validator.status === 'running' && validator.type) {
    return `${validator.type === 'surfpool' ? 'Surfpool' : 'Test Validator'} :${validator.port ?? 8899}`
  }
  if (validator.status === 'starting') return 'Starting runtime'
  if (validator.status === 'error') return 'Runtime error'
  return 'Runtime stopped'
}

function getSuggestedMcpStatus(projectInfo: SolanaProjectInfo | null, mcps: SolanaMcpEntry[]): ReadinessItem {
  const suggested = projectInfo?.suggestedMcps ?? []
  if (!projectInfo?.isSolanaProject || suggested.length === 0) {
    return {
      id: 'mcps',
      label: 'Solana MCP context',
      status: 'warning',
      detail: 'Open a Solana repo to get project-specific MCP recommendations.',
    }
  }

  const enabledCount = suggested.filter((name) => mcps.find((mcp) => mcp.name === name)?.enabled).length
  if (enabledCount === suggested.length) {
    return {
      id: 'mcps',
      label: 'Solana MCP context',
      status: 'ready',
      detail: `${enabledCount}/${suggested.length} suggested MCPs enabled for this workspace.`,
    }
  }

  return {
    id: 'mcps',
    label: 'Solana MCP context',
    status: enabledCount > 0 ? 'warning' : 'missing',
    detail: `${enabledCount}/${suggested.length} suggested MCPs enabled. Enable the rest before deep agent/debug work.`,
  }
}

function buildReadinessItems(
  projectInfo: SolanaProjectInfo | null,
  toolchain: SolanaToolchainStatus | null,
  validator: ValidatorState,
  mcps: SolanaMcpEntry[],
): ReadinessItem[] {
  const isAnchor = projectInfo?.framework === 'anchor'
  const isProgram = projectInfo?.framework === 'anchor' || projectInfo?.framework === 'native'

  return [
    {
      id: 'project',
      label: 'Project classification',
      status: projectInfo?.isSolanaProject ? 'ready' : 'warning',
      detail: projectInfo?.isSolanaProject
        ? `Detected ${getProjectKind(projectInfo)} from ${projectInfo.indicators.length} indicator${projectInfo.indicators.length === 1 ? '' : 's'}.`
        : 'No Solana indicators detected yet. Open an Anchor, native Solana, or Solana client project.',
    },
    {
      id: 'solana-cli',
      label: 'Solana CLI',
      status: toolchain?.solanaCli.installed ? 'ready' : 'missing',
      detail: toolchain?.solanaCli.installed
        ? toolchain.solanaCli.version ?? 'Installed, version unavailable.'
        : 'Required for account, program, local validator, and deploy workflows.',
    },
    {
      id: 'anchor',
      label: 'Anchor stack',
      status: !isAnchor ? 'warning' : toolchain?.anchor.installed ? 'ready' : 'missing',
      detail: !isAnchor
        ? 'Anchor is only required for Anchor program workspaces.'
        : toolchain?.anchor.installed
          ? toolchain.anchor.version ?? 'Anchor installed, version unavailable.'
          : 'Anchor project detected but Anchor is not available on PATH.',
    },
    {
      id: 'avm',
      label: 'AVM pinning',
      status: !isAnchor ? 'warning' : toolchain?.avm.installed ? 'ready' : 'missing',
      detail: !isAnchor
        ? 'Use AVM when the active repo is an Anchor workspace.'
        : toolchain?.avm.installed
          ? toolchain.avm.version ?? 'AVM installed, version unavailable.'
          : 'Install AVM to make Anchor versions reproducible for this project.',
    },
    {
      id: 'runtime',
      label: 'Local runtime',
      status: validator.status === 'running'
        ? 'ready'
        : toolchain?.surfpool.installed || toolchain?.testValidator.installed
          ? 'warning'
          : 'missing',
      detail: validator.status === 'running'
        ? getRuntimeLabel(validator)
        : toolchain?.surfpool.installed
          ? 'Surfpool is installed. Start it before replay, simulation, and local test loops.'
          : toolchain?.testValidator.installed
            ? 'solana-test-validator is installed. Start it before local test loops.'
            : 'Install Surfpool or solana-test-validator to make DAEMON runtime-native.',
    },
    {
      id: 'litesvm',
      label: 'Fast program tests',
      status: !isProgram ? 'warning' : toolchain?.litesvm.installed ? 'ready' : 'warning',
      detail: !isProgram
        ? 'LiteSVM is most useful for program workspaces.'
        : toolchain?.litesvm.installed
          ? 'LiteSVM detected in the active project.'
          : 'Add LiteSVM or Mollusk coverage so tests do not depend only on full validator runs.',
    },
    getSuggestedMcpStatus(projectInfo, mcps),
  ]
}

function buildNextActions(
  projectPath: string | null | undefined,
  projectInfo: SolanaProjectInfo | null,
  toolchain: SolanaToolchainStatus | null,
  validator: ValidatorState,
  onStartValidator: (type: 'surfpool' | 'test-validator') => void,
  onOpenDebug: () => void,
  onOpenConnect: () => void,
  onOpenLaunch: () => void,
): NextAction[] {
  if (!projectPath) {
    return [
      {
        id: 'open-project',
        label: 'Open a Solana repo',
        detail: 'DAEMON needs an active project before it can classify the stack or build a runtime loop.',
        tone: 'primary',
      },
    ]
  }

  if (!projectInfo?.isSolanaProject) {
    return [
      {
        id: 'open-starter',
        label: 'Start from a Solana template',
        detail: 'Use an Anchor, dApp, or trading starter so DAEMON can detect a Solana workspace.',
        tone: 'primary',
      },
      {
        id: 'connect-providers',
        label: 'Configure Solana providers',
        detail: 'Add Helius, QuickNode, custom RPC, and wallet defaults before generated app work.',
        tone: 'default',
        onClick: onOpenConnect,
      },
    ]
  }

  const actions: NextAction[] = []

  if (!toolchain?.solanaCli.installed) {
    actions.push({
      id: 'install-solana-cli',
      label: 'Install Solana CLI',
      detail: 'Core Solana commands are missing. Without them, DAEMON cannot own local runtime or deploy flows.',
      tone: 'warning',
      command: 'sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"',
      onClick: onOpenDebug,
    })
  }

  if (projectInfo.framework === 'anchor' && !toolchain?.anchor.installed) {
    actions.push({
      id: 'install-anchor',
      label: 'Install Anchor / AVM',
      detail: 'Anchor workspace detected. Install Anchor tooling before build, test, IDL, and deploy flows.',
      tone: 'warning',
      command: 'cargo install --git https://github.com/coral-xyz/anchor avm --locked',
      onClick: onOpenDebug,
    })
  }

  if (validator.status !== 'running') {
    if (toolchain?.surfpool.installed) {
      actions.push({
        id: 'start-surfpool',
        label: 'Start Surfpool runtime',
        detail: 'Use Surfpool as the default local/fork runtime for simulation and replay work.',
        tone: 'primary',
        command: 'surfpool',
        onClick: () => onStartValidator('surfpool'),
      })
    } else if (toolchain?.testValidator.installed) {
      actions.push({
        id: 'start-test-validator',
        label: 'Start test validator',
        detail: 'Use the canonical local validator until Surfpool is installed.',
        tone: 'primary',
        command: 'solana-test-validator',
        onClick: () => onStartValidator('test-validator'),
      })
    }
  }

  const suggestedMcps = projectInfo.suggestedMcps ?? []
  const enabledSuggested = suggestedMcps.filter((name) => mcps.find((mcp) => mcp.name === name)?.enabled).length
  if (suggestedMcps.length > 0 && enabledSuggested < suggestedMcps.length) {
    actions.push({
      id: 'enable-mcps',
      label: 'Enable suggested MCPs',
      detail: `${enabledSuggested}/${suggestedMcps.length} suggested MCPs enabled. Turn on Solana context before deep agent work.`,
      tone: 'default',
      onClick: onOpenConnect,
    })
  }

  if ((projectInfo.framework === 'anchor' || projectInfo.framework === 'native') && !toolchain?.litesvm.installed) {
    actions.push({
      id: 'add-litesvm',
      label: 'Add fast program tests',
      detail: 'Add LiteSVM or Mollusk coverage so DAEMON can run quick program validation before full validator loops.',
      tone: 'default',
      command: 'cargo add litesvm --dev',
      onClick: onOpenDebug,
    })
  }

  actions.push({
    id: 'protocol-packs',
    label: 'Pick protocol pack deliberately',
    detail: 'Move into Jupiter, Metaplex, Raydium, Meteora, Drift, Kamino, and launch flows only after the base runtime is healthy.',
    tone: 'default',
    onClick: onOpenLaunch,
  })

  return actions.slice(0, 5)
}

export function ProjectControlCenter({
  projectPath,
  projectInfo,
  toolchain,
  validator,
  mcps,
  onStartValidator,
  onOpenDebug,
  onOpenConnect,
  onOpenLaunch,
}: ProjectControlCenterProps) {
  const readiness = buildReadinessItems(projectInfo, toolchain, validator, mcps)
  const readyCount = readiness.filter((item) => item.status === 'ready').length
  const readinessScore = Math.round((readyCount / readiness.length) * 100)
  const nextActions = buildNextActions(
    projectPath,
    projectInfo,
    toolchain,
    validator,
    onStartValidator,
    onOpenDebug,
    onOpenConnect,
    onOpenLaunch,
  )

  const indicators = projectInfo?.indicators ?? []

  return (
    <div className="solana-project-control">
      <div className="solana-project-control-hero">
        <div>
          <div className="solana-token-launch-kicker">Project Control Center</div>
          <h3 className="solana-token-launch-title">Turn the active repo into a Solana build loop</h3>
          <p className="solana-token-launch-copy">
            DAEMON is now grouping project detection, toolchain readiness, local runtime state, and next moves into one workspace-level view.
          </p>
        </div>
        <div className="solana-project-score" aria-label={`Solana readiness score ${readinessScore}%`}>
          <span className="solana-project-score-value">{readinessScore}%</span>
          <span className="solana-project-score-label">Ready</span>
        </div>
      </div>

      <div className="solana-project-fingerprint">
        <section className="solana-project-fingerprint-card wide">
          <div className="solana-runtime-label">Active Project</div>
          <div className="solana-project-fingerprint-value">{getProjectKind(projectInfo)}</div>
          <div className="solana-runtime-detail">
            {projectPath ?? 'No active project path. Open a workspace to let DAEMON classify it.'}
          </div>
        </section>
        <section className="solana-project-fingerprint-card">
          <div className="solana-runtime-label">Runtime</div>
          <div className="solana-project-fingerprint-value">{getRuntimeLabel(validator)}</div>
          <div className="solana-runtime-detail">Localnet and forked-runtime work should start here.</div>
        </section>
        <section className="solana-project-fingerprint-card">
          <div className="solana-runtime-label">Indicators</div>
          <div className="solana-project-fingerprint-value">{indicators.length}</div>
          <div className="solana-runtime-detail">
            {indicators.length > 0 ? indicators.slice(0, 4).join(', ') : 'No Solana markers found yet.'}
          </div>
        </section>
      </div>

      <div className="solana-project-columns">
        <section className="solana-project-panel">
          <div className="solana-project-panel-title">Readiness Signals</div>
          <div className="solana-project-readiness-list">
            {readiness.map((item) => (
              <div key={item.id} className={`solana-project-readiness-row ${item.status}`}>
                <div className="solana-project-readiness-main">
                  <div className="solana-project-readiness-title-row">
                    <span className="solana-project-readiness-title">{item.label}</span>
                    <span className={`solana-runtime-status ${item.status === 'ready' ? 'live' : item.status === 'warning' ? 'partial' : 'setup'}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div className="solana-project-readiness-detail">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="solana-project-panel">
          <div className="solana-project-panel-title">Next Best Actions</div>
          <div className="solana-project-action-list">
            {nextActions.map((action) => (
              <div key={action.id} className={`solana-project-action ${action.tone}`}>
                <div>
                  <div className="solana-project-action-title">{action.label}</div>
                  <div className="solana-project-action-detail">{action.detail}</div>
                  {action.command && <code className="solana-project-action-command">{action.command}</code>}
                </div>
                {action.onClick && (
                  <button type="button" className={`sol-btn ${action.tone === 'primary' ? 'green' : ''}`} onClick={action.onClick}>
                    Open
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="solana-project-loop">
        <div className="solana-project-panel-title">Solana IDE Loop</div>
        <div className="solana-project-loop-grid">
          {BUILD_LOOP.map((step, index) => (
            <div key={step.label} className="solana-project-loop-step">
              <div className="solana-project-loop-index">{index + 1}</div>
              <div className="solana-project-loop-label">{step.label}</div>
              <div className="solana-project-loop-detail">{step.detail}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

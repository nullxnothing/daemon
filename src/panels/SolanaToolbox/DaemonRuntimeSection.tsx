import { useEffect, useMemo, useState } from 'react'
import { useAppActions } from '../../store/appActions'
import type { SolanaMcpEntry, SolanaToolchainStatus } from '../../store/solanaToolbox'
import { useUIStore } from '../../store/ui'
import { SOLANA_RUNTIME_MODULES, type SolanaRuntimeModuleStatus } from './catalog'
import { getSolanaToolingGuide } from './toolingGuides'

interface RuntimeState {
  runtime: SolanaRuntimeStatusSummary | null
  actionMessage: string | null
}

interface RuntimeModuleView {
  id: string
  label: string
  summary: string
  ownedByDaemon: string
  status: SolanaRuntimeModuleStatus
  value: string
  detail: string
}

interface DaemonRuntimeSectionProps {
  mcps: SolanaMcpEntry[]
  toolchain: SolanaToolchainStatus | null
  projectId: string | null
  projectPath?: string
}

const DEFAULT_RUNTIME: SolanaRuntimeStatusSummary = {
  rpc: {
    label: 'Helius',
    detail: 'Helius key missing',
    status: 'setup',
  },
  walletPath: {
    label: 'Phantom-first',
    detail: 'Optimize flows for Phantom Connect, with Solana wallet UX anchored around Phantom-first handoff.',
    status: 'live',
  },
  swapEngine: {
    label: 'Jupiter',
    detail: 'Add a Jupiter API key in Wallet settings to enable quotes and execution.',
    status: 'setup',
  },
  executionBackend: {
    label: 'Shared RPC executor',
    detail: 'DAEMON routes wallet sends, swaps, launches, Pump.fun actions, and recovery flows through one shared RPC executor with shared confirmation behavior.',
    status: 'partial',
  },
  environmentDiagnostics: [],
  executionCoverage: [],
  troubleshooting: [],
}

export function DaemonRuntimeSection({ mcps, toolchain, projectId, projectPath }: DaemonRuntimeSectionProps) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const focusTerminal = useAppActions((s) => s.focusTerminal)
  const [state, setState] = useState<RuntimeState>({
    runtime: null,
    actionMessage: null,
  })

  useEffect(() => {
    let cancelled = false

    void window.daemon.settings.getSolanaRuntimeStatus(projectPath).then((runtimeRes) => {
      if (cancelled) return
      setState({
        runtime: runtimeRes.ok && runtimeRes.data ? runtimeRes.data : DEFAULT_RUNTIME,
        actionMessage: null,
      })
    }).catch(() => {
      if (cancelled) return
      setState({
        runtime: DEFAULT_RUNTIME,
        actionMessage: null,
      })
    })

    return () => {
      cancelled = true
    }
  }, [projectPath])

  const heliusMcpEnabled = mcps.some((entry) => entry.name === 'helius' && entry.enabled)
  const runtime = state.runtime ?? DEFAULT_RUNTIME

  async function handleRunCommand(command: string, label: string) {
    if (!projectId || !projectPath) {
      setState((prev) => ({ ...prev, actionMessage: 'Open a project before asking DAEMON to run Solana setup commands.' }))
      return
    }

    const terminalRes = await window.daemon.terminal.create({
      cwd: projectPath,
      startupCommand: command,
      userInitiated: true,
    })

    if (!terminalRes.ok || !terminalRes.data) {
      setState((prev) => ({ ...prev, actionMessage: terminalRes.error ?? `Could not open the ${label} terminal.` }))
      return
    }

    addTerminal(projectId, terminalRes.data.id, label, terminalRes.data.agentId)
    focusTerminal()
    setState((prev) => ({ ...prev, actionMessage: `${label} opened in a project terminal.` }))
  }

  const modules = useMemo<RuntimeModuleView[]>(() => {
    const realtimeStatus: SolanaRuntimeModuleStatus =
      runtime.rpc.label === 'Helius' && runtime.rpc.status === 'live' && heliusMcpEnabled
        ? 'live'
        : runtime.rpc.label === 'Helius' || heliusMcpEnabled
          ? 'partial'
          : 'setup'

    const protocolsStatus: SolanaRuntimeModuleStatus = 'live'

    const readyTooling = toolchain
      ? [toolchain.solanaCli.installed, toolchain.anchor.installed, toolchain.avm.installed, toolchain.surfpool.installed || toolchain.testValidator.installed].filter(Boolean).length
      : 0
    const testingStatus: SolanaRuntimeModuleStatus =
      readyTooling >= 3 ? 'live' : readyTooling > 0 ? 'partial' : 'setup'

    return SOLANA_RUNTIME_MODULES.map((module) => {
      switch (module.id) {
        case 'transport':
          return {
            ...module,
            status: runtime.rpc.status,
            value: `${runtime.rpc.label} transport`,
            detail: runtime.rpc.detail,
          }
        case 'wallet':
          return {
            ...module,
            status: runtime.walletPath.status,
            value: `${runtime.walletPath.label} UX`,
            detail: runtime.walletPath.detail,
          }
        case 'execution':
          return {
            ...module,
            status: runtime.executionBackend.status,
            value: runtime.executionBackend.label,
            detail: runtime.executionBackend.detail,
          }
        case 'realtime':
          return {
            ...module,
            status: realtimeStatus,
            value: realtimeStatus === 'live' ? 'Indexed streams ready' : realtimeStatus === 'partial' ? 'Partial monitoring path' : 'Realtime path needs setup',
            detail: realtimeStatus === 'live'
              ? 'Helius credentials and the project MCP are both present, so DAEMON can lean on indexed monitoring instead of raw polling.'
              : realtimeStatus === 'partial'
                ? 'Part of the monitoring stack is present, but DAEMON still lacks either project wiring or provider credentials.'
                : 'Enable the Helius MCP and add a Helius key to make realtime monitoring an obvious default inside DAEMON.',
          }
        case 'protocols':
          return {
            ...module,
            status: protocolsStatus,
            value: 'Pump.fun, Raydium, Meteora',
            detail: 'DAEMON already owns launch adapters for these protocols, and the current execution refactor is what makes those adapters feel like one platform instead of separate tools.',
          }
        case 'testing':
          return {
            ...module,
            status: testingStatus,
            value: toolchain
              ? `${readyTooling}/4 runtime blocks ready`
              : 'Toolchain pending',
            detail: toolchain
              ? 'Validator controls and toolchain checks are already visible here; the goal is to make scaffolded Solana projects land on the same tested defaults.'
              : 'DAEMON has not loaded the local toolchain status yet.',
          }
        default:
          return {
            ...module,
            status: 'setup',
            value: 'Pending',
            detail: module.summary,
          }
      }
    })
  }, [heliusMcpEnabled, runtime, toolchain])

  const nextMoves = useMemo(() => {
    const moves = [
      ...runtime.environmentDiagnostics
        .filter((item) => item.status !== 'live')
        .map((item) => item.action),
      ...runtime.troubleshooting,
    ]
    if (!heliusMcpEnabled) {
      moves.unshift('Enable the Helius MCP in this project so runtime checks, indexed data, and future DAEMON actions stay project-aware.')
    }
    if (moves.length === 0) {
      moves.push('The base runtime is coherent. The next integration step is extending this same runtime into swaps, protocol adapters, and generated project files.')
    }

    return moves.slice(0, 3)
  }, [heliusMcpEnabled, runtime.troubleshooting])

  return (
    <div className="solana-daemon-runtime">
      <div className="solana-ecosystem-header">
        <div>
          <div className="solana-token-launch-kicker">DAEMON Runtime</div>
          <h3 className="solana-token-launch-title">What DAEMON should own for Solana projects</h3>
          <p className="solana-token-launch-copy">
            This is the user-facing runtime contract inside DAEMON. Project scaffolds, wallet flows, token launches,
            and future protocol tools should all follow the same transport, wallet, execution, and monitoring path.
          </p>
        </div>
      </div>

      <div className="solana-daemon-runtime-grid">
        {modules.map((module) => (
          <section key={module.id} className="solana-daemon-runtime-card">
            <div className="solana-runtime-title-row">
              <span className="solana-runtime-label">{module.label}</span>
              <span className={`solana-runtime-status ${module.status}`}>
                {module.status === 'live' ? 'Live' : module.status === 'partial' ? 'Partial' : 'Needs Setup'}
              </span>
            </div>
            <div className="solana-runtime-value">{module.value}</div>
            <div className="solana-runtime-detail">{module.detail}</div>
            <div className="solana-daemon-runtime-owned">
              <span className="solana-daemon-runtime-owned-label">DAEMON owns</span>
              <span>{module.ownedByDaemon}</span>
            </div>
          </section>
        ))}
      </div>

      {runtime.environmentDiagnostics.length > 0 && (
        <div className="solana-runtime-coverage">
          <div className="solana-runtime-title">Environment Diagnostics</div>
          <div className="solana-runtime-coverage-list">
            {runtime.environmentDiagnostics.map((item) => (
              <div key={item.id} className="solana-runtime-coverage-row">
                <div className="solana-runtime-coverage-main">
                  <div className="solana-runtime-coverage-label-row">
                    <span className="solana-runtime-coverage-label">{item.label}</span>
                    <span className={`solana-runtime-status ${item.status}`}>
                      {item.status === 'live' ? 'Ready' : item.status === 'partial' ? 'Fallback' : 'Missing'}
                    </span>
                  </div>
                  <div className="solana-runtime-coverage-detail">{item.detail}</div>
                  <div className="solana-runtime-actions">
                    {item.status !== 'live' && (() => {
                      const guide = getSolanaToolingGuide(item.id, {
                        avmInstalled: toolchain?.avm.installed,
                        hasProject: Boolean(projectPath),
                      })
                      if (!guide.installCommand || !guide.installLabel) return null
                      return (
                        <button
                          type="button"
                          className="sol-btn green"
                          onClick={() => void handleRunCommand(guide.installCommand!, guide.installLabel!)}
                        >
                          {guide.installLabel}
                        </button>
                      )
                    })()}
                    <button
                      type="button"
                      className="sol-btn secondary"
                      onClick={() => {
                        const guide = getSolanaToolingGuide(item.id, {
                          avmInstalled: toolchain?.avm.installed,
                          hasProject: Boolean(projectPath),
                        })
                        void window.daemon.shell.openExternal(guide.docsUrl)
                      }}
                    >
                      {getSolanaToolingGuide(item.id, {
                        avmInstalled: toolchain?.avm.installed,
                        hasProject: Boolean(projectPath),
                      }).docsLabel}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.actionMessage && <div className="solana-toolchain-feedback">{state.actionMessage}</div>}

      <div className="solana-daemon-runtime-next">
        <div className="solana-runtime-title">Next Recommended Moves</div>
        <div className="solana-daemon-runtime-next-list">
          {nextMoves.map((move) => (
            <div key={move} className="solana-daemon-runtime-next-item">
              <span className="sol-dot amber" />
              <span>{move}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

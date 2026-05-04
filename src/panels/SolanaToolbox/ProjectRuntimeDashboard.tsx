import { useEffect, useMemo, useState } from 'react'
import { getSolanaRuntimeBlockers } from '../../../electron/shared/solanaRuntime'
import type { SolanaMcpEntry, SolanaProjectInfo, SolanaToolchainStatus, ValidatorState } from '../../store/solanaToolbox'

interface ProjectRuntimeDashboardProps {
  projectPath: string | null
  projectInfo: SolanaProjectInfo | null
  toolchain: SolanaToolchainStatus | null
  validator: ValidatorState
  mcps: SolanaMcpEntry[]
}

function basename(value: string | null): string {
  if (!value) return 'No project selected'
  const normalized = value.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() ?? value
}

function frameworkLabel(info: SolanaProjectInfo | null): string {
  if (!info?.isSolanaProject) return 'Not detected'
  if (info.framework === 'anchor') return 'Anchor program'
  if (info.framework === 'native') return 'Native Solana program'
  if (info.framework === 'client-only') return 'Client app'
  return 'Solana project'
}

function statusLabel(status: SolanaRuntimeStatusLevel | undefined): string {
  if (status === 'live') return 'Ready'
  if (status === 'partial') return 'Partial'
  return 'Needs Setup'
}

function statusClass(status: SolanaRuntimeStatusLevel | undefined): string {
  return status ?? 'setup'
}

function toolchainReadyCount(toolchain: SolanaToolchainStatus | null): number {
  if (!toolchain) return 0
  return [
    toolchain.solanaCli.installed,
    toolchain.anchor.installed,
    toolchain.avm.installed,
    toolchain.surfpool.installed,
    toolchain.testValidator.installed,
    toolchain.litesvm.installed,
  ].filter(Boolean).length
}

export function ProjectRuntimeDashboard({ projectPath, projectInfo, toolchain, validator, mcps }: ProjectRuntimeDashboardProps) {
  const [runtime, setRuntime] = useState<SolanaRuntimeStatusSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.daemon.settings.getSolanaRuntimeStatus().then((res) => {
      if (cancelled || !res.ok || !res.data) return
      setRuntime(res.data)
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const runtimeProfile = projectInfo?.runtime
  const enabledMcps = mcps.filter((mcp) => mcp.enabled).length
  const blockers = useMemo(() => (
    runtime ? getSolanaRuntimeBlockers(runtime, 'scaffolds') : []
  ), [runtime])
  const projectSignals = [
    runtimeProfile?.files.anchorToml ? 'Anchor.toml' : null,
    runtimeProfile?.files.programsDir ? 'programs/' : null,
    runtimeProfile?.files.targetIdlDir ? 'target/idl' : null,
    runtimeProfile?.files.surfpoolToml ? 'Surfpool.toml' : null,
    runtimeProfile?.tests.litesvm ? 'LiteSVM' : null,
    runtimeProfile?.tests.anchorTests ? 'Anchor tests' : null,
  ].filter(Boolean)
  const localEndpoint = validator.status === 'running' && validator.port ? `http://127.0.0.1:${validator.port}` : 'Stopped'

  return (
    <section className="solana-project-runtime">
      <div className="solana-ecosystem-header">
        <div>
          <div className="solana-token-launch-kicker">Project Runtime Dashboard</div>
          <h3 className="solana-token-launch-title">One view for this Solana project</h3>
          <p className="solana-token-launch-copy">
            DAEMON is joining project detection, local runtime, provider readiness, wallet path, and program inventory into one IDE surface.
          </p>
        </div>
      </div>

      <div className="solana-project-runtime-grid">
        <section className="solana-project-runtime-card wide">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Project</span>
            <span className={`solana-runtime-status ${projectInfo?.isSolanaProject ? 'live' : 'setup'}`}>
              {projectInfo?.isSolanaProject ? 'Detected' : 'Open Project'}
            </span>
          </div>
          <div className="solana-runtime-value">{basename(projectPath)}</div>
          <div className="solana-runtime-detail">{frameworkLabel(projectInfo)}</div>
          <div className="solana-project-runtime-tags">
            {(projectSignals.length ? projectSignals : projectInfo?.indicators ?? []).slice(0, 8).map((signal) => (
              <span key={signal} className="solana-project-runtime-tag">{signal}</span>
            ))}
          </div>
        </section>

        <section className="solana-project-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Cluster</span>
            <span className="solana-runtime-status partial">{runtimeProfile?.packageManager ?? 'local'}</span>
          </div>
          <div className="solana-runtime-value">{runtimeProfile?.cluster ?? 'Not pinned'}</div>
          <div className="solana-runtime-detail">
            {runtimeProfile?.providerWallet ? `Provider wallet: ${runtimeProfile.providerWallet}` : 'No Anchor provider wallet detected yet.'}
          </div>
        </section>

        <section className="solana-project-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Runtime Route</span>
            <span className={`solana-runtime-status ${statusClass(runtime?.executionBackend.status)}`}>
              {statusLabel(runtime?.executionBackend.status)}
            </span>
          </div>
          <div className="solana-runtime-value">{runtime?.executionPath?.label ?? runtime?.executionBackend.label ?? 'Runtime pending'}</div>
          <div className="solana-runtime-detail">{runtime?.rpc.label ?? 'RPC not loaded'} · {runtime?.walletPath.label ?? 'Wallet path pending'} · {runtime?.swapEngine.label ?? 'Swap path pending'}</div>
        </section>

        <section className="solana-project-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Programs</span>
            <span className={`solana-runtime-status ${runtimeProfile?.programs.length ? 'live' : 'setup'}`}>
              {runtimeProfile?.programs.length ?? 0}
            </span>
          </div>
          <div className="solana-project-program-list">
            {(runtimeProfile?.programs.length ? runtimeProfile.programs : []).slice(0, 3).map((program) => (
              <div key={`${program.cluster}:${program.name}:${program.address}`} className="solana-project-program-row">
                <span>{program.name}</span>
                <code>{program.address.slice(0, 6)}...{program.address.slice(-4)}</code>
              </div>
            ))}
            {!runtimeProfile?.programs.length && <div className="solana-runtime-detail">No program IDs or IDL addresses detected.</div>}
          </div>
        </section>

        <section className="solana-project-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Local Runtime</span>
            <span className={`solana-runtime-status ${validator.status === 'running' ? 'live' : validator.status === 'error' ? 'setup' : 'partial'}`}>
              {validator.status === 'running' ? 'Running' : validator.status}
            </span>
          </div>
          <div className="solana-runtime-value">{localEndpoint}</div>
          <div className="solana-runtime-detail">
            {validator.type === 'surfpool' ? 'Surfpool local fork runtime' : validator.type === 'test-validator' ? 'solana-test-validator runtime' : 'Start Surfpool or test-validator for local execution.'}
          </div>
        </section>

        <section className="solana-project-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">IDE Coverage</span>
            <span className="solana-runtime-status partial">{toolchainReadyCount(toolchain)}/6 tools</span>
          </div>
          <div className="solana-runtime-value">{enabledMcps} MCPs enabled</div>
          <div className="solana-runtime-detail">
            {runtimeProfile?.scripts.length ? `${runtimeProfile.scripts.length} Solana scripts detected.` : 'No Solana build/test/deploy scripts detected yet.'}
          </div>
        </section>
      </div>

      {(blockers.length > 0 || runtimeProfile?.idls.length || runtimeProfile?.scripts.length) && (
        <div className="solana-project-runtime-lists">
          {blockers.length > 0 && (
            <div className="solana-project-runtime-list">
              <div className="solana-runtime-title">Current Runtime Gaps</div>
              {blockers.slice(0, 4).map((blocker) => (
                <div key={blocker} className="solana-daemon-runtime-next-item">
                  <span className="sol-dot amber" />
                  <span>{blocker}</span>
                </div>
              ))}
            </div>
          )}
          {runtimeProfile?.idls.length ? (
            <div className="solana-project-runtime-list">
              <div className="solana-runtime-title">IDL Inventory</div>
              {runtimeProfile.idls.slice(0, 4).map((idl) => (
                <div key={idl.path} className="solana-project-program-row">
                  <span>{idl.name}</span>
                  <code>{idl.address ? `${idl.address.slice(0, 6)}...${idl.address.slice(-4)}` : 'address pending'}</code>
                </div>
              ))}
            </div>
          ) : null}
          {runtimeProfile?.scripts.length ? (
            <div className="solana-project-runtime-list">
              <div className="solana-runtime-title">Project Commands</div>
              {runtimeProfile.scripts.slice(0, 4).map((script) => (
                <div key={script.name} className="solana-project-script-row">
                  <span>{script.name}</span>
                  <code>{script.command}</code>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

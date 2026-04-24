import { useEffect, useState } from 'react'
import { useUIStore } from '../../store/ui'

interface RuntimeStackState {
  runtime: SolanaRuntimeStatusSummary | null
  infrastructure: WalletInfrastructureSettings | null
  actionMessage: string | null
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

function statusTone(status: SolanaRuntimeStatusLevel) {
  return status === 'live' ? 'native' : status === 'partial' ? 'guided' : 'external'
}

export function RuntimeStackSection() {
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const [state, setState] = useState<RuntimeStackState>({
    runtime: null,
    infrastructure: null,
    actionMessage: null,
  })

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      window.daemon.settings.getSolanaRuntimeStatus(),
      window.daemon.settings.getWalletInfrastructureSettings(),
    ]).then(([runtimeRes, infrastructureRes]) => {
      if (cancelled) return
      setState({
        runtime: runtimeRes.ok && runtimeRes.data ? runtimeRes.data : DEFAULT_RUNTIME,
        infrastructure: infrastructureRes.ok && infrastructureRes.data ? infrastructureRes.data : null,
        actionMessage: null,
      })
    }).catch(() => {
      if (cancelled) return
      setState({
        runtime: DEFAULT_RUNTIME,
        infrastructure: null,
        actionMessage: null,
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const runtime = state.runtime ?? DEFAULT_RUNTIME
  const infrastructure = state.infrastructure

  async function handleSaveInfrastructure(next: WalletInfrastructureSettings, message: string) {
    const saveRes = await window.daemon.settings.setWalletInfrastructureSettings(next)
    if (!saveRes.ok) {
      setState((prev) => ({ ...prev, actionMessage: saveRes.error ?? 'Could not update wallet infrastructure.' }))
      return
    }
    setState((prev) => ({
      ...prev,
      infrastructure: next,
      runtime: prev.runtime
        ? {
            ...prev.runtime,
            walletPath: {
              ...prev.runtime.walletPath,
              label: next.preferredWallet === 'phantom' ? 'Phantom-first' : 'Wallet Standard',
              detail: next.preferredWallet === 'phantom'
                ? 'Optimize flows for Phantom Connect, with Solana wallet UX anchored around Phantom-first handoff.'
                : 'Prefer the multi-wallet compatibility path for Backpack, Solflare, and other Wallet Standard clients.',
            },
            executionBackend: {
              ...prev.runtime.executionBackend,
              label: next.executionMode === 'jito' ? 'Shared Jito executor' : 'Shared RPC executor',
              detail: next.executionMode === 'jito'
                ? `DAEMON routes wallet sends, swaps, launches, and recovery flows through the Jito-backed executor. ${next.jitoBlockEngineUrl}`
                : 'DAEMON routes wallet sends, swaps, launches, Pump.fun actions, and recovery flows through one shared RPC executor with shared confirmation behavior.',
            },
          }
        : prev.runtime,
      actionMessage: message,
    }))
  }

  return (
    <div className="solana-runtime-stack">
      <div className="solana-ecosystem-header">
        <div>
          <div className="solana-token-launch-kicker">Runtime Stack</div>
          <h3 className="solana-token-launch-title">What DAEMON will actually use right now</h3>
          <p className="solana-token-launch-copy">
            This view now comes from a backend Solana runtime summary instead of frontend guesses, so the Toolbox is reflecting the actual DAEMON runtime state.
          </p>
        </div>
      </div>

      <div className="solana-runtime-grid">
        <section className="solana-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">RPC</span>
            <span className={`solana-ecosystem-status ${statusTone(runtime.rpc.status)}`}>
              {runtime.rpc.label}
            </span>
          </div>
          <div className="solana-runtime-value">{runtime.rpc.label}</div>
          <div className="solana-runtime-detail">{runtime.rpc.detail}</div>
          {runtime.rpc.status !== 'live' && (
            <div className="solana-runtime-actions">
              <button
                type="button"
                className="sol-btn green"
                onClick={() => openWorkspaceTool(infrastructure?.rpcProvider === 'helius' ? 'env' : 'wallet')}
              >
                {infrastructure?.rpcProvider === 'helius' ? 'Open Env' : 'Open Wallet Infra'}
              </button>
            </div>
          )}
        </section>

        <section className="solana-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Wallet Path</span>
            <span className={`solana-ecosystem-status ${statusTone(runtime.walletPath.status)}`}>
              {runtime.walletPath.label}
            </span>
          </div>
          <div className="solana-runtime-value">{runtime.walletPath.label}</div>
          <div className="solana-runtime-detail">{runtime.walletPath.detail}</div>
          {infrastructure && infrastructure.preferredWallet !== 'phantom' && (
            <div className="solana-runtime-actions">
              <button
                type="button"
                className="sol-btn green"
                onClick={() => void handleSaveInfrastructure(
                  { ...infrastructure, preferredWallet: 'phantom' },
                  'Phantom-first wallet flow saved for the shared Solana runtime.',
                )}
              >
                Set Phantom-first
              </button>
              <button type="button" className="sol-btn" onClick={() => openWorkspaceTool('wallet')}>
                Open Wallet Infra
              </button>
            </div>
          )}
        </section>

        <section className="solana-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Swap Engine</span>
            <span className={`solana-ecosystem-status ${statusTone(runtime.swapEngine.status)}`}>
              {runtime.swapEngine.status === 'live' ? 'Ready' : runtime.swapEngine.status === 'partial' ? 'Partial' : 'Needs Setup'}
            </span>
          </div>
          <div className="solana-runtime-value">{runtime.swapEngine.label}</div>
          <div className="solana-runtime-detail">{runtime.swapEngine.detail}</div>
          {runtime.swapEngine.status !== 'live' && (
            <div className="solana-runtime-actions">
              <button type="button" className="sol-btn green" onClick={() => openWorkspaceTool('wallet')}>
                Open Wallet Infra
              </button>
            </div>
          )}
        </section>

        <section className="solana-runtime-card">
          <div className="solana-runtime-title-row">
            <span className="solana-runtime-label">Execution Backend</span>
            <span className={`solana-ecosystem-status ${statusTone(runtime.executionBackend.status)}`}>
              {runtime.executionBackend.label.includes('Jito') ? 'Jito' : 'RPC'}
            </span>
          </div>
          <div className="solana-runtime-value">{runtime.executionBackend.label}</div>
          <div className="solana-runtime-detail">{runtime.executionBackend.detail}</div>
          {infrastructure && (
            <div className="solana-runtime-actions">
              {infrastructure.executionMode === 'jito' && infrastructure.rpcProvider === 'public' && (
                <button
                  type="button"
                  className="sol-btn green"
                  onClick={() => void handleSaveInfrastructure(
                    { ...infrastructure, executionMode: 'rpc' },
                    'Execution mode switched back to standard RPC for the shared Solana runtime.',
                  )}
                >
                  Use Standard RPC
                </button>
              )}
              <button type="button" className="sol-btn" onClick={() => openWorkspaceTool('wallet')}>
                Open Wallet Infra
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="solana-runtime-coverage">
        <div className="solana-runtime-title">Execution Coverage</div>
        <div className="solana-runtime-coverage-list">
          {runtime.executionCoverage.map((item) => (
            <div key={item.label} className="solana-runtime-coverage-row">
              <div className="solana-runtime-coverage-main">
                <div className="solana-runtime-coverage-label-row">
                  <span className="solana-runtime-coverage-label">{item.label}</span>
                  <span className={`solana-runtime-status ${item.status}`}>
                    {item.status === 'live' ? 'On Shared Executor' : item.status === 'partial' ? 'Partial' : 'Needs Setup'}
                  </span>
                </div>
                <div className="solana-runtime-coverage-detail">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {runtime.troubleshooting.length > 0 && (
        <div className="solana-runtime-troubleshooting">
          <div className="solana-runtime-title">Troubleshooting</div>
          {runtime.troubleshooting.map((item) => (
            <div key={item} className="solana-runtime-warning">{item}</div>
          ))}
        </div>
      )}

      {state.actionMessage && <div className="solana-toolchain-feedback">{state.actionMessage}</div>}
    </div>
  )
}

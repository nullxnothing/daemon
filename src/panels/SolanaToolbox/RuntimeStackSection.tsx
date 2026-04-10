import { useEffect, useState } from 'react'

interface RuntimeStackState {
  runtime: SolanaRuntimeStatusSummary | null
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
  executionCoverage: [],
  troubleshooting: [],
}

function statusTone(status: SolanaRuntimeStatusLevel) {
  return status === 'live' ? 'native' : status === 'partial' ? 'guided' : 'external'
}

export function RuntimeStackSection() {
  const [state, setState] = useState<RuntimeStackState>({
    runtime: null,
  })

  useEffect(() => {
    let cancelled = false

    void window.daemon.settings.getSolanaRuntimeStatus().then((runtimeRes) => {
      if (cancelled) return
      setState({
        runtime: runtimeRes.ok && runtimeRes.data ? runtimeRes.data : DEFAULT_RUNTIME,
      })
    }).catch(() => {
      if (cancelled) return
      setState({
        runtime: DEFAULT_RUNTIME,
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const runtime = state.runtime ?? DEFAULT_RUNTIME

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
    </div>
  )
}

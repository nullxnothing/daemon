import { useEffect, useMemo, useState } from 'react'
import { daemon } from '../../lib/daemonBridge'
import {
  buildSolanaToolboxReadiness,
  type SolanaReadinessActionTarget,
} from '../../lib/solanaReadiness'
import type {
  SolanaMcpEntry,
  SolanaProjectInfo,
  SolanaToolchainStatus,
  ValidatorState,
} from '../../store/solanaToolbox'

interface SolanaReadinessStripProps {
  activeProjectPath: string | null
  activeProjectId: string | null
  projectInfo: SolanaProjectInfo | null
  toolchain: SolanaToolchainStatus | null
  validator: ValidatorState
  mcps: SolanaMcpEntry[]
  onAction: (target: SolanaReadinessActionTarget) => void
}

interface RuntimeSnapshot {
  settings: WalletInfrastructureSettings | null
  activeWallet: { id: string; name: string; address: string } | null
  signerReady: boolean | null
  hasHeliusKey: boolean
  hasJupiterKey: boolean
  isLoadingRuntime: boolean
  runtimeError: string | null
}

const INITIAL_RUNTIME_SNAPSHOT: RuntimeSnapshot = {
  settings: null,
  activeWallet: null,
  signerReady: null,
  hasHeliusKey: false,
  hasJupiterKey: false,
  isLoadingRuntime: true,
  runtimeError: null,
}

export function SolanaReadinessStrip(props: SolanaReadinessStripProps) {
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RuntimeSnapshot>(INITIAL_RUNTIME_SNAPSHOT)

  useEffect(() => {
    let cancelled = false

    async function loadRuntimeSnapshot() {
      setRuntimeSnapshot((snapshot) => ({ ...snapshot, isLoadingRuntime: true, runtimeError: null }))

      try {
        const [settingsRes, dashboardRes, heliusRes, jupiterRes] = await Promise.all([
          daemon.settings.getWalletInfrastructureSettings(),
          daemon.wallet.dashboard(props.activeProjectId),
          daemon.wallet.hasHeliusKey(),
          daemon.wallet.hasJupiterKey(),
        ])

        const activeWallet = dashboardRes.ok && dashboardRes.data?.activeWallet
          ? {
            id: dashboardRes.data.activeWallet.id,
            name: dashboardRes.data.activeWallet.name,
            address: dashboardRes.data.activeWallet.address,
          }
          : null

        const signerRes = activeWallet ? await daemon.wallet.hasKeypair(activeWallet.id) : null

        if (cancelled) return
        setRuntimeSnapshot({
          settings: settingsRes.ok ? settingsRes.data ?? null : null,
          activeWallet,
          signerReady: signerRes ? Boolean(signerRes.ok && signerRes.data) : null,
          hasHeliusKey: Boolean(heliusRes.ok && heliusRes.data),
          hasJupiterKey: Boolean(jupiterRes.ok && jupiterRes.data),
          isLoadingRuntime: false,
          runtimeError: settingsRes.ok ? null : settingsRes.error ?? 'Runtime settings unavailable',
        })
      } catch (err) {
        if (cancelled) return
        setRuntimeSnapshot({
          ...INITIAL_RUNTIME_SNAPSHOT,
          isLoadingRuntime: false,
          runtimeError: err instanceof Error ? err.message : 'Runtime readiness unavailable',
        })
      }
    }

    void loadRuntimeSnapshot()
    return () => {
      cancelled = true
    }
  }, [props.activeProjectId])

  const model = useMemo(() => buildSolanaToolboxReadiness({
    activeProjectPath: props.activeProjectPath,
    projectInfo: props.projectInfo,
    toolchain: props.toolchain,
    validator: props.validator,
    mcps: props.mcps,
    ...runtimeSnapshot,
  }), [
    props.activeProjectPath,
    props.projectInfo,
    props.toolchain,
    props.validator,
    props.mcps,
    runtimeSnapshot,
  ])

  return (
    <section className="solana-readiness-strip" aria-label="Solana readiness">
      <div className="solana-readiness-summary">
        <div>
          <div className="solana-token-launch-kicker">Setup Status</div>
          <h2 className="solana-readiness-title">{model.headline}</h2>
          <p className="solana-readiness-copy">{model.description}</p>
        </div>
        <div className="solana-readiness-score" aria-label={`${model.readyCount} of ${model.totalCount} checks ready`}>
          <span>{model.readyCount}</span>
          <span>/</span>
          <span>{model.totalCount}</span>
        </div>
        {model.nextAction && (
          <button
            type="button"
            className="sol-btn green"
            onClick={() => props.onAction(model.nextAction!.target)}
          >
            {model.nextAction.label}
          </button>
        )}
      </div>

      <div className="solana-readiness-grid">
        {model.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`solana-readiness-item ${item.status}`}
            onClick={() => item.action && props.onAction(item.action.target)}
            disabled={!item.action}
          >
            <div className="solana-readiness-item-top">
              <span className={`sol-dot ${getDotColor(item.status)}`} />
              <span className="solana-readiness-label">{item.label}</span>
              <span className="solana-readiness-status">{getStatusLabel(item.status)}</span>
            </div>
            <div className="solana-readiness-value">{item.value}</div>
            <div className="solana-readiness-detail">{item.detail}</div>
          </button>
        ))}
      </div>
    </section>
  )
}

function getDotColor(status: string): 'green' | 'amber' | 'red' | 'blue' | 'grey' {
  if (status === 'ready') return 'green'
  if (status === 'warning') return 'amber'
  if (status === 'blocked' || status === 'missing') return 'red'
  if (status === 'info') return 'blue'
  return 'grey'
}

function getStatusLabel(status: string): string {
  if (status === 'ready') return 'Ready'
  if (status === 'warning') return 'Warning'
  if (status === 'blocked') return 'Blocked'
  if (status === 'missing') return 'Setup'
  return 'Info'
}

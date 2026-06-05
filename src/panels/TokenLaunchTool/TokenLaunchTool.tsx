import { useCallback, useEffect, useState, lazy, Suspense } from 'react'
import { TokenLaunchSection } from '../SolanaToolbox/TokenLaunchSection'
import { LaunchpadSettingsSection } from '../SolanaToolbox/LaunchpadSettingsSection'
import { TokenLauncher } from '../../components/TokenLauncher/TokenLauncher'
import { Surface } from '../../components/Panel'
import { PackHostShell } from '../../components/PackHostShell/PackHostShell'
import { useUIStore } from '../../store/ui'
import '../_solana/solanaSurface.css'
import './TokenLaunchTool.css'

const ProofPoolPanel = lazy(() => import('../ProofPool/ProofPoolPanel').then((m) => ({ default: m.ProofPoolPanel })))
const ClawpumpPanel = lazy(() => import('../Clawpump/ClawpumpPanel').then((m) => ({ default: m.ClawpumpPanel })))
const FlywheelPanel = lazy(() => import('../Flywheel/FlywheelPanel').then((m) => ({ default: m.FlywheelPanel })))
const DegenToolsPanel = lazy(() => import('../DegenTools/DegenToolsPanel').then((m) => ({ default: m.DegenToolsPanel })))

const LAUNCH_TABS = [
  { id: 'launch', label: 'Launch' },
  { id: 'proof-pool', label: 'Proof Pool' },
  { id: 'clawpump', label: 'ClawPump' },
  { id: 'flywheel', label: 'Flywheel' },
  { id: 'degentools', label: 'DegenTools' },
] as const
type LaunchView = (typeof LAUNCH_TABS)[number]['id']

const STREAMLOCK_URL = 'https://app.streamlock.fun/'

export function TokenLaunchTool() {
  const [launchpadRefreshNonce, setLaunchpadRefreshNonce] = useState(0)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [cluster, setCluster] = useState<WalletInfrastructureSettings['cluster']>('devnet')
  const [recentCount, setRecentCount] = useState(0)
  const [showConfig, setShowConfig] = useState(false)
  const [view, setView] = useState<LaunchView>('launch')
  const pendingSubView = useUIStore((state) => state.pendingSubView)
  const setPendingSubView = useUIStore((state) => state.setPendingSubView)

  useEffect(() => {
    if (!pendingSubView) return
    if (LAUNCH_TABS.some((t) => t.id === pendingSubView)) {
      setView(pendingSubView as LaunchView)
      setPendingSubView(null)
    }
  }, [pendingSubView, setPendingSubView])

  const openStreamlock = useCallback(() => { void window.daemon.shell.openExternal(STREAMLOCK_URL) }, [])
  const openWorkspaceTool = useUIStore((state) => state.openWorkspaceTool)
  const refresh = useCallback(() => setLaunchpadRefreshNonce((n) => n + 1), [])

  useEffect(() => {
    void (async () => {
      const [walletRes, infraRes] = await Promise.all([
        window.daemon.wallet.list(),
        window.daemon.settings.getWalletInfrastructureSettings(),
      ])
      if (infraRes.ok && infraRes.data) setCluster(infraRes.data.cluster)
      if (walletRes.ok && walletRes.data) {
        const list = walletRes.data as Array<{ id: string; is_default?: number }>
        if (list.length > 0) {
          const def = (list.find((w) => w.is_default) ?? list[0]).id
          setWalletId(def)
          const tokens = await window.daemon.launch.listTokens(def)
          if (tokens.ok && tokens.data) setRecentCount(tokens.data.length)
        }
      }
    })()
  }, [launchpadRefreshNonce])

  return (
    <PackHostShell
      kicker="Launch pack"
      title="Token Launch"
      subtitle="Launch on live launchpads, pool backers, and wire creator-fee flywheels."
      actions={view === 'launch' ? (
        <>
          <button className="solx-btn solx-btn--ghost" onClick={refresh}>Refresh</button>
          <button className="solx-btn" onClick={openStreamlock}>Open Streamlock</button>
        </>
      ) : undefined}
      tabs={LAUNCH_TABS.map((t) => ({ id: t.id, label: t.label }))}
      activeId={view}
      onChange={setView}
    >
      {view === 'launch' && (
      <div className="sol-scroll">
        <div className="sol-scroll-inner">

          {/* fused KPI strip */}
          <div className="sol-kstrip">
            <div className="sol-kcell"><span className="sol-kk">Launch path</span><span className="sol-kv">Streamlock</span><span className="sol-km">hosted · external</span></div>
            <div className="sol-kcell"><span className="sol-kk">Live launchpads</span><span className="sol-kv">2</span><span className="sol-km">Streamlock · Pump.fun</span></div>
            <div className="sol-kcell"><span className="sol-kk">Recent launches</span><span className="sol-kv">{recentCount}</span><span className="sol-km">wallet-linked history</span></div>
            <div className="sol-kcell"><span className="sol-kk">Protocol config</span><span className="sol-kv sol-kv--amber">Planned</span><span className="sol-km">2 adapters need setup</span></div>
          </div>

          <nav className="tlt-journey" aria-label="Launch journey">
            <div className="tlt-journey-copy">
              <span className="sol-eyebrow">First 60 seconds</span>
              <strong>Launch, build assets, wire fees, then watch the token.</strong>
            </div>
            <div className="tlt-journey-actions">
              <button type="button" className="solx-btn solx-btn--ghost" onClick={() => openWorkspaceTool('degentools')}>DegenTools</button>
              <button type="button" className="solx-btn solx-btn--ghost" onClick={() => openWorkspaceTool('flywheel')}>Flywheel</button>
              <button type="button" className="solx-btn solx-btn--ghost" onClick={() => openWorkspaceTool('dashboard')}>Dashboard</button>
              <button type="button" className="solx-btn solx-btn--ghost" onClick={() => openWorkspaceTool('project-readiness')}>Solana Start</button>
            </div>
          </nav>

          {/* quick pump.fun launcher */}
          <section className="sol-section">
            <div className="sol-section-head">
              <span className="sol-eyebrow">Step 1 · Pump.fun launch</span>
            </div>
            <Surface padding="md" className="tlt-launcher">
              <TokenLauncher walletId={walletId} cluster={cluster} showLabel={false} />
            </Surface>
          </section>

          {/* launchpads + history + pulse (segmented) */}
          <section className="sol-section">
            <div className="sol-section-head">
              <span className="sol-eyebrow">Step 2 · Launchpads &amp; feeds</span>
            </div>
            <TokenLaunchSection refreshNonce={launchpadRefreshNonce} embedded onRefreshRequested={refresh} />
          </section>

          {/* protocol config — collapsed by default (rarely touched setup) */}
          <section className="sol-section">
            <button
              type="button"
              className="tlt-disclosure"
              aria-expanded={showConfig}
              onClick={() => setShowConfig((v) => !v)}
            >
              <span className="sol-eyebrow">Configure adapters</span>
              <span className={`tlt-chevron${showConfig ? ' open' : ''}`} aria-hidden>▸</span>
            </button>
            {showConfig && (
              <LaunchpadSettingsSection embedded onSettingsSaved={refresh} />
            )}
          </section>
        </div>
      </div>
      )}

      {view === 'proof-pool' && (
        <Suspense fallback={<div className="sol-scroll" />}><ProofPoolPanel /></Suspense>
      )}
      {view === 'clawpump' && (
        <Suspense fallback={<div className="sol-scroll" />}><ClawpumpPanel /></Suspense>
      )}
      {view === 'flywheel' && (
        <Suspense fallback={<div className="sol-scroll" />}><FlywheelPanel /></Suspense>
      )}
      {view === 'degentools' && (
        <Suspense fallback={<div className="sol-scroll" />}><DegenToolsPanel /></Suspense>
      )}
    </PackHostShell>
  )
}

export default TokenLaunchTool

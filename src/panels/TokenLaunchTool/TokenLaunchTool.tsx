import { useCallback, useEffect, useState } from 'react'
import { TokenLaunchSection } from '../SolanaToolbox/TokenLaunchSection'
import { LaunchpadSettingsSection } from '../SolanaToolbox/LaunchpadSettingsSection'
import { TokenLauncher } from '../../components/TokenLauncher/TokenLauncher'
import { Surface } from '../../components/Panel'
import '../_solana/solanaSurface.css'
import './TokenLaunchTool.css'

const STREAMLOCK_URL = 'https://app.streamlock.fun/'

export function TokenLaunchTool() {
  const [launchpadRefreshNonce, setLaunchpadRefreshNonce] = useState(0)
  const [walletId, setWalletId] = useState<string | null>(null)
  const [cluster, setCluster] = useState<WalletInfrastructureSettings['cluster']>('devnet')
  const [recentCount, setRecentCount] = useState(0)
  const [showConfig, setShowConfig] = useState(false)

  const openStreamlock = useCallback(() => { void window.daemon.shell.openExternal(STREAMLOCK_URL) }, [])
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
    <div className="sol-panel token-launch-tool">
      <div className="sol-scroll">
        <div className="sol-scroll-inner">
          {/* header */}
          <div className="tlt-head">
            <div>
              <span className="sol-eyebrow">Launch Center</span>
              <h1 className="tlt-title">Token Launch</h1>
              <p className="tlt-sub">Launch through a live launchpad while DAEMON keeps adapters, launch history, and token feeds nearby.</p>
            </div>
            <div className="sol-actions">
              <button className="solx-btn solx-btn--ghost" onClick={refresh}>Refresh</button>
              <button className="solx-btn" onClick={openStreamlock}>Open Streamlock</button>
            </div>
          </div>

          {/* fused KPI strip */}
          <div className="sol-kstrip">
            <div className="sol-kcell"><span className="sol-kk">Launch path</span><span className="sol-kv">Streamlock</span><span className="sol-km">hosted · external</span></div>
            <div className="sol-kcell"><span className="sol-kk">Live launchpads</span><span className="sol-kv">2</span><span className="sol-km">Streamlock · Pump.fun</span></div>
            <div className="sol-kcell"><span className="sol-kk">Recent launches</span><span className="sol-kv">{recentCount}</span><span className="sol-km">wallet-linked history</span></div>
            <div className="sol-kcell"><span className="sol-kk">Protocol config</span><span className="sol-kv sol-kv--amber">Planned</span><span className="sol-km">2 adapters need setup</span></div>
          </div>

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
    </div>
  )
}

export default TokenLaunchTool

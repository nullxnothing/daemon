import { useMemo, useState } from 'react'
import { LaunchpadSettingsSection } from '../SolanaToolbox/LaunchpadSettingsSection'
import { TokenLaunchSection } from '../SolanaToolbox/TokenLaunchSection'
import { useUIStore } from '../../store/ui'
import '../SolanaToolbox/SolanaToolbox.css'
import './TokenLaunchTool.css'

export function TokenLaunchTool() {
  const [launchpadRefreshNonce, setLaunchpadRefreshNonce] = useState(0)
  const openLaunchWizard = useUIStore((s) => s.openLaunchWizard)

  const highlights = useMemo(() => ([
    {
      label: 'One flow',
      value: 'Launch once',
      detail: 'Wallet pick, preflight, launch, browser handoff.',
    },
    {
      label: 'Post-launch',
      value: 'Stay in DAEMON',
      detail: 'Open Pump tokens in Browser mode immediately after success.',
    },
    {
      label: 'Launchpads',
      value: 'Pump live now',
      detail: 'Raydium and Meteora stay in the same surface as they come online.',
    },
  ]), [])

  return (
    <div className="token-launch-tool">
      <section className="token-launch-tool-hero">
        <div className="token-launch-tool-header">
          <div className="token-launch-tool-header-copy">
            <div className="token-launch-tool-kicker">Launch Center</div>
            <h1 className="token-launch-tool-title">Token Launch</h1>
            <p className="token-launch-tool-copy">
              Launch from one wallet-linked workflow, run preflight before send, and move straight into Browser mode for post-launch work.
            </p>
          </div>

          <div className="token-launch-tool-actions">
            <button className="sol-btn green" onClick={openLaunchWizard}>Launch Token</button>
            <button
              className="sol-btn"
              onClick={() => setLaunchpadRefreshNonce((nonce) => nonce + 1)}
            >
              Refresh Data
            </button>
          </div>
        </div>

        <div className="token-launch-tool-highlight-grid">
          {highlights.map((highlight) => (
            <div key={highlight.label} className="token-launch-tool-highlight">
              <div className="token-launch-tool-highlight-label">{highlight.label}</div>
              <div className="token-launch-tool-highlight-value">{highlight.value}</div>
              <div className="token-launch-tool-highlight-detail">{highlight.detail}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="token-launch-tool-layout">
        <div className="token-launch-tool-main">
          <div className="token-launch-tool-zone token-launch-tool-zone-main">
            <div className="token-launch-tool-zone-head">
              <div>
                <div className="token-launch-tool-zone-kicker">Workflow</div>
                <div className="token-launch-tool-zone-title">Launch, monitor, and hand off from one place</div>
                <p className="token-launch-tool-zone-copy">
                  Use one entry point for launchpad availability, recent launches, and the flow that opens your token in-app after send.
                </p>
              </div>
            </div>
            <TokenLaunchSection
              refreshNonce={launchpadRefreshNonce}
              embedded
              onRefreshRequested={() => setLaunchpadRefreshNonce((nonce) => nonce + 1)}
            />
          </div>
        </div>

        <aside className="token-launch-tool-side">
          <div className="token-launch-tool-zone token-launch-tool-zone-side">
            <div className="token-launch-tool-zone-head">
              <div>
                <div className="token-launch-tool-zone-kicker">Settings</div>
                <div className="token-launch-tool-zone-title">Store protocol settings once</div>
                <p className="token-launch-tool-zone-copy">
                  Keep LaunchLab and DBC config in-app so the launch workflow can resolve readiness without bouncing you out to env setup.
                </p>
              </div>
            </div>
            <LaunchpadSettingsSection
              embedded
              onSettingsSaved={() => setLaunchpadRefreshNonce((nonce) => nonce + 1)}
            />
          </div>

          <div className="token-launch-tool-note">
            <div className="token-launch-tool-note-title">Recommended flow</div>
            <ol className="token-launch-tool-note-list">
              <li>Pick the wallet you want to launch from.</li>
              <li>Run preflight and confirm the launchpad is live.</li>
              <li>Launch once, then open the token in Browser Mode for post-launch work.</li>
            </ol>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default TokenLaunchTool

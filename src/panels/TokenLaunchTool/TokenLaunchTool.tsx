import { useState } from 'react'
import { LaunchpadSettingsSection } from '../SolanaToolbox/LaunchpadSettingsSection'
import { TokenLaunchSection } from '../SolanaToolbox/TokenLaunchSection'
import '../SolanaToolbox/SolanaToolbox.css'
import './TokenLaunchTool.css'

export function TokenLaunchTool() {
  const [launchpadRefreshNonce, setLaunchpadRefreshNonce] = useState(0)

  return (
    <div className="token-launch-tool">
      <div className="token-launch-tool-header">
        <div>
          <div className="token-launch-tool-kicker">Launch Center</div>
          <h1 className="token-launch-tool-title">Token Launch</h1>
          <p className="token-launch-tool-copy">
            Configure launchpads once, launch from one workflow, and keep wallet-linked launch history in one place.
          </p>
        </div>
      </div>

      <div className="token-launch-tool-overview">
        <div className="token-launch-tool-pill">Wallet-linked launches</div>
        <div className="token-launch-tool-pill">Preflight before send</div>
        <div className="token-launch-tool-pill">Pump.live / Raydium / Meteora ready</div>
      </div>

      <div className="token-launch-tool-layout">
        <div className="token-launch-tool-main">
          <div className="token-launch-tool-zone token-launch-tool-zone-main">
            <div className="token-launch-tool-zone-head">
              <div>
                <div className="token-launch-tool-zone-kicker">Launch Workflow</div>
                <div className="token-launch-tool-zone-title">Launch, monitor, and hand off from one place</div>
              </div>
            </div>
            <TokenLaunchSection refreshNonce={launchpadRefreshNonce} />
          </div>
        </div>

        <aside className="token-launch-tool-side">
          <div className="token-launch-tool-zone token-launch-tool-zone-side">
            <div className="token-launch-tool-zone-head">
              <div>
                <div className="token-launch-tool-zone-kicker">Launchpad Config</div>
                <div className="token-launch-tool-zone-title">Store protocol settings once</div>
              </div>
            </div>
            <LaunchpadSettingsSection onSettingsSaved={() => setLaunchpadRefreshNonce((nonce) => nonce + 1)} />
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

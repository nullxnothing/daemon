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

      <div className="token-launch-tool-zone">
        <LaunchpadSettingsSection onSettingsSaved={() => setLaunchpadRefreshNonce((nonce) => nonce + 1)} />
      </div>

      <div className="token-launch-tool-zone">
        <TokenLaunchSection refreshNonce={launchpadRefreshNonce} />
      </div>
    </div>
  )
}

export default TokenLaunchTool

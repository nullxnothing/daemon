import { useCallback, useMemo, useState } from 'react'
import { LaunchpadSettingsSection } from '../SolanaToolbox/LaunchpadSettingsSection'
import { TokenLaunchSection } from '../SolanaToolbox/TokenLaunchSection'
import { Button } from '../../components/Button'
import { Card, MetricCard, PanelHeader, Toolbar } from '../../components/Panel'
import '../SolanaToolbox/SolanaToolbox.css'
import './TokenLaunchTool.css'

const STREAMLOCK_URL = 'https://app.streamlock.fun/'

export function TokenLaunchTool() {
  const [launchpadRefreshNonce, setLaunchpadRefreshNonce] = useState(0)
  const openStreamlock = useCallback(() => {
    void window.daemon.shell.openExternal(STREAMLOCK_URL)
  }, [])

  const highlights = useMemo(() => ([
    {
      label: 'Primary path',
      value: 'Streamlock',
      detail: 'Hosted launch flow opens externally for now.',
    },
    {
      label: 'Post-launch',
      value: 'Stay in DAEMON',
      detail: 'Keep tracking launch history and token feeds here.',
    },
    {
      label: 'Launchpads',
      value: 'Live only',
      detail: 'Pending launchpad rows are hidden from the launch surface.',
    },
  ]), [])

  return (
    <div className="token-launch-tool">
      <PanelHeader
        kicker="Launch Center"
        title="Token Launch"
        subtitle="Open Streamlock for the current hosted launch flow, with DAEMON keeping live adapters, launch history, and token feeds nearby."
        actions={(
          <Toolbar>
            <Button variant="primary" size="md" onClick={openStreamlock}>Open Streamlock</Button>
            <Button
              variant="default"
              size="md"
              onClick={() => setLaunchpadRefreshNonce((nonce) => nonce + 1)}
            >
              Refresh Data
            </Button>
          </Toolbar>
        )}
      />

      <div className="token-launch-tool-body">
        <div className="token-launch-tool-highlight-grid">
          {highlights.map((highlight) => (
            <MetricCard
              key={highlight.label}
              label={highlight.label}
              value={highlight.value}
              detail={highlight.detail}
              size="compact"
            />
          ))}
        </div>

        <Card className="token-launch-tool-zone">
          <div className="token-launch-tool-zone-head">
            <div>
              <div className="token-launch-tool-zone-kicker">Step 1</div>
              <div className="token-launch-tool-zone-title">Choose the launch path</div>
              <p className="token-launch-tool-zone-copy">
                Streamlock is the primary action for now. Existing live DAEMON adapters remain available without showing pending launchpads.
              </p>
            </div>
          </div>
          <TokenLaunchSection
            refreshNonce={launchpadRefreshNonce}
            embedded
            onRefreshRequested={() => setLaunchpadRefreshNonce((nonce) => nonce + 1)}
          />
        </Card>

        <Card className="token-launch-tool-zone">
          <div className="token-launch-tool-zone-head">
            <div>
              <div className="token-launch-tool-zone-kicker">Step 2</div>
              <div className="token-launch-tool-zone-title">Save protocol config once</div>
              <p className="token-launch-tool-zone-copy">
                Keep LaunchLab and DBC config in-app so the launch workflow can resolve readiness without bouncing out to env setup.
              </p>
            </div>
          </div>
          <LaunchpadSettingsSection
            embedded
            onSettingsSaved={() => setLaunchpadRefreshNonce((nonce) => nonce + 1)}
          />
        </Card>

        <Card className="token-launch-tool-note" tone="info">
          <div className="token-launch-tool-note-title">Recommended flow</div>
          <ol className="token-launch-tool-note-list">
            <li>Open Streamlock for the launch flow.</li>
            <li>Return to DAEMON for wallet, token, and post-launch work.</li>
            <li>Use in-app launch adapters only when they are marked live.</li>
          </ol>
        </Card>
      </div>
    </div>
  )
}

export default TokenLaunchTool

import { useMemo, useState } from 'react'
import { LaunchpadSettingsSection } from '../SolanaToolbox/LaunchpadSettingsSection'
import { TokenLaunchSection } from '../SolanaToolbox/TokenLaunchSection'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { Button } from '../../components/Button'
import { Card, MetricCard, PanelHeader, Toolbar } from '../../components/Panel'
import '../SolanaToolbox/SolanaToolbox.css'
import './TokenLaunchTool.css'

export function TokenLaunchTool() {
  const [launchpadRefreshNonce, setLaunchpadRefreshNonce] = useState(0)
  const openLaunchWizard = useWorkflowShellStore((s) => s.openLaunchWizard)

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
      <PanelHeader
        kicker="Launch Center"
        title="Token Launch"
        subtitle="Launch from one wallet-linked workflow, run preflight before send, and move straight into Browser mode for post-launch work."
        actions={(
          <Toolbar>
            <Button variant="primary" size="md" onClick={openLaunchWizard}>Launch Token</Button>
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
              <div className="token-launch-tool-zone-title">Check readiness and recent launches</div>
              <p className="token-launch-tool-zone-copy">
                Keep launchpad status, launch history, and the main launch CTA together so the workflow always has one obvious next action.
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
            <li>Pick the wallet you want to launch from.</li>
            <li>Confirm the launchpad is live and the config is saved.</li>
            <li>Launch once, then open the token in Browser Mode for post-launch work.</li>
          </ol>
        </Card>
      </div>
    </div>
  )
}

export default TokenLaunchTool

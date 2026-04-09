import { useCallback, useEffect, useState } from 'react'
import { useWorkflowShellStore } from '../../store/workflowShell'

function truncateMiddle(value: string, head = 6, tail = 6) {
  if (value.length <= head + tail + 3) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function formatCreatedAt(createdAt: number) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function TokenLaunchSection({
  refreshNonce = 0,
  embedded = false,
  onRefreshRequested,
}: {
  refreshNonce?: number
  embedded?: boolean
  onRefreshRequested?: () => void
}) {
  const launchWizardOpen = useWorkflowShellStore((s) => s.launchWizardOpen)
  const openLaunchWizard = useWorkflowShellStore((s) => s.openLaunchWizard)

  const [launchpads, setLaunchpads] = useState<LaunchpadDefinition[]>([])
  const [launches, setLaunches] = useState<LaunchedToken[]>([])
  const [walletNames, setWalletNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [launchpadsRes, launchesRes] = await Promise.all([
        window.daemon.launch.listLaunchpads(),
        window.daemon.launch.listTokens(),
      ])
      const walletsRes = await window.daemon.wallet.list()
      if (launchpadsRes.ok && launchpadsRes.data) {
        setLaunchpads(launchpadsRes.data)
      }
      if (launchesRes.ok && launchesRes.data) {
        setLaunches(launchesRes.data.slice(0, 6))
      }
      if (walletsRes.ok && walletsRes.data) {
        setWalletNames(Object.fromEntries(walletsRes.data.map((wallet) => [wallet.id, wallet.name])))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload, refreshNonce])

  useEffect(() => {
    if (!launchWizardOpen) {
      void reload()
    }
  }, [launchWizardOpen, reload])

  return (
    <section className={`solana-token-launch ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="solana-token-launch-header">
          <div>
            <div className="solana-token-launch-kicker">Token Launch</div>
            <h2 className="solana-token-launch-title">One launch surface for Solana token launches</h2>
            <p className="solana-token-launch-copy">
              Launch from one Solana workflow, monitor protocol readiness, and keep wallet-linked launch history in one place.
            </p>
          </div>
          <div className="solana-token-launch-actions">
            <button className="sol-btn green" onClick={openLaunchWizard}>Open Launcher</button>
            <button
              className="sol-btn"
              onClick={() => {
                onRefreshRequested?.()
                void reload()
              }}
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      <div className="solana-token-launch-grid">
        <div className="solana-token-launch-card">
          <div className="solana-token-launch-card-head">
            <div>
              <div className="solana-token-launch-card-title">Launchpads</div>
              {embedded && (
                <div className="solana-token-launch-card-copy">
                  Live protocol availability stays here so the main tool CTA always has context.
                </div>
              )}
            </div>
            {embedded && (
              <button
                className="sol-btn"
                onClick={() => {
                  onRefreshRequested?.()
                  void reload()
                }}
              >
                Refresh
              </button>
            )}
          </div>
          <div className="solana-launchpad-list">
            {launchpads.map((launchpad) => (
              <div key={launchpad.id} className={`solana-launchpad-row ${launchpad.enabled ? 'enabled' : 'planned'}`}>
                <div className="solana-launchpad-row-main">
                  <div className="solana-launchpad-row-title">
                    <span>{launchpad.name}</span>
                    <span className={`solana-launchpad-badge ${launchpad.enabled ? 'enabled' : 'planned'}`}>
                      {launchpad.enabled ? 'Live' : 'Planned'}
                    </span>
                  </div>
                  <div className="solana-launchpad-row-desc">{launchpad.description}</div>
                  {launchpad.reason && (
                    <div className="solana-launchpad-row-note">{launchpad.reason}</div>
                  )}
                </div>
                <button
                  className="sol-btn"
                  disabled={!launchpad.enabled}
                  onClick={openLaunchWizard}
                >
                  Launch
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="solana-token-launch-card">
          <div className="solana-token-launch-card-head">
            <div>
              <div className="solana-token-launch-card-title">Recent Launches</div>
              {embedded && (
                <div className="solana-token-launch-card-copy">
                  Wallet-linked launch history gives you the quickest handoff back into post-launch work.
                </div>
              )}
            </div>
          </div>
          {loading ? (
            <div className="solana-empty">Loading launches...</div>
          ) : launches.length === 0 ? (
            <div className="solana-empty">No launches recorded yet.</div>
          ) : (
            <div className="solana-launch-history">
              {launches.map((launch) => (
                <div key={launch.id} className="solana-launch-history-row">
                  <div className="solana-launch-history-main">
                    <div className="solana-launch-history-title">
                      <span>{launch.symbol}</span>
                      <span className="solana-launch-history-name">{launch.name}</span>
                    </div>
                    <div className="solana-launch-history-meta">
                      <span>{launch.launchpad}</span>
                      <span>{walletNames[launch.wallet_id] ?? 'Unknown wallet'}</span>
                      <span>{formatCreatedAt(launch.created_at)}</span>
                      <span className={`solana-launch-status ${launch.status}`}>{launch.status}</span>
                    </div>
                    <div className="solana-launch-history-mint">{truncateMiddle(launch.mint)}</div>
                  </div>
                  {launch.create_signature ? (
                    <button
                      className="sol-btn"
                      onClick={() => {
                        void window.daemon.shell.openExternal(`https://solscan.io/tx/${launch.create_signature}`)
                      }}
                    >
                      View Tx
                    </button>
                  ) : (
                    <button className="sol-btn" disabled>No Tx</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default TokenLaunchSection

import { useCallback, useEffect, useState } from 'react'
import { useWorkflowShellStore } from '../../store/workflowShell'

const PULSE_CATEGORIES: Array<{ id: PulseTokenCategory; label: string }> = [
  { id: 'newly-created', label: 'New' },
  { id: 'almost-graduated', label: 'Almost Graduated' },
  { id: 'graduated', label: 'Graduated' },
]

const STREAMLOCK_URL = 'https://app.streamlock.fun/'

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

function formatCompactNumber(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return 'n/a'
  return new Intl.NumberFormat([], {
    notation: 'compact',
    maximumFractionDigits: digits,
  }).format(value)
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
  const openStreamlock = useCallback(() => {
    void window.daemon.shell.openExternal(STREAMLOCK_URL)
  }, [])

  const [launchpads, setLaunchpads] = useState<LaunchpadDefinition[]>([])
  const [launches, setLaunches] = useState<LaunchedToken[]>([])
  const [pulseCategory, setPulseCategory] = useState<PulseTokenCategory>('graduated')
  const [pulseFeed, setPulseFeed] = useState<PulseTokenFeed | null>(null)
  const [walletNames, setWalletNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const pulsePromise = typeof window.daemon.launch.listPulseTokens === 'function'
        ? window.daemon.launch.listPulseTokens({ category: pulseCategory, pageSize: 6 })
        : Promise.resolve<IpcResponse<PulseTokenFeed>>({ ok: false, error: 'Pulse feed unavailable' })

      const [launchpadsRes, launchesRes, pulseRes] = await Promise.all([
        window.daemon.launch.listLaunchpads(),
        window.daemon.launch.listTokens(),
        pulsePromise,
      ])
      const walletsRes = await window.daemon.wallet.list()
      if (launchpadsRes.ok && launchpadsRes.data) {
        setLaunchpads(launchpadsRes.data)
      }
      if (launchesRes.ok && launchesRes.data) {
        setLaunches(launchesRes.data.slice(0, 6))
      }
      if (pulseRes.ok && pulseRes.data) {
        setPulseFeed(pulseRes.data)
      } else {
        setPulseFeed(null)
      }
      if (walletsRes.ok && walletsRes.data) {
        setWalletNames(Object.fromEntries(walletsRes.data.map((wallet) => [wallet.id, wallet.name])))
      }
    } finally {
      setLoading(false)
    }
  }, [pulseCategory])

  useEffect(() => {
    void reload()
  }, [reload, refreshNonce])

  useEffect(() => {
    if (!launchWizardOpen) {
      void reload()
    }
  }, [launchWizardOpen, reload])

  const liveLaunchpads = launchpads.filter((launchpad) => launchpad.enabled)

  return (
    <section className={`solana-token-launch ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="solana-token-launch-header">
          <div>
            <div className="solana-token-launch-kicker">Token Launch</div>
            <h2 className="solana-token-launch-title">Launch with Streamlock or a live Solana adapter</h2>
            <p className="solana-token-launch-copy">
              Use Streamlock for the current hosted launch path, or keep using DAEMON's live in-app adapters where configured.
            </p>
          </div>
          <div className="solana-token-launch-actions">
            <button type="button" className="sol-btn green" onClick={openStreamlock}>Open Streamlock</button>
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
                  Streamlock is the current external launch path. Disabled or pending launchpads are hidden from this surface.
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
            <div className="solana-launchpad-row enabled">
              <div className="solana-launchpad-row-main">
                <div className="solana-launchpad-row-title">
                  <span>Streamlock</span>
                  <span className="solana-launchpad-badge enabled">Live</span>
                </div>
                <div className="solana-launchpad-row-desc">
                  External Streamlock launch flow. Opens the hosted Streamlock app while the in-app integration is prepared.
                </div>
              </div>
              <button
                type="button"
                className="sol-btn green"
                onClick={openStreamlock}
              >
                Open
              </button>
            </div>

            {liveLaunchpads.map((launchpad) => (
              <div key={launchpad.id} className={`solana-launchpad-row ${launchpad.enabled ? 'enabled' : 'planned'}`}>
                <div className="solana-launchpad-row-main">
                  <div className="solana-launchpad-row-title">
                    <span>{launchpad.name}</span>
                    <span className="solana-launchpad-badge enabled">Live</span>
                  </div>
                  <div className="solana-launchpad-row-desc">{launchpad.description}</div>
                </div>
                <button
                  className="sol-btn"
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
                    <button type="button" className="sol-btn" disabled>No Tx</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="solana-token-launch-card">
          <div className="solana-token-launch-card-header">
            <div className="solana-token-launch-card-title">Printr Pulse</div>
            <div className="solana-pulse-tabs">
              {PULSE_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  className={`solana-pulse-tab ${pulseCategory === category.id ? 'active' : ''}`}
                  onClick={() => setPulseCategory(category.id)}
                  type="button"
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="solana-empty">Loading Pulse feed...</div>
          ) : !pulseFeed || pulseFeed.tokens.length === 0 ? (
            <div className="solana-empty">Pulse feed unavailable for this workspace.</div>
          ) : (
            <div className="solana-launch-history">
              {pulseFeed.tokens.map((token) => (
                <div key={token.id} className="solana-launch-history-row">
                  <div className="solana-launch-history-main">
                    <div className="solana-launch-history-title">
                      <span>{token.symbol}</span>
                      <span className="solana-launch-history-name">{token.name}</span>
                      <span className="solana-launch-status active">{PULSE_CATEGORIES.find((item) => item.id === token.category)?.label ?? token.category}</span>
                    </div>
                    <div className="solana-launch-history-meta">
                      <span>MC {formatCompactNumber(token.metrics.marketCapUsd)}</span>
                      <span>Vol {formatCompactNumber(token.metrics.volume24Usd)}</span>
                      <span>Holders {formatCompactNumber(token.metrics.holders, 0)}</span>
                      <span>Progress {token.metrics.graduationProgress == null ? 'n/a' : `${Math.round(token.metrics.graduationProgress)}%`}</span>
                      <span>{formatCreatedAt(token.createdAt ?? Number.NaN)}</span>
                    </div>
                    <div className="solana-launch-history-mint">{truncateMiddle(token.contractAddress)}</div>
                  </div>
                  <button
                    className="sol-btn"
                    onClick={() => {
                      void window.daemon.shell.openExternal(`https://app.printr.money/v2/trade/${token.contractAddress}`)
                    }}
                  >
                    Open Pulse
                  </button>
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

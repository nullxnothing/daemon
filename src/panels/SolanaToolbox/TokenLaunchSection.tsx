import { useCallback, useEffect, useState } from 'react'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { canOpenSolscan, getSolscanTxLabel, getSolscanTxUrl } from '../../lib/solanaExplorer'
import { describeSolanaToolboxError } from './solanaToolboxCopy'
import { DataRow, Badge, SegmentedControl, type SegmentItem } from '../../components/Panel'
import '../_solana/solanaSurface.css'

const PULSE_CATEGORIES: Array<{ id: PulseTokenCategory; label: string }> = [
  { id: 'newly-created', label: 'New' },
  { id: 'almost-graduated', label: 'Almost Graduated' },
  { id: 'graduated', label: 'Graduated' },
]

type LaunchView = 'launchpads' | 'history' | 'pulse'

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

function launchStatusTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'confirmed' || status === 'active') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'pending') return 'warning'
  return 'neutral'
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
  const [cluster, setCluster] = useState<WalletInfrastructureSettings['cluster']>('devnet')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<LaunchView>('launchpads')

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
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
      const infraRes = await window.daemon.settings.getWalletInfrastructureSettings()
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
      if (infraRes.ok && infraRes.data) {
        setCluster(infraRes.data.cluster)
      }
    } catch (error) {
      setLoadError(describeSolanaToolboxError(
        error instanceof Error ? error.message : null,
        'Could not load token launch data.',
      ))
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

  const refresh = () => {
    onRefreshRequested?.()
    void reload()
  }

  const viewItems: Array<SegmentItem<LaunchView>> = [
    { id: 'launchpads', label: 'Launchpads' },
    { id: 'history', label: 'History' },
    { id: 'pulse', label: 'Pulse' },
  ]

  return (
    <section className="sol-section">
      {!embedded && (
        <div className="sol-section-head">
          <div>
            <div className="sol-eyebrow">Token Launch</div>
            <h2 className="sol-section-title">Launch with Streamlock or a live Solana adapter</h2>
            <p className="sol-section-sub">
              Use Streamlock for the current hosted launch path, or keep using DAEMON's live in-app adapters where configured.
            </p>
          </div>
          <div className="sol-actions">
            <button type="button" className="solx-btn solx-btn--primary" onClick={openStreamlock}>Open Streamlock</button>
            <button type="button" className="solx-btn" onClick={refresh}>Refresh</button>
          </div>
        </div>
      )}

      {loadError && (
        <div className="sol-empty" role="status" style={{ color: 'var(--amber)', borderColor: 'color-mix(in srgb, var(--amber) 28%, transparent)' }}>
          {loadError}
        </div>
      )}

      <div className="sol-section-head">
        <SegmentedControl
          items={viewItems}
          value={view}
          onChange={setView}
          ariaLabel="Token launch views"
        />
        {view === 'pulse' ? (
          <SegmentedControl
            items={PULSE_CATEGORIES.map((category) => ({ id: category.id, label: category.label }))}
            value={pulseCategory}
            onChange={setPulseCategory}
            ariaLabel="Pulse categories"
          />
        ) : (
          <button type="button" className="solx-btn solx-btn--sm" onClick={refresh}>Refresh</button>
        )}
      </div>

      {view === 'launchpads' && (
        <div className="sol-list">
          <DataRow
            flush
            title="Streamlock"
            meta={<Badge tone="success">Live</Badge>}
            detail="External Streamlock launch flow. Opens the hosted Streamlock app while the in-app integration is prepared."
            actions={<button type="button" className="solx-btn solx-btn--primary solx-btn--sm" onClick={openStreamlock}>Open</button>}
          />
          {liveLaunchpads.map((launchpad) => (
            <DataRow
              key={launchpad.id}
              flush
              title={launchpad.name}
              meta={<Badge tone="success">Live</Badge>}
              detail={launchpad.description}
              actions={<button type="button" className="solx-btn solx-btn--sm" onClick={openLaunchWizard}>Launch</button>}
            />
          ))}
        </div>
      )}

      {view === 'history' && (
        loading ? (
          <div className="sol-empty">Loading launch history and wallet names...</div>
        ) : launches.length === 0 ? (
          <div className="sol-empty">
            No launches recorded yet. Launches appear here after DAEMON records a token creation signature.
          </div>
        ) : (
          <div className="sol-list">
            {launches.map((launch) => (
              <DataRow
                key={launch.id}
                flush
                title={launch.symbol}
                meta={(
                  <>
                    <span>{launch.name}</span>
                    <Badge tone={launchStatusTone(launch.status)}>{launch.status}</Badge>
                  </>
                )}
                detail={(
                  <>
                    <span>{launch.launchpad}</span>
                    <span>{walletNames[launch.wallet_id] ?? 'Unknown wallet'}</span>
                    <span>{formatCreatedAt(launch.created_at)}</span>
                    <span>{truncateMiddle(launch.mint)}</span>
                  </>
                )}
                actions={launch.create_signature ? (
                  <button
                    type="button"
                    className="solx-btn solx-btn--sm"
                    onClick={() => {
                      if (canOpenSolscan(cluster)) {
                        void window.daemon.shell.openExternal(getSolscanTxUrl(launch.create_signature!, cluster))
                      } else {
                        void window.daemon.env.copyValue(launch.create_signature!)
                      }
                    }}
                  >
                    {getSolscanTxLabel(cluster)}
                  </button>
                ) : (
                  <button type="button" className="solx-btn solx-btn--sm" disabled>No Tx</button>
                )}
              />
            ))}
          </div>
        )
      )}

      {view === 'pulse' && (
        loading ? (
          <div className="sol-empty">Loading Printr Pulse feed...</div>
        ) : !pulseFeed || pulseFeed.tokens.length === 0 ? (
          <div className="sol-empty">
            Pulse feed is unavailable right now. Check network access or refresh after setting launch integrations.
          </div>
        ) : (
          <div className="sol-list">
            {pulseFeed.tokens.map((token) => (
              <DataRow
                key={token.id}
                flush
                title={token.symbol}
                meta={(
                  <>
                    <span>{token.name}</span>
                    <Badge tone="success">{PULSE_CATEGORIES.find((item) => item.id === token.category)?.label ?? token.category}</Badge>
                  </>
                )}
                detail={(
                  <>
                    <span>MC {formatCompactNumber(token.metrics.marketCapUsd)}</span>
                    <span>Vol {formatCompactNumber(token.metrics.volume24Usd)}</span>
                    <span>Holders {formatCompactNumber(token.metrics.holders, 0)}</span>
                    <span>Progress {token.metrics.graduationProgress == null ? 'n/a' : `${Math.round(token.metrics.graduationProgress)}%`}</span>
                    <span>{truncateMiddle(token.contractAddress)}</span>
                  </>
                )}
                actions={(
                  <button
                    type="button"
                    className="solx-btn solx-btn--sm"
                    onClick={() => {
                      void window.daemon.shell.openExternal(`https://app.printr.money/v2/trade/${token.contractAddress}`)
                    }}
                  >
                    Open Pulse
                  </button>
                )}
              />
            ))}
          </div>
        )
      )}
    </section>
  )
}

export default TokenLaunchSection

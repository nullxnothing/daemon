import { useState, useEffect, useCallback } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { LiveRegion } from '../../components/LiveRegion'
import { PanelHeader } from '../../components/Panel'
import { SignalhouseGlyph } from '../../lib/SignalhouseGlyph'
import type {
  SignalhouseHealth,
  SignalhouseStrategy,
  SignalhouseStrategyDetail,
  SignalhouseEquityPoint,
  SignalhouseVerdict,
  SignalhousePosition,
} from '../../../electron/services/SignalhouseService'
import './SignalhousePanel.css'

const DOCS_URL = 'https://github.com/nullxnothing/Signalhouse'

const WINDOWS = ['24h', '7d', '30d', 'all'] as const
const SORTS = [
  { id: 'proof_of_edge', label: 'ProofOfEdge' },
  { id: 'realized_pnl', label: 'PnL' },
  { id: 'drawdown', label: 'Drawdown' },
  { id: 'copy_safety', label: 'Copy safety' },
  { id: 'stake', label: 'Stake' },
] as const

type Win = (typeof WINDOWS)[number]
type Sort = (typeof SORTS)[number]['id']

function usd(value: number | null): string {
  if (value === null) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

function bps(value: number | null): string {
  return value === null ? '—' : `${(value / 100).toFixed(1)}%`
}

function verifyClass(status: string | null): string {
  switch ((status ?? '').toLowerCase()) {
    case 'verified': return 'sh-verify--verified'
    case 'provisional': return 'sh-verify--provisional'
    case 'degraded': return 'sh-verify--degraded'
    case 'blocked': return 'sh-verify--blocked'
    default: return 'sh-verify--unknown'
  }
}

export function SignalhousePanel() {
  const [announce, setAnnounce] = useState('')

  return (
    <div className="sh-panel" data-brand="signalhouse">
      <PanelHeader
        kicker="Signalhouse"
        title="Copy-trading intelligence"
        subtitle="Browse Drift copy-trading strategies, ProofOfEdge rankings, and live risk verdicts."
        actions={
          <>
            <SignalhouseGlyph size={20} />
            <a className="sh-docs-link" href={DOCS_URL} target="_blank" rel="noreferrer">Docs ↗</a>
          </>
        }
      />

      <LiveRegion message={announce} />

      <StatusBadge />

      <div className="sh-body">
        <Leaderboard onAnnounce={setAnnounce} />
        <ActivityFeeds />
      </div>
    </div>
  )
}

// ----------------------------------------------------------- status badge ---

function StatusBadge() {
  const [health, setHealth] = useState<SignalhouseHealth | null>(null)
  const [paused, setPaused] = useState<boolean | null>(null)
  const [lag, setLag] = useState<number | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    const res = await daemon.signalhouse.getHealth()
    if (!res.ok || !res.data) { setReachable(false); return }
    setReachable(true)
    setHealth(res.data)
    const statusRes = await daemon.signalhouse.getStatus()
    if (statusRes.ok && statusRes.data) {
      setPaused(statusRes.data.globalExecutionPaused)
      setLag(statusRes.data.indexerLagSeconds)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (reachable === null) return <div className="sh-status sh-status--loading">Connecting to Signalhouse…</div>

  const online = reachable && health?.ok
  return (
    <div className="sh-status">
      <span className={`sh-dot ${online ? 'sh-dot--online' : 'sh-dot--offline'}`} />
      <span className="sh-status-text">{online ? 'API online' : 'API unreachable'}</span>
      {health?.service && <span className="sh-status-meta">{health.service}</span>}
      {lag !== null && <span className="sh-status-meta">indexer lag {lag}s</span>}
      {paused === true && <span className="sh-status-flag">execution paused</span>}
    </div>
  )
}

// ------------------------------------------------------------ leaderboard ---

function Leaderboard({ onAnnounce }: { onAnnounce: (m: string) => void }) {
  const [window, setWindow] = useState<Win>('7d')
  const [sort, setSort] = useState<Sort>('proof_of_edge')
  const [rows, setRows] = useState<SignalhouseStrategy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const res = await daemon.signalhouse.getLeaderboard({ window, sort })
    setLoading(false)
    if (!res.ok) { setError(res.error ?? 'Failed to load leaderboard.'); setRows([]); return }
    setRows(res.data ?? [])
  }, [window, sort])

  useEffect(() => { void load() }, [load])

  return (
    <section className="sh-leaderboard">
      <div className="sh-section-head">
        <h2 className="sh-section-title">Strategy leaderboard</h2>
        <button className="sh-btn sh-btn--ghost" type="button" onClick={() => void load()}>Refresh</button>
      </div>

      <div className="sh-controls">
        <div className="sh-control-group" role="group" aria-label="Window">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              className={`sh-chip${window === w ? ' sh-chip--on' : ''}`}
              onClick={() => setWindow(w)}
            >{w}</button>
          ))}
        </div>
        <select className="sh-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {loading && <p className="sh-muted">Loading strategies…</p>}
      {error && <p className="sh-error">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="sh-muted">No strategies indexed yet. Check back once Signalhouse has live strategies.</p>
      )}

      {rows.length > 0 && (
        <ul className="sh-rows">
          {rows.map((s, i) => (
            <li key={s.id || i} className="sh-row">
              <button className="sh-row-pick" type="button" onClick={() => setSelectedId(s.id)}>
                <span className="sh-rank">{i + 1}</span>
                <span className="sh-strat-name">{s.name || s.id || 'Unnamed'}</span>
                <span className={`sh-verify ${verifyClass(s.proofOfEdgeVerificationStatus)}`}>
                  {s.proofOfEdge !== null ? s.proofOfEdge.toFixed(0) : '—'}
                </span>
                <span className={`sh-pnl${(s.realizedPnlUsd ?? 0) < 0 ? ' sh-pnl--neg' : ''}`}>{usd(s.realizedPnlUsd)}</span>
                <span className="sh-meta">DD {bps(s.drawdownBps)}</span>
                {s.riskLevel && <span className="sh-tag">{s.riskLevel}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedId && (
        <StrategyDetail
          key={selectedId}
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onAnnounce={onAnnounce}
        />
      )}
    </section>
  )
}

// -------------------------------------------------------- strategy detail ---

function StrategyDetail({ id, onClose, onAnnounce }: {
  id: string
  onClose: () => void
  onAnnounce: (m: string) => void
}) {
  const [detail, setDetail] = useState<SignalhouseStrategyDetail | null>(null)
  const [history, setHistory] = useState<SignalhouseEquityPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      setLoading(true)
      setError('')
      const [d, h] = await Promise.all([
        daemon.signalhouse.getStrategy(id),
        daemon.signalhouse.getHistory(id),
      ])
      if (!active) return
      setLoading(false)
      if (!d.ok) { setError(d.error ?? 'Failed to load strategy.'); return }
      if (!d.data) { setError('Strategy not found.'); onAnnounce('Strategy not found.'); return }
      setDetail(d.data)
      setHistory(h.ok ? (h.data ?? []) : [])
    })()
    return () => { active = false }
  }, [id, onAnnounce])

  const equities = history.map((p) => p.equityUsd).filter((v): v is number => v !== null)
  const peak = equities.length ? Math.max(...equities) : 0
  const trough = equities.length ? Math.min(...equities) : 0
  const span = peak - trough || 1

  return (
    <aside className="sh-detail">
      <header className="sh-detail-head">
        <h3 className="sh-detail-title">{detail?.name || 'Strategy'}</h3>
        <button className="sh-btn sh-btn--xs" type="button" onClick={onClose}>Close</button>
      </header>

      {loading && <p className="sh-muted">Loading…</p>}
      {error && <p className="sh-error">{error}</p>}

      {detail && !loading && (
        <>
          {detail.description && <p className="sh-detail-desc">{detail.description}</p>}
          <div className="sh-detail-grid">
            <Stat label="ProofOfEdge" value={detail.proofOfEdge !== null ? detail.proofOfEdge.toFixed(0) : '—'} />
            <Stat label="Status" value={detail.status ?? '—'} />
            <Stat label="Realized PnL" value={usd(detail.realizedPnlUsd)} />
            <Stat label="Drawdown" value={bps(detail.drawdownBps)} />
            <Stat label="Max leverage" value={detail.maxLeverage !== null ? `${detail.maxLeverage}x` : '—'} />
            <Stat label="Followers" value={detail.followerCount !== null ? String(detail.followerCount) : '—'} />
          </div>

          {detail.allowedMarkets.length > 0 && (
            <div className="sh-markets">
              {detail.allowedMarkets.map((m) => <span key={m} className="sh-tag">{m}</span>)}
            </div>
          )}

          <div className="sh-spark">
            <span className="sh-spark-label">Equity ({history.length} pts)</span>
            {equities.length > 1 ? (
              <div className="sh-spark-bars">
                {equities.map((v, i) => (
                  <span
                    key={i}
                    className="sh-spark-bar"
                    style={{ height: `${4 + ((v - trough) / span) * 28}px` }}
                    title={usd(v)}
                  />
                ))}
              </div>
            ) : (
              <p className="sh-muted">No equity history yet.</p>
            )}
          </div>

          {detail.positions.length > 0 && (
            <div className="sh-positions">
              <span className="sh-spark-label">Open positions</span>
              {detail.positions.map((p) => <PositionRow key={p.id} pos={p} />)}
            </div>
          )}
        </>
      )}
    </aside>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="sh-stat">
      <span className="sh-stat-label">{label}</span>
      <span className="sh-stat-value">{value}</span>
    </div>
  )
}

// ----------------------------------------------------------- activity feeds ---

function ActivityFeeds() {
  const [verdicts, setVerdicts] = useState<SignalhouseVerdict[]>([])
  const [positions, setPositions] = useState<SignalhousePosition[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [v, p] = await Promise.all([
      daemon.signalhouse.getVerdicts(12),
      daemon.signalhouse.getPositions(12),
    ])
    setLoading(false)
    if (v.ok) setVerdicts(v.data ?? [])
    if (p.ok) setPositions(p.data ?? [])
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <section className="sh-activity">
      <div className="sh-section-head">
        <h2 className="sh-section-title">Live activity</h2>
        <button className="sh-btn sh-btn--ghost" type="button" onClick={() => void load()}>Refresh</button>
      </div>

      <div className="sh-feed">
        <span className="sh-feed-label">Risk verdicts</span>
        {loading && <p className="sh-muted">Loading…</p>}
        {!loading && verdicts.length === 0 && <p className="sh-muted">No recent verdicts.</p>}
        {verdicts.map((v) => (
          <div key={v.id} className="sh-feed-row">
            <span className={`sh-dot ${v.approved ? 'sh-dot--online' : 'sh-dot--offline'}`} />
            <span className="sh-feed-market">{v.market ?? '—'}</span>
            <span className={`sh-side sh-side--${(v.side ?? '').toLowerCase()}`}>{v.side ?? '—'}</span>
            <span className="sh-feed-size">{usd(v.sizeUsd)}</span>
            <span className="sh-feed-verdict">{v.verdict ?? (v.approved ? 'approved' : 'rejected')}</span>
          </div>
        ))}
      </div>

      <div className="sh-feed">
        <span className="sh-feed-label">Open positions</span>
        {loading && <p className="sh-muted">Loading…</p>}
        {!loading && positions.length === 0 && <p className="sh-muted">No open positions.</p>}
        {positions.map((p) => <PositionRow key={p.id} pos={p} />)}
      </div>
    </section>
  )
}

function PositionRow({ pos }: { pos: SignalhousePosition }) {
  const pnl = pos.unrealizedPnlUsd
  return (
    <div className="sh-feed-row">
      <span className="sh-feed-market">{pos.market ?? '—'}</span>
      <span className={`sh-side sh-side--${(pos.side ?? '').toLowerCase()}`}>{pos.side ?? '—'}</span>
      <span className="sh-feed-size">{usd(pos.sizeUsd)}</span>
      <span className={`sh-feed-pnl${(pnl ?? 0) < 0 ? ' sh-pnl--neg' : ''}`}>{usd(pnl)}</span>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { LiveRegion } from '../../components/LiveRegion'
import type {
  FlywheelConfig,
  FlywheelPreview,
  FlywheelState,
  FlywheelEvent,
  WalletListEntry,
} from '../../../electron/shared/types'
import './FlywheelPanel.css'

const DAEMON_MINT = '4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump'
const SOLSCAN_TX = (sig: string) => `https://solscan.io/tx/${sig}`
const SOLSCAN_TOKEN = (mint: string) => `https://solscan.io/token/${mint}`

function shortAddr(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value
}

/** Lamports → SOL number (4 dp). */
function lamportsToSol(lamports: string | number): number {
  const n = typeof lamports === 'string' ? Number(lamports) : lamports
  return n / 1e9
}

function fmtSol(n: number): string {
  return n.toFixed(4)
}

/** Abbreviate big token counts: 8273445550 → "8.27B". */
function abbreviateCount(raw: string): { short: string; unit: string } {
  const n = Number(raw)
  if (!Number.isFinite(n) || n === 0) return { short: '0', unit: '' }
  if (n >= 1e9) return { short: (n / 1e9).toFixed(2), unit: 'B' }
  if (n >= 1e6) return { short: (n / 1e6).toFixed(2), unit: 'M' }
  if (n >= 1e3) return { short: (n / 1e3).toFixed(2), unit: 'K' }
  return { short: String(n), unit: '' }
}

const KIND_LABEL: Record<FlywheelEvent['kind'], string> = {
  configure: 'Config',
  claim: 'Claim',
  transfer: 'Transfer',
  swap: 'Swap',
  burn: 'Burn',
}

// ------------------------------------------------------------------ panel ---

export function FlywheelPanel() {
  const [announce, setAnnounce] = useState('')
  const [configs, setConfigs] = useState<FlywheelConfig[]>([])
  const [states, setStates] = useState<Record<string, FlywheelState>>({})
  const [showConfig, setShowConfig] = useState(false)
  const [runningAll, setRunningAll] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const busyRef = useRef(false)
  busyRef.current = busyId !== null || runningAll

  const loadConfigs = useCallback(async () => {
    const res = await daemon.flywheel.list()
    if (res.ok && res.data) setConfigs(res.data)
  }, [])

  const loadState = useCallback(async (configId: string) => {
    const res = await daemon.flywheel.state(configId)
    if (res.ok && res.data) setStates((prev) => ({ ...prev, [configId]: res.data as FlywheelState }))
  }, [])

  const loadAllStates = useCallback(async () => {
    const list = await daemon.flywheel.list()
    if (!list.ok || !list.data) return
    setConfigs(list.data)
    await Promise.all(list.data.map((c) => loadState(c.id)))
  }, [loadState])

  useEffect(() => { void loadConfigs() }, [loadConfigs])
  // Fetch state for every config once configs load.
  useEffect(() => { configs.forEach((c) => { if (!states[c.id]) void loadState(c.id) }) }, [configs, states, loadState])

  // Auto-refresh on-chain state every 15s; skip while an action is in flight.
  useEffect(() => {
    const timer = setInterval(() => { if (!busyRef.current) configs.forEach((c) => void loadState(c.id)) }, 15_000)
    return () => clearInterval(timer)
  }, [configs, loadState])

  const runAll = useCallback(async () => {
    setRunningAll(true)
    setAnnounce('Running all flywheels…')
    const res = await daemon.flywheel.runAll()
    setRunningAll(false)
    if (!res.ok || !res.data) { setAnnounce(`Run all failed: ${res.error}`); return }
    const ok = res.data.filter((r) => r.ok).length
    const failed = res.data.length - ok
    setAnnounce(`Run all: ${res.data.length} flywheel${res.data.length === 1 ? '' : 's'} · ${ok} succeeded${failed ? ` · ${failed} failed` : ''}.`)
    void loadAllStates()
  }, [loadAllStates])

  // ---- aggregate KPIs across all tokens ----
  const agg = useMemo(() => {
    const list = Object.values(states)
    const unclaimed = list.reduce((s, st) => s + lamportsToSol(st.accruedLamports), 0)
    const buyback = list.reduce((s, st) => s + (st.buybackWalletSol ?? 0), 0)
    const swapped = list.reduce((s, st) => s + Number(st.totalSwappedSol || 0), 0)
    const burned = list.reduce((s, st) => s + Number(st.totalBurnedTokens || 0), 0)
    return { unclaimed, buyback, swapped, burned }
  }, [states])

  const routingCount = configs.filter((c) => c.buybackTargetMint === DAEMON_MINT).length
  const burnedAbbr = abbreviateCount(String(Math.round(agg.burned)))

  return (
    <div className="fw-panel" data-brand="flywheel">
      {/* 1 · header */}
      <header className="fw-head">
        <div className="fw-head-copy">
          <span className="label">DAEMON Protocol</span>
          <h1 className="fw-title">Fee Flywheel</h1>
          <p className="fw-sub">Creator fees claimed, split, and a share buys back &amp; burns $DAEMON.</p>
        </div>
        <div className="fw-head-actions">
          <button className="fw-btn" onClick={() => setShowConfig(true)}>+ Configure split</button>
          {configs.length > 0 && (
            <button className="fw-btn fw-btn--primary" disabled={runningAll} onClick={() => void runAll()}>
              {runningAll ? 'Running…' : 'Run all'}
            </button>
          )}
        </div>
      </header>

      <LiveRegion message={announce} />

      {/* 2 · aggregate KPI strip */}
      <div className="fw-agg">
        <AggCell k="Tokens routing" v={String(routingCount)} green m="buyback & burn → $DAEMON" />
        <AggCell k="Unclaimed fees" v={fmtSol(agg.unclaimed)} u="SOL" m={`across ${configs.length} token${configs.length === 1 ? '' : 's'}`} />
        <AggCell k="Buyback wallet" v={fmtSol(agg.buyback)} u="SOL" m="awaiting swap" />
        <AggCell k="SOL swapped" v={fmtSol(agg.swapped)} m={`lifetime → ${shortAddr(DAEMON_MINT)}`} />
        <AggCell k="$DAEMON burned" v={burnedAbbr.short} u={burnedAbbr.unit} m={`${Math.round(agg.burned).toLocaleString()} tokens`} />
      </div>

      {/* 3 · flywheel line */}
      <div className="fw-line">
        <span className="dot live" aria-hidden="true" />
        <span className="fw-line-kicker">Flywheeling into $DAEMON</span>
        <span className="fw-line-copy">
          {routingCount === 0
            ? 'No tokens are flywheeling into $DAEMON yet.'
            : `${routingCount} token${routingCount === 1 ? '' : 's'} routing buyback & burn into $DAEMON.`}
        </span>
        <a className="fw-link fw-line-mint" href={SOLSCAN_TOKEN(DAEMON_MINT)} target="_blank" rel="noreferrer">
          {shortAddr(DAEMON_MINT)} ↗
        </a>
      </div>

      {/* 4 · ledger */}
      <span className="label fw-ledger-label">Tokens</span>
      {configs.length === 0 ? (
        <p className="fw-empty">
          No flywheels configured yet. Configure a split to route a token's creator fees 80% → creator, 20% → $DAEMON buyback &amp; burn.
        </p>
      ) : (
        <div className="fw-ledger">
          <div className="fw-lhead">
            <span>Token</span>
            <span>Split</span>
            <span className="fw-num">Unclaimed</span>
            <span className="fw-num">Buyback wallet</span>
            <span className="fw-num">SOL swapped</span>
            <span className="fw-num">Burned</span>
            <span>Status</span>
            <span className="fw-num">Action</span>
          </div>
          {configs.map((c) => (
            <LedgerRow
              key={c.id}
              config={c}
              state={states[c.id]}
              open={openId === c.id}
              busy={busyId === c.id}
              onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
              onAnnounce={setAnnounce}
              onBusy={setBusyId}
              onReload={() => loadState(c.id)}
            />
          ))}
        </div>
      )}

      {showConfig && (
        <ConfigModal
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); void loadConfigs() }}
          onAnnounce={setAnnounce}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------- KPI cell ---

function AggCell({ k, v, u, m, green }: { k: string; v: string; u?: string; m?: string; green?: boolean }) {
  return (
    <div className="fw-agg-cell">
      <div className="fw-agg-k">{k}</div>
      <div className={`fw-agg-v${green ? ' fw-agg-v--green' : ''}`}>
        {v}{u ? <span className="fw-agg-u">{u}</span> : null}
      </div>
      {m ? <div className="fw-agg-m">{m}</div> : null}
    </div>
  )
}

// ------------------------------------------------------------ ledger row ---

function LedgerRow({
  config, state, open, busy, onToggle, onAnnounce, onBusy, onReload,
}: {
  config: FlywheelConfig
  state: FlywheelState | undefined
  open: boolean
  busy: boolean
  onToggle: () => void
  onAnnounce: (m: string) => void
  onBusy: (id: string | null) => void
  onReload: () => void
}) {
  const [distAmount, setDistAmount] = useState('')

  const payoutPct = config.payoutBps / 100
  const buybackPct = config.buybackBps / 100
  const recentlyActive = (state?.events.length ?? 0) > 0
  const burnedAbbr = abbreviateCount(state?.totalBurnedTokens ?? '0')

  const buybackResultMsg = (status?: string, burnSig?: string | null): string => {
    const burned = burnSig ? ' · burned existing $DAEMON' : ''
    if (status === 'no-jupiter-key') return 'Buyback SKIPPED — JUPITER_API_KEY not set (Wallet → Infra).'
    if (status === 'nothing-to-swap') return burnSig ? 'Burned $DAEMON (no new SOL to swap).' : 'Nothing to swap or burn.'
    if (status === 'swap-failed') return `Swap failed (signer guard blocked the route)${burned}.`
    if (status === 'swapped') return burnSig ? 'Swapped & burned $DAEMON.' : 'Swapped to $DAEMON (burn did not run).'
    return 'Buyback ran.'
  }

  const run = useCallback(async () => {
    onBusy(config.id)
    onAnnounce(`Running flywheel for ${config.label ?? config.tokenMint}…`)
    const res = await daemon.flywheel.run(config.id)
    onBusy(null)
    if (!res.ok) { onAnnounce(`Flywheel failed: ${res.error}`); return }
    const d = res.data
    const claimed = d?.claimedSol ?? 0
    const parts: string[] = []
    parts.push(claimed > 0 ? `claimed ${claimed.toFixed(4)} SOL` : 'no new fees in vault')
    if (d?.payoutSignature) parts.push('split sent')
    if (d?.status === 'swapped') parts.push(d.burnSignature ? 'bought back & burned' : 'bought back (burn pending)')
    else if (d?.status === 'no-jupiter-key') parts.push('buyback SKIPPED — set JUPITER_API_KEY in Wallet → Infra')
    else parts.push('nothing to buy back')
    onAnnounce(`Flywheel: ${parts.join(' · ')}`)
    onReload()
  }, [config, onAnnounce, onBusy, onReload])

  const distribute = useCallback(async () => {
    const amount = Number(distAmount)
    if (!Number.isFinite(amount) || amount <= 0) { onAnnounce('Enter a SOL amount to distribute'); return }
    onBusy(config.id)
    onAnnounce(`Distributing ${amount} SOL ${payoutPct}/${buybackPct}…`)
    const res = await daemon.flywheel.distribute(config.id, amount)
    if (res.ok) {
      const buyback = await daemon.flywheel.buyback(config.id)
      onBusy(null)
      onAnnounce(buyback.ok
        ? `Distributed ${amount} SOL. ${buybackResultMsg(buyback.data?.status, buyback.data?.burnSignature)}`
        : `Distributed; buyback failed: ${buyback.error}`)
      setDistAmount('')
      onReload()
    } else {
      onBusy(null)
      onAnnounce(`Distribute failed: ${res.error}`)
    }
  }, [config, distAmount, payoutPct, buybackPct, onAnnounce, onBusy, onReload])

  const buybackOnly = useCallback(async () => {
    onBusy(config.id)
    onAnnounce('Buying back & burning $DAEMON…')
    const res = await daemon.flywheel.buyback(config.id)
    onBusy(null)
    if (!res.ok) { onAnnounce(`Buyback failed: ${res.error}`); return }
    onAnnounce(buybackResultMsg(res.data?.status, res.data?.burnSignature))
    onReload()
  }, [config, onAnnounce, onBusy, onReload])

  return (
    <>
      <div
        className={`fw-lrow${open ? ' open' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      >
        <div className="fw-cell-token">
          <span className="fw-token-name">{config.label ?? 'Token flywheel'}</span>
          <a
            className="fw-link fw-token-mint"
            href={SOLSCAN_TOKEN(config.tokenMint)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {shortAddr(config.tokenMint)} ↗
          </a>
        </div>

        <div className="fw-cell-split">
          <span className="fw-splitbar" aria-hidden="true">
            <span className="fw-splitbar-c" style={{ flexBasis: `calc(${payoutPct}% - 1px)` }} />
            <span className="fw-splitbar-b" />
          </span>
          <span className="fw-split-num">{payoutPct}/{buybackPct}</span>
        </div>

        <NumCell value={state ? fmtSol(lamportsToSol(state.accruedLamports)) : '—'} unit="SOL" />
        <NumCell value={state ? fmtSol(state.buybackWalletSol) : '—'} unit="SOL" />
        <NumCell value={state ? Number(state.totalSwappedSol).toFixed(4) : '—'} />
        <NumCell value={state ? burnedAbbr.short : '—'} unit={state ? burnedAbbr.unit : ''} />

        <div className="fw-cell-status">
          {recentlyActive
            ? <span className="fw-badge fw-badge--routing"><span className="dot live" />Routing</span>
            : <span className="fw-badge"><span className="dot idle" />Idle</span>}
        </div>

        <div className="fw-cell-action">
          <button
            className="fw-btn"
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); void run() }}
          >
            {busy ? 'Running…' : 'Run flywheel'}
          </button>
          <span className={`fw-chevron${open ? ' open' : ''}`} aria-hidden="true">›</span>
        </div>
      </div>

      {open && (
        <div className="fw-ldetail">
          <div className="fw-ldetail-left">
            <div className="fw-dist">
              <input
                className="fw-field"
                type="number"
                step="0.0001"
                min="0"
                placeholder="SOL in dev wallet to split"
                value={distAmount}
                onChange={(e) => setDistAmount(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <button className="fw-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); void distribute() }}>
                Distribute &amp; buyback
              </button>
              <button className="fw-btn" disabled={busy} onClick={(e) => { e.stopPropagation(); void buybackOnly() }}>
                Buyback now
              </button>
            </div>
            <ul className="fw-legend">
              <li>
                <span className="fw-swatch fw-swatch--c" />
                <span className="fw-legend-pct">{payoutPct}%</span> Creator payout
                <span className="fw-legend-addr">→ {shortAddr(config.payoutWallet)}</span>
              </li>
              <li>
                <span className="fw-swatch fw-swatch--b" />
                <span className="fw-legend-pct">{buybackPct}%</span> $DAEMON buyback &amp; burn
                <span className="fw-legend-addr">→ {shortAddr(config.buybackWallet)}</span>
              </li>
            </ul>
          </div>

          <div className="fw-ldetail-right">
            <div className="fw-activity-head">
              <span className="label">Activity</span>
              {state && state.events.length > 8 && (
                <a className="fw-link" href={SOLSCAN_TOKEN(config.tokenMint)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  View all {state.events.length} ↗
                </a>
              )}
            </div>
            <EventLog events={state?.events ?? []} />
          </div>
        </div>
      )}
    </>
  )
}

function NumCell({ value, unit }: { value: string; unit?: string }) {
  const isZero = value === '0.0000' || value === '0' || value === '—'
  return (
    <div className={`fw-num-cell${isZero ? ' zero' : ''}`}>
      {value}{unit ? <span className="fw-num-u">{unit}</span> : null}
    </div>
  )
}

function EventLog({ events }: { events: FlywheelEvent[] }) {
  if (events.length === 0) return <div className="fw-activity-empty">No activity yet.</div>
  return (
    <ul className="fw-feed">
      {events.slice(0, 8).map((e) => (
        <li key={e.id} className={`fw-feed-row fw-feed-row--${e.kind}`}>
          <span className="fw-feed-kind">{KIND_LABEL[e.kind]}</span>
          <span className="fw-feed-note">{e.note ?? ''}</span>
          {e.signature && (
            <a className="fw-link fw-feed-tx" href={SOLSCAN_TX(e.signature)} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
              tx ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

// --------------------------------------------------------- config modal ---

function ConfigModal({
  onClose,
  onSaved,
  onAnnounce,
}: {
  onClose: () => void
  onSaved: () => void
  onAnnounce: (m: string) => void
}) {
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [tokenMint, setTokenMint] = useState('')
  const [label, setLabel] = useState('')
  const [creatorWalletId, setCreatorWalletId] = useState('')
  const [payoutWallet, setPayoutWallet] = useState('')
  const [buybackWalletId, setBuybackWalletId] = useState('')
  const [payoutPct, setPayoutPct] = useState(80)
  const [preview, setPreview] = useState<FlywheelPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await daemon.wallet.list()
      if (res.ok && res.data) setWallets(res.data)
    })()
  }, [])

  const buildInput = useCallback(() => ({
    tokenMint: tokenMint.trim(),
    label: label.trim() || undefined,
    creatorWalletId,
    payoutWallet: payoutWallet.trim(),
    buybackWalletId,
    payoutBps: Math.round(payoutPct * 100),
    buybackBps: Math.round((100 - payoutPct) * 100),
    buybackTargetMint: DAEMON_MINT,
  }), [tokenMint, label, creatorWalletId, payoutWallet, buybackWalletId, payoutPct])

  const runPreview = useCallback(async () => {
    setError('')
    setBusy(true)
    const res = await daemon.flywheel.preview(buildInput())
    setBusy(false)
    if (!res.ok || !res.data) { setError(res.error ?? 'Preview failed'); return }
    setPreview(res.data)
  }, [buildInput])

  const confirm = useCallback(async () => {
    setBusy(true)
    setError('')
    const res = await daemon.flywheel.configure(buildInput())
    setBusy(false)
    if (!res.ok) { setError(res.error ?? 'Configure failed'); return }
    onAnnounce('Flywheel split saved.')
    onSaved()
  }, [buildInput, onAnnounce, onSaved])

  return (
    <div className="fw-modal-backdrop" onClick={onClose}>
      <div className="fw-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="fw-modal-title">Configure flywheel split</h2>

        {!preview ? (
          <div className="fw-form">
            <label>Token mint
              <input value={tokenMint} onChange={(e) => setTokenMint(e.target.value)} placeholder="pump.fun token mint" />
            </label>
            <label>Label (optional)
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Signalhouse" />
            </label>
            <label>Dev / creator wallet (claims all fees, signs the split)
              <select value={creatorWalletId} onChange={(e) => setCreatorWalletId(e.target.value)}>
                <option value="">Select wallet…</option>
                {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({shortAddr(w.address)})</option>)}
              </select>
            </label>
            <label>Payout wallet (receives the creator share)
              <input value={payoutWallet} onChange={(e) => setPayoutWallet(e.target.value)} placeholder="address that receives the creator %" />
            </label>
            <label>Buyback wallet (receives the buyback share, swaps → $DAEMON &amp; burns)
              <select value={buybackWalletId} onChange={(e) => setBuybackWalletId(e.target.value)}>
                <option value="">Select wallet…</option>
                {wallets.map((w) => <option key={w.id} value={w.id}>{w.name} ({shortAddr(w.address)})</option>)}
              </select>
            </label>
            <label>Payout share: {payoutPct}% / Buyback {100 - payoutPct}%
              <input type="range" min={50} max={99} value={payoutPct} onChange={(e) => setPayoutPct(Number(e.target.value))} />
            </label>
            {error && <p className="fw-error">{error}</p>}
            <div className="fw-modal-actions">
              <button className="fw-btn" onClick={onClose}>Cancel</button>
              <button className="fw-btn fw-btn--primary" disabled={busy} onClick={() => void runPreview()}>
                {busy ? 'Checking…' : 'Preview'}
              </button>
            </div>
          </div>
        ) : (
          <div className="fw-confirm">
            <ul className="fw-confirm-list">
              {preview.shareholders.map((s) => (
                <li key={s.address}>
                  <span className="fw-confirm-pct">{s.shareBps / 100}%</span> → {shortAddr(s.address)}
                </li>
              ))}
            </ul>
            {preview.warnings.map((w, i) => <p key={i} className="fw-confirm-note">{w}</p>)}
            {preview.alreadyConfigured && (
              <p className="fw-confirm-note">A flywheel is already saved for this token — saving will update it.</p>
            )}
            {!preview.creatorMatches && (
              <p className="fw-error">Creator wallet mismatch — select the wallet that launched this token (it must be able to claim fees).</p>
            )}
            {error && <p className="fw-error">{error}</p>}
            <div className="fw-modal-actions">
              <button className="fw-btn" onClick={() => setPreview(null)}>Back</button>
              <button
                className="fw-btn fw-btn--primary"
                disabled={busy || !preview.creatorMatches}
                onClick={() => void confirm()}
              >
                {busy ? 'Saving…' : 'Save flywheel'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

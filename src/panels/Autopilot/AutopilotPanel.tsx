import { useState, useEffect, useCallback, useRef } from 'react'
import { daemon } from '../../lib/daemonBridge'
import { LiveRegion } from '../../components/LiveRegion'
import type {
  AutopilotState,
  Mandate,
  MandateAction,
  MandatePositionLive,
  WalletListEntry,
} from '../../../electron/shared/types'
import styles from './AutopilotPanel.module.css'

const SOLSCAN_TX = (sig: string) => `https://solscan.io/tx/${sig}`
const LAMPORTS_PER_SOL = 1e9
// How often the Desk re-pulls state so countdowns and the tape stay live.
const POLL_MS = 2_000

function sol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(4)
}

function shortAddr(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value
}

/** Live countdown to the next tick, in a compact "in 12s" / "now" form. */
function countdown(nextTickAt: number | null): string {
  if (nextTickAt === null) return '—'
  const ms = nextTickAt - Date.now()
  if (ms <= 0) return 'now'
  const s = Math.ceil(ms / 1000)
  if (s < 60) return `in ${s}s`
  const m = Math.floor(s / 60)
  return `in ${m}m ${s % 60}s`
}

const STATUS_TONE: Record<Mandate['status'], string> = {
  draft: styles.dotIdle,
  armed: styles.dotLive,
  paused: styles.dotIdle,
  exhausted: styles.dotDone,
  error: styles.dotError,
}

const DECISION_TONE: Record<MandateAction['decision'], string> = {
  buy: styles.tapeBuy,
  sell: styles.tapeSell,
  hold: styles.tapeHold,
  skip: styles.tapeHold,
}

export function AutopilotPanel() {
  const [state, setState] = useState<AutopilotState | null>(null)
  const [wallets, setWallets] = useState<WalletListEntry[]>([])
  const [announce, setAnnounce] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // A clock tick that forces countdowns to re-render between polls.
  const [, setNow] = useState(0)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    const res = await daemon.autopilot.state()
    if (res.ok && res.data && mounted.current) setState(res.data)
  }, [])

  useEffect(() => {
    mounted.current = true
    void refresh()
    void (async () => {
      const res = await daemon.wallet.list()
      if (res.ok && res.data && mounted.current) setWallets(res.data)
    })()
    const poll = setInterval(() => void refresh(), POLL_MS)
    const clock = setInterval(() => setNow((n) => n + 1), 1000)
    const off = daemon.autopilot.onChanged(() => void refresh())
    return () => {
      mounted.current = false
      clearInterval(poll)
      clearInterval(clock)
      off?.()
    }
  }, [refresh])

  const armedCount = state?.mandates.filter((m) => m.armed).length ?? 0

  const killAll = useCallback(async () => {
    setBusy(true)
    const res = await daemon.autopilot.disarmAll()
    setBusy(false)
    if (res.ok) {
      setAnnounce(`Kill switch — disarmed ${res.data?.disarmed ?? 0} mandate(s).`)
      void refresh()
    }
  }, [refresh])

  const arm = useCallback(async (id: string) => {
    setBusy(true)
    const res = await daemon.autopilot.arm(id)
    setBusy(false)
    if (res.ok) { setAnnounce('Mandate armed — trading live.'); void refresh() }
  }, [refresh])

  const disarm = useCallback(async (id: string) => {
    setBusy(true)
    const res = await daemon.autopilot.disarm(id)
    setBusy(false)
    if (res.ok) { setAnnounce('Mandate disarmed.'); void refresh() }
  }, [refresh])

  const del = useCallback(async (id: string) => {
    setBusy(true)
    const res = await daemon.autopilot.delete(id)
    setBusy(false)
    if (res.ok) { setAnnounce('Mandate removed.'); void refresh() }
  }, [refresh])

  return (
    <div className={styles.desk}>
      <LiveRegion message={announce} />

      <header className={styles.hero}>
        <div className={styles.heroTitle}>
          <h1>Autopilot</h1>
          <p>Standing mandates trading Solana unattended. Arm it, walk away.</p>
        </div>
        <div className={styles.heroActions}>
          <span className={styles.armedTally}>
            <span className={`${styles.dot} ${armedCount > 0 ? styles.dotLive : styles.dotIdle}`} />
            {armedCount} live
          </span>
          <button
            type="button"
            className={styles.killSwitch}
            onClick={() => void killAll()}
            disabled={busy || armedCount === 0}
            title="Disarm every live mandate immediately"
          >
            Kill switch
          </button>
          <button type="button" className={styles.newBtn} onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : 'New mandate'}
          </button>
        </div>
      </header>

      {showForm && (
        <CreateMandateForm
          wallets={wallets}
          onCreated={() => { setShowForm(false); void refresh() }}
          onAnnounce={setAnnounce}
        />
      )}

      <div className={styles.floor}>
        <section className={styles.cards}>
          {state?.mandates.length ? (
            state.mandates.map((m) => (
              <MandateCard
                key={m.id}
                mandate={m}
                position={state.positions.find((p) => p.mandateId === m.id) ?? null}
                busy={busy}
                onArm={() => void arm(m.id)}
                onDisarm={() => void disarm(m.id)}
                onDelete={() => void del(m.id)}
              />
            ))
          ) : (
            <div className={styles.empty}>
              No mandates yet. Tell ARIA <em>“DCA 0.1 SOL into BONK every 5 minutes, cap 2 SOL”</em> — or create one here.
            </div>
          )}
        </section>

        <aside className={styles.tape}>
          <div className={styles.tapeHead}>Live tape</div>
          <div className={styles.tapeBody}>
            {state?.recentActions.length ? (
              state.recentActions.map((a) => <TapeRow key={a.id} action={a} />)
            ) : (
              <div className={styles.tapeEmpty}>No actions recorded yet.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function MandateCard({
  mandate, position, busy, onArm, onDisarm, onDelete,
}: {
  mandate: Mandate
  position: MandatePositionLive | null
  busy: boolean
  onArm: () => void
  onDisarm: () => void
  onDelete: () => void
}) {
  const spentPct = Math.min(100, (mandate.spentLamports / mandate.maxExposureLamports) * 100)
  // Show LIVE unrealized P&L while the position is open and priceable; fall back to the
  // realized P&L booked on the last exit once it's closed.
  const hasLive = position !== null && mandate.armed
  const pnl = hasLive ? position!.unrealizedLamports : mandate.realizedPnlLamports
  const pnlClass = pnl > 0 ? styles.pnlUp : pnl < 0 ? styles.pnlDown : styles.pnlFlat
  const pnlLabel = hasLive ? 'P&L (live)' : 'P&L'

  return (
    <article className={`${styles.card} ${mandate.armed ? styles.cardLive : ''}`}>
      <div className={styles.cardTop}>
        <div className={styles.cardLabel}>
          <span className={`${styles.dot} ${STATUS_TONE[mandate.status]}`} />
          <strong>{mandate.label}</strong>
        </div>
        <span className={styles.cardStatus}>{mandate.status}</span>
      </div>

      <div className={styles.cardMandate}>{mandate.mandateText}</div>

      <div className={styles.cardMeters}>
        <div className={styles.meter}>
          <span className={styles.meterLabel}>Spent</span>
          <div className={styles.bar}><span style={{ width: `${spentPct}%` }} /></div>
          <span className={styles.meterValue}>
            {sol(mandate.spentLamports)} / {sol(mandate.maxExposureLamports)} SOL
          </span>
        </div>
        <div className={styles.cardStats}>
          <div>
            <span className={styles.statLabel}>{pnlLabel}</span>
            <span className={`${styles.statValue} ${pnlClass}`}>
              {pnl >= 0 ? '+' : ''}{sol(pnl)} SOL
              {hasLive && <span className={styles.pnlPct}> ({position!.pnlPct >= 0 ? '+' : ''}{position!.pnlPct.toFixed(1)}%)</span>}
            </span>
          </div>
          <div>
            <span className={styles.statLabel}>Next</span>
            <span className={styles.statValue}>{mandate.armed ? countdown(mandate.nextTickAt) : '—'}</span>
          </div>
          <div>
            <span className={styles.statLabel}>Clip</span>
            <span className={styles.statValue}>{sol(mandate.strategy.clipLamports)} SOL</span>
          </div>
        </div>
      </div>

      {mandate.lastError && <div className={styles.cardError}>{mandate.lastError}</div>}

      <div className={styles.cardActions}>
        {mandate.armed ? (
          <button type="button" className={styles.disarmBtn} onClick={onDisarm} disabled={busy}>Disarm</button>
        ) : (
          <button
            type="button"
            className={styles.armBtn}
            onClick={onArm}
            disabled={busy || mandate.status === 'exhausted'}
          >
            {mandate.status === 'exhausted' ? 'Cap reached' : 'Arm — go live'}
          </button>
        )}
        {!mandate.armed && (
          <button type="button" className={styles.deleteBtn} onClick={onDelete} disabled={busy}>Delete</button>
        )}
      </div>
    </article>
  )
}

function TapeRow({ action }: { action: MandateAction }) {
  return (
    <div className={`${styles.tapeRow} ${DECISION_TONE[action.decision]}`}>
      <span className={styles.tapeDecision}>{action.decision}</span>
      <span className={styles.tapeReason}>{action.reason ?? '—'}</span>
      {action.signature ? (
        <a className={styles.tapeSig} href={SOLSCAN_TX(action.signature)} target="_blank" rel="noreferrer">
          {shortAddr(action.signature)}
        </a>
      ) : action.status === 'failed' ? (
        <span className={styles.tapeFail}>failed</span>
      ) : (
        <span className={styles.tapeMuted}>—</span>
      )}
    </div>
  )
}

function CreateMandateForm({
  wallets, onCreated, onAnnounce,
}: {
  wallets: WalletListEntry[]
  onCreated: () => void
  onAnnounce: (msg: string) => void
}) {
  const [label, setLabel] = useState('')
  const [walletId, setWalletId] = useState('')
  const [targetMint, setTargetMint] = useState('')
  const [mandateText, setMandateText] = useState('')
  const [clipSol, setClipSol] = useState('0.1')
  const [maxExposureSol, setMaxExposureSol] = useState('1')
  const [intervalMinutes, setIntervalMinutes] = useState('5')
  const [slippageBps, setSlippageBps] = useState('300')
  const [takeProfitPct, setTakeProfitPct] = useState('')
  const [stopLossPct, setStopLossPct] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = useCallback(async () => {
    setBusy(true)
    const rules: { kind: 'take_profit' | 'stop_loss'; threshold: number }[] = []
    if (Number(takeProfitPct) > 0) rules.push({ kind: 'take_profit', threshold: Number(takeProfitPct) })
    if (Number(stopLossPct) > 0) rules.push({ kind: 'stop_loss', threshold: Number(stopLossPct) })
    const res = await daemon.autopilot.create({
      label: label.trim(),
      walletId,
      mandateText: mandateText.trim() || label.trim(),
      strategy: {
        targetMint: targetMint.trim(),
        clipLamports: Math.round(Number(clipSol) * LAMPORTS_PER_SOL),
        slippageBps: Number(slippageBps),
        rules,
      },
      maxExposureLamports: Math.round(Number(maxExposureSol) * LAMPORTS_PER_SOL),
      intervalSeconds: Math.round(Number(intervalMinutes) * 60),
    })
    setBusy(false)
    if (res.ok) { onAnnounce('Draft mandate saved. Arm it to go live.'); onCreated() }
  }, [label, walletId, mandateText, targetMint, clipSol, slippageBps, takeProfitPct, stopLossPct, maxExposureSol, intervalMinutes, onCreated, onAnnounce])

  const valid = label.trim() && walletId && targetMint.trim() && Number(clipSol) > 0 && Number(maxExposureSol) >= Number(clipSol)

  return (
    <div className={styles.form}>
      <div className={styles.formGrid}>
        <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="DCA into BONK" /></label>
        <label>
          Wallet
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)}>
            <option value="">Select wallet…</option>
            {wallets.map((w) => <option key={w.id} value={w.id}>{w.name ?? shortAddr(w.address)}</option>)}
          </select>
        </label>
        <label className={styles.formWide}>Target mint<input value={targetMint} onChange={(e) => setTargetMint(e.target.value)} placeholder="Token mint address" /></label>
        <label className={styles.formWide}>Mandate (plain English)<input value={mandateText} onChange={(e) => setMandateText(e.target.value)} placeholder="DCA 0.1 SOL into BONK every 5 min, cap 1 SOL" /></label>
        <label>Clip (SOL)<input type="number" step="0.01" value={clipSol} onChange={(e) => setClipSol(e.target.value)} /></label>
        <label>Max exposure (SOL)<input type="number" step="0.1" value={maxExposureSol} onChange={(e) => setMaxExposureSol(e.target.value)} /></label>
        <label>Interval (min)<input type="number" step="1" value={intervalMinutes} onChange={(e) => setIntervalMinutes(e.target.value)} /></label>
        <label>Slippage (bps)<input type="number" step="50" value={slippageBps} onChange={(e) => setSlippageBps(e.target.value)} /></label>
        <label>Take-profit (%)<input type="number" step="5" value={takeProfitPct} onChange={(e) => setTakeProfitPct(e.target.value)} placeholder="off" /></label>
        <label>Stop-loss (%)<input type="number" step="5" value={stopLossPct} onChange={(e) => setStopLossPct(e.target.value)} placeholder="off" /></label>
      </div>
      <div className={styles.formActions}>
        <button type="button" className={styles.newBtn} onClick={() => void submit()} disabled={!valid || busy}>
          Save draft
        </button>
      </div>
    </div>
  )
}

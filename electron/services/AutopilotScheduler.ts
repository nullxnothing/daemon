import { BrowserWindow } from 'electron'
import { listArmedMandates, tickMandate, getMandateOrThrow, reconcileInterruptedTicks } from './AutopilotService'

// Autopilot scheduler.
// A single main-process loop that wakes due mandates and runs one tick each. Modeled on the
// runAllFlywheels philosophy: sequential, continue-past-failures, never let one mandate's
// error stall the others. The loop is the ONLY caller of tickMandate in production, and it
// guards against re-entrancy so a slow tick (a swap landing) can't overlap the next sweep.

// Sweep cadence — how often we check for due mandates. Individual mandates fire on their own
// intervalSeconds; this is just the resolution of the clock, kept tight so countdowns feel live.
const SWEEP_INTERVAL_MS = 5_000

let timer: ReturnType<typeof setInterval> | null = null
let sweeping = false

/** True while the scheduler loop is active (surfaced in AutopilotState.running). */
export function isRunning(): boolean {
  return timer !== null
}

/** Push a one-line nudge to the renderer so the Desk refreshes after an autonomous action. */
function notifyRenderer(): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('autopilot:changed')
  }
}

/**
 * One sweep: find every armed mandate whose next_tick_at is due and run its tick. Re-entrancy
 * guarded — if the previous sweep is still settling a swap, this one returns immediately.
 */
async function sweep(): Promise<void> {
  if (sweeping) return
  sweeping = true
  try {
    const now = Date.now()
    const due = listArmedMandates().filter((m) => m.nextTickAt !== null && m.nextTickAt <= now)
    if (due.length === 0) return

    let fired = false
    for (const mandate of due) {
      // Re-read inside the loop: a kill switch fired mid-sweep must take effect immediately.
      let current
      try {
        current = getMandateOrThrow(mandate.id)
      } catch {
        continue // deleted mid-sweep
      }
      if (!current.armed || current.nextTickAt === null || current.nextTickAt > Date.now()) continue
      try {
        await tickMandate(mandate.id)
        fired = true
      } catch (err) {
        // tickMandate already persists per-mandate errors to the ledger/card; a throw here is
        // an unexpected infra failure. Swallow so one mandate can't stall the whole loop.
        console.warn('[autopilot] tick failed for', mandate.id, err instanceof Error ? err.message : String(err))
      }
    }
    if (fired) notifyRenderer()
  } finally {
    sweeping = false
  }
}

/** Start the scheduler loop. Idempotent — a second call is a no-op. */
export function start(): void {
  if (timer) return
  // Reconcile any tick interrupted mid-swap by a crash BEFORE the first sweep, so a mandate
  // held for review is never replayed into a double-buy.
  try {
    const held = reconcileInterruptedTicks()
    if (held > 0) console.warn(`[autopilot] held ${held} mandate(s) with an interrupted tick for review`)
  } catch (err) {
    console.warn('[autopilot] boot reconcile failed:', err instanceof Error ? err.message : String(err))
  }
  timer = setInterval(() => {
    void sweep().catch((err) => {
      console.warn('[autopilot] sweep error:', err instanceof Error ? err.message : String(err))
    })
  }, SWEEP_INTERVAL_MS)
  // Don't keep the process alive solely for the scheduler.
  if (typeof timer.unref === 'function') timer.unref()
}

/** Stop the scheduler loop (shutdown). In-flight ticks finish; no new sweeps start. */
export function stop(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

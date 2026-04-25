import { useMemo, useState } from 'react'
import { useNotificationsStore, type ActivityEntry } from '../../store/notifications'
import './ActivityTimeline.css'

type ActivityFilter = 'all' | 'wallet' | 'runtime' | 'terminal' | 'scaffold' | 'errors'

const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'scaffold', label: 'Scaffold' },
  { id: 'errors', label: 'Errors' },
]

function classifyActivity(entry: ActivityEntry): Exclude<ActivityFilter, 'all' | 'errors'> | 'system' {
  const haystack = `${entry.context ?? ''} ${entry.message}`.toLowerCase()
  if (haystack.includes('wallet') || haystack.includes('swap') || haystack.includes('send') || haystack.includes('signature')) return 'wallet'
  if (haystack.includes('runtime') || haystack.includes('validator') || haystack.includes('preflight') || haystack.includes('toolchain')) return 'runtime'
  if (haystack.includes('terminal') || haystack.includes('shell') || haystack.includes('pty')) return 'terminal'
  if (haystack.includes('scaffold') || haystack.includes('starter') || haystack.includes('project')) return 'scaffold'
  return 'system'
}

function formatTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(createdAt))
}

function matchesFilter(entry: ActivityEntry, filter: ActivityFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'errors') return entry.kind === 'error' || entry.kind === 'warning'
  return classifyActivity(entry) === filter
}

export function ActivityTimeline() {
  const activity = useNotificationsStore((s) => s.activity)
  const loadActivity = useNotificationsStore((s) => s.loadActivity)
  const clearActivity = useNotificationsStore((s) => s.clearActivity)
  const [filter, setFilter] = useState<ActivityFilter>('all')

  const filtered = useMemo(
    () => activity.filter((entry) => matchesFilter(entry, filter)),
    [activity, filter],
  )

  const counts = useMemo(() => {
    const next: Record<ActivityFilter, number> = {
      all: activity.length,
      wallet: 0,
      runtime: 0,
      terminal: 0,
      scaffold: 0,
      errors: 0,
    }
    for (const entry of activity) {
      const category = classifyActivity(entry)
      if (category in next) next[category as ActivityFilter] += 1
      if (entry.kind === 'error' || entry.kind === 'warning') next.errors += 1
    }
    return next
  }, [activity])

  return (
    <div className="activity-timeline">
      <header className="activity-hero">
        <div>
          <div className="activity-kicker">DAEMON Flight Recorder</div>
          <h2>Activity Timeline</h2>
          <p>One durable trail for Solana scaffolds, terminal sessions, wallet execution, runtime checks, and failures.</p>
        </div>
        <div className="activity-hero-actions">
          <button className="activity-btn" onClick={() => void loadActivity()}>Refresh</button>
          <button className="activity-btn danger" onClick={() => void clearActivity()} disabled={activity.length === 0}>Clear</button>
        </div>
      </header>

      <div className="activity-filter-row" role="tablist" aria-label="Activity filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={filter === item.id}
            className={`activity-filter ${filter === item.id ? 'active' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            <span>{item.label}</span>
            <strong>{counts[item.id]}</strong>
          </button>
        ))}
      </div>

      <section className="activity-stream" aria-label="Activity stream">
        {filtered.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-title">No matching activity yet</span>
            <span>Run a scaffold, terminal, wallet action, validator, or runtime check and DAEMON will record it here.</span>
          </div>
        ) : (
          filtered.map((entry) => {
            const category = classifyActivity(entry)
            return (
              <article key={entry.id} className={`activity-entry ${entry.kind}`}>
                <div className={`activity-dot ${entry.kind}`} />
                <div className="activity-entry-main">
                  <div className="activity-entry-top">
                    <span className="activity-entry-context">{entry.context ?? category}</span>
                    <span className="activity-entry-category">{category}</span>
                    <time>{formatTime(entry.createdAt)}</time>
                  </div>
                  <div className="activity-entry-message">{entry.message}</div>
                </div>
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}

export default ActivityTimeline

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

type ActivitySessionGroup = {
  id: string
  title: string
  status: NonNullable<ActivityEntry['sessionStatus']> | 'activity'
  projectName: string | null
  entries: ActivityEntry[]
  latestAt: number
  hasProblems: boolean
}

function deriveSessionStatus(entries: ActivityEntry[]): ActivitySessionGroup['status'] {
  const statuses = entries.map((entry) => entry.sessionStatus).filter(Boolean)
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('complete')) return 'complete'
  if (statuses.includes('running')) return 'running'
  if (statuses.includes('created')) return 'created'
  return 'activity'
}

function groupActivity(entries: ActivityEntry[]): ActivitySessionGroup[] {
  const bySession = new Map<string, ActivityEntry[]>()
  const standalone: ActivityEntry[] = []

  for (const entry of entries) {
    if (entry.sessionId) {
      bySession.set(entry.sessionId, [...(bySession.get(entry.sessionId) ?? []), entry])
    } else {
      standalone.push(entry)
    }
  }

  const groups: ActivitySessionGroup[] = []
  for (const [sessionId, sessionEntries] of bySession) {
    const sorted = [...sessionEntries].sort((a, b) => b.createdAt - a.createdAt)
    const first = sorted[sorted.length - 1]
    const projectName = sorted.find((entry) => entry.projectName)?.projectName ?? null
    groups.push({
      id: sessionId,
      title: first?.message ?? 'Execution session',
      status: deriveSessionStatus(sorted),
      projectName,
      entries: sorted,
      latestAt: sorted[0]?.createdAt ?? 0,
      hasProblems: sorted.some((entry) => entry.kind === 'error' || entry.kind === 'warning'),
    })
  }

  for (const entry of standalone) {
    groups.push({
      id: entry.id,
      title: entry.message,
      status: 'activity',
      projectName: entry.projectName ?? null,
      entries: [entry],
      latestAt: entry.createdAt,
      hasProblems: entry.kind === 'error' || entry.kind === 'warning',
    })
  }

  return groups.sort((a, b) => b.latestAt - a.latestAt)
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
  const grouped = useMemo(() => groupActivity(filtered), [filtered])

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
        {grouped.length === 0 ? (
          <div className="activity-empty">
            <span className="activity-empty-title">No matching activity yet</span>
            <span>Run a scaffold, terminal, wallet action, validator, or runtime check and DAEMON will record it here.</span>
          </div>
        ) : (
          grouped.map((group) => (
            <article key={group.id} className={`activity-session ${group.hasProblems ? 'problem' : ''}`}>
              <header className="activity-session-header">
                <div>
                  <div className="activity-session-title">{group.projectName ?? 'DAEMON execution'}</div>
                  <div className="activity-session-subtitle">{group.title}</div>
                </div>
                <div className={`activity-session-status ${group.status}`}>{group.status}</div>
              </header>
              <div className="activity-session-events">
                {group.entries.map((entry) => {
                  const category = classifyActivity(entry)
                  return (
                    <div key={entry.id} className={`activity-entry ${entry.kind}`}>
                      <div className={`activity-dot ${entry.kind}`} />
                      <div className="activity-entry-main">
                        <div className="activity-entry-top">
                          <span className="activity-entry-context">{entry.context ?? category}</span>
                          <span className="activity-entry-category">{category}</span>
                          <time>{formatTime(entry.createdAt)}</time>
                        </div>
                        <div className="activity-entry-message">{entry.message}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  )
}

export default ActivityTimeline

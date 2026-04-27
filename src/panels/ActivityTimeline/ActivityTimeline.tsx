import { useMemo, useState } from 'react'
import { useNotificationsStore, type ActivityArtifact, type ActivityEntry } from '../../store/notifications'
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
  artifacts: ActivityArtifact[]
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
      artifacts: collectArtifacts(sorted),
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
      artifacts: collectArtifacts([entry]),
    })
  }

  return groups.sort((a, b) => b.latestAt - a.latestAt)
}

export function ActivityTimeline() {
  const activity = useNotificationsStore((s) => s.activity)
  const loadActivity = useNotificationsStore((s) => s.loadActivity)
  const saveActivitySummary = useNotificationsStore((s) => s.saveActivitySummary)
  const clearActivity = useNotificationsStore((s) => s.clearActivity)
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [busySummaryId, setBusySummaryId] = useState<string | null>(null)

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

  const handleSummarize = async (group: ActivitySessionGroup) => {
    const summary = buildSessionReport(group)
    setBusySummaryId(group.id)
    try {
      await saveActivitySummary(group.id, summary)
    } finally {
      setBusySummaryId(null)
    }
  }

  const handleCopy = async (group: ActivitySessionGroup) => {
    const summary = group.entries.find((entry) => entry.sessionSummary)?.sessionSummary ?? buildSessionReport(group)
    await navigator.clipboard?.writeText(summary)
  }

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
                <div className="activity-session-controls">
                  <div className={`activity-session-status ${group.status}`}>{group.status}</div>
                  <button
                    className="activity-mini-btn"
                    onClick={() => void handleSummarize(group)}
                    disabled={busySummaryId === group.id}
                  >
                    {group.entries.some((entry) => entry.sessionSummary) ? 'Refresh report' : 'Summarize'}
                  </button>
                  <button className="activity-mini-btn" onClick={() => void handleCopy(group)}>Copy</button>
                </div>
              </header>
              {group.entries.find((entry) => entry.sessionSummary)?.sessionSummary && (
                <pre className="activity-session-report">
                  {group.entries.find((entry) => entry.sessionSummary)?.sessionSummary}
                </pre>
              )}
              {group.artifacts.length > 0 && (
                <div className="activity-artifacts" aria-label="Session artifacts">
                  {group.artifacts.map((artifact) => (
                    <a
                      key={`${artifact.type}-${artifact.value}`}
                      className={`activity-artifact ${artifact.type}`}
                      href={artifact.href ?? undefined}
                      target={artifact.href ? '_blank' : undefined}
                      rel={artifact.href ? 'noreferrer' : undefined}
                    >
                      <span>{artifact.label}</span>
                      <strong>{compactArtifactValue(artifact.value)}</strong>
                    </a>
                  ))}
                </div>
              )}
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

function buildSessionReport(group: ActivitySessionGroup): string {
  const ordered = [...group.entries].sort((a, b) => a.createdAt - b.createdAt)
  const categories = new Set(ordered.map(classifyActivity))
  const problems = ordered.filter((entry) => entry.kind === 'error' || entry.kind === 'warning')
  const txEvents = ordered.filter((entry) => classifyActivity(entry) === 'wallet')
  const runtimeEvents = ordered.filter((entry) => classifyActivity(entry) === 'runtime')
  const terminalEvents = ordered.filter((entry) => classifyActivity(entry) === 'terminal')
  const scaffoldEvents = ordered.filter((entry) => classifyActivity(entry) === 'scaffold')
  const last = ordered[ordered.length - 1]

  const lines = [
    `DAEMON Session Report: ${group.projectName ?? 'workspace execution'}`,
    `Status: ${group.status}`,
    `Objective: ${group.title}`,
    `Scope: ${[...categories].join(', ') || 'activity'}`,
    '',
    'What happened:',
    ...ordered.slice(0, 6).map((entry) => `- ${entry.context ?? classifyActivity(entry)}: ${entry.message}`),
  ]

  if (ordered.length > 6) lines.push(`- ${ordered.length - 6} additional event${ordered.length - 6 === 1 ? '' : 's'} recorded.`)
  if (scaffoldEvents.length > 0) lines.push('', `Scaffold: ${scaffoldEvents[scaffoldEvents.length - 1].message}`)
  if (terminalEvents.length > 0) lines.push(`Terminal: ${terminalEvents.length} terminal event${terminalEvents.length === 1 ? '' : 's'} recorded.`)
  if (runtimeEvents.length > 0) lines.push(`Runtime/deploy: ${runtimeEvents[runtimeEvents.length - 1].message}`)
  if (txEvents.length > 0) lines.push(`Wallet/tx: ${txEvents[txEvents.length - 1].message}`)
  if (group.artifacts.length > 0) {
    lines.push('', 'Launch artifacts:')
    lines.push(...group.artifacts.map((artifact) => `- ${artifact.label}: ${artifact.value}${artifact.href ? ` (${artifact.href})` : ''}`))
  }
  if (problems.length > 0) {
    lines.push('', 'Needs attention:')
    lines.push(...problems.slice(-3).map((entry) => `- ${entry.message}`))
  }
  lines.push('', `Next action: ${deriveNextAction(group, problems, last)}`)

  return lines.join('\n')
}

function collectArtifacts(entries: ActivityEntry[]): ActivityArtifact[] {
  const artifacts: ActivityArtifact[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    for (const artifact of [...(entry.artifacts ?? []), ...extractArtifacts(entry)]) {
      const key = `${artifact.type}:${artifact.value}`
      if (seen.has(key)) continue
      seen.add(key)
      artifacts.push(artifact)
    }
  }

  return artifacts.slice(0, 12)
}

function extractArtifacts(entry: ActivityEntry): ActivityArtifact[] {
  const haystack = `${entry.context ?? ''} ${entry.message}`
  const artifacts: ActivityArtifact[] = []
  const signatures = haystack.match(/\b[1-9A-HJ-NP-Za-km-z]{64,88}\b/g) ?? []
  const urls = haystack.match(/https?:\/\/[^\s)]+/g) ?? []
  const windowsPaths = haystack.match(/[A-Za-z]:[\\/][^\s,;]+/g) ?? []
  const programIds = haystack.match(/program(?: id)?[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)
  const wallet = haystack.match(/wallet[:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/i)

  for (const signature of signatures.slice(0, 4)) {
    artifacts.push({
      type: 'transaction',
      label: 'Tx signature',
      value: signature,
      href: `https://solscan.io/tx/${signature}`,
    })
  }

  for (const url of urls.slice(0, 4)) {
    const isExplorer = isSolanaExplorerUrl(url)
    artifacts.push({
      type: isExplorer ? 'explorer' : 'other',
      label: isExplorer ? 'Explorer' : 'Link',
      value: url,
      href: url,
    })
  }

  for (const path of windowsPaths.slice(0, 2)) {
    artifacts.push({ type: 'project', label: 'Project path', value: path })
  }

  if (programIds?.[1]) {
    artifacts.push({
      type: 'program',
      label: 'Program ID',
      value: programIds[1],
      href: `https://explorer.solana.com/address/${programIds[1]}`,
    })
  }

  if (wallet?.[1]) {
    artifacts.push({
      type: 'wallet',
      label: 'Wallet',
      value: wallet[1],
      href: `https://explorer.solana.com/address/${wallet[1]}`,
    })
  }

  if (classifyActivity(entry) === 'runtime' && /deploy|launched|confirmed/i.test(entry.message)) {
    artifacts.push({ type: 'deploy', label: 'Deploy event', value: entry.message })
  }

  return artifacts
}

function compactArtifactValue(value: string): string {
  if (value.length <= 34) return value
  return `${value.slice(0, 16)}...${value.slice(-10)}`
}

function isSolanaExplorerUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host === 'explorer.solana.com' || host === 'solscan.io' || host.endsWith('.solscan.io')
  } catch {
    return false
  }
}

function deriveNextAction(group: ActivitySessionGroup, problems: ActivityEntry[], last?: ActivityEntry): string {
  if (group.status === 'failed') return 'Open the failed event, fix the blocker, then rerun the session from the same project context.'
  if (group.status === 'blocked' || problems.length > 0) return 'Resolve the warnings/errors above, then rerun preflight before executing wallet or deploy steps.'
  if (group.status === 'running') return 'Continue monitoring the terminal/runtime output and mark the session complete once build/deploy verification passes.'
  if (group.status === 'complete') return 'Share this report as the handoff artifact and archive the session.'
  if (last && classifyActivity(last) === 'scaffold') return 'Open the generated project, run install/build checks, then attach terminal output to this session.'
  return 'Continue from the latest recorded event and capture the next terminal, wallet, or deploy action in DAEMON.'
}

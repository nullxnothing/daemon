import { useMemo, useState } from 'react'
import { useNotificationsStore } from '../../store/notifications'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Badge, Card, PanelHeader, StatusDot, TabPill, Toolbar } from '../../components/Panel'
import type { ActivityEntry } from '../../store/notifications'
import {
  FILTERS,
  type ActivityFilter,
  type ActivityIssueGroup,
  type ActivitySessionGroup,
  buildSessionReport,
  classifyActivity,
  compactArtifactValue,
  formatTime,
  getActivityCounts,
  groupActivity,
  matchesFilter,
} from './activityModel'
import './ActivityTimeline.css'

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

  const counts = useMemo(() => getActivityCounts(activity), [activity])

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
      <PanelHeader
        kicker="DAEMON Flight Recorder"
        title="Activity Timeline"
        subtitle="One durable trail for Solana scaffolds, terminal sessions, wallet execution, runtime checks, and failures."
        actions={(
          <Toolbar>
            <Button variant="secondary" onClick={() => void loadActivity()}>Refresh</Button>
            <Button variant="secondary" onClick={() => void clearActivity()} disabled={activity.length === 0}>Clear</Button>
          </Toolbar>
        )}
      />

      <div className="activity-filter-row" role="tablist" aria-label="Activity filters">
        {FILTERS.map((item) => (
          <TabPill
            key={item.id}
            role="tab"
            aria-selected={filter === item.id}
            active={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            <span>{item.label}</span>
            <strong>{counts[item.id]}</strong>
          </TabPill>
        ))}
      </div>

      <section className="activity-stream" aria-label="Activity stream">
        {grouped.length === 0 ? (
          <EmptyState
            title="No matching activity yet"
            description="Run a scaffold, terminal, wallet action, validator, or runtime check and DAEMON will record it here."
          />
        ) : (
          grouped.map((group) => (
            <Card key={group.id} tone={group.hasProblems ? 'warn' : 'default'} className="activity-session">
              <header className="activity-session-header">
                <div>
                  <div className="activity-session-title">{group.projectName ?? 'DAEMON execution'}</div>
                  <div className="activity-session-subtitle">{group.title}</div>
                </div>
                <Toolbar className="activity-session-controls">
                  <Badge tone={getSessionTone(group.status)} className="activity-session-status">{group.status}</Badge>
                  <Button
                    variant="ghost"
                    className="activity-mini-btn"
                    onClick={() => void handleSummarize(group)}
                    disabled={busySummaryId === group.id}
                  >
                    {group.entries.some((entry) => entry.sessionSummary) ? 'Refresh report' : 'Summarize'}
                  </Button>
                  <Button variant="ghost" className="activity-mini-btn" onClick={() => void handleCopy(group)}>Copy</Button>
                </Toolbar>
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
              {group.issueGroups.length > 0 && (
                <div className="activity-issues" aria-label="Grouped issues">
                  {group.issueGroups.map((issue) => (
                    <ActionableIssueCard key={issue.id} issue={issue} />
                  ))}
                </div>
              )}
              <div className="activity-session-events">
                {group.entries.map((entry) => (
                  <EventRow key={entry.id} entry={entry} />
                ))}
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  )
}

export default ActivityTimeline

function ActionableIssueCard({ issue }: { issue: ActivityIssueGroup }) {
  const tone = issue.kind === 'error' ? 'danger' : 'warning'
  const occurrenceLabel = issue.entries.length === 1
    ? `1 occurrence · ${formatTime(issue.latestAt)}`
    : `${issue.entries.length} occurrences · first ${formatTime(issue.firstAt)} · latest ${formatTime(issue.latestAt)}`

  return (
    <div className={`activity-issue-card ${issue.kind}`}>
      <StatusDot tone={tone} label={`${issue.kind}: ${issue.title}`} className="activity-dot" />
      <div className="activity-issue-main">
        <div className="activity-entry-message">{issue.title}</div>
        <div className="activity-entry-meta">
          <span className="activity-entry-context">{issue.context ?? issue.category}</span>
          <span className="activity-entry-sep">·</span>
          <span>{issue.category}</span>
          <span className="activity-entry-sep">·</span>
          <span>{occurrenceLabel}</span>
        </div>
      </div>
    </div>
  )
}

function EventRow({ entry }: { entry: ActivityEntry }) {
  const category = classifyActivity(entry)
  const tone = entry.kind === 'success' ? 'success' : entry.kind === 'warning' ? 'warning' : entry.kind === 'error' ? 'danger' : 'info'

  return (
    <div className={`activity-entry ${entry.kind}`}>
      <time className="activity-entry-time">{formatTime(entry.createdAt)}</time>
      <StatusDot tone={tone} className="activity-dot" />
      <div className="activity-entry-main">
        <div className="activity-entry-message">{entry.message}</div>
        <div className="activity-entry-meta">
          <span className="activity-entry-context">{entry.context ?? category}</span>
          <span className="activity-entry-sep">·</span>
          <span>{category}</span>
        </div>
      </div>
    </div>
  )
}

function getSessionTone(status: ActivitySessionGroup['status']) {
  if (status === 'running' || status === 'complete') return 'success'
  if (status === 'created') return 'info'
  if (status === 'blocked') return 'warning'
  if (status === 'failed') return 'danger'
  return 'neutral'
}

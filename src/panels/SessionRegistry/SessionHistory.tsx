import { useState, useEffect, useCallback } from 'react'
import './SessionHistory.css'

function formatDuration(startedAt: number, endedAt: number | null): string {
  const end = endedAt ?? Date.now()
  const ms = end - startedAt
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ${secs % 60}s`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ${mins % 60}m`
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function modelLabel(model: string | null): string {
  if (!model) return '—'
  const lower = model.toLowerCase()
  if (lower.includes('opus')) return 'Opus'
  if (lower.includes('sonnet')) return 'Sonnet'
  if (lower.includes('haiku')) return 'Haiku'
  return model.split('-').slice(0, 2).join(' ')
}

function modelClass(model: string | null): string {
  if (!model) return ''
  const lower = model.toLowerCase()
  if (lower.includes('opus')) return 'opus'
  if (lower.includes('sonnet')) return 'sonnet'
  if (lower.includes('haiku')) return 'haiku'
  return ''
}

interface SessionRowProps {
  session: LocalAgentSession
  onPublish: (id: string) => void
  isPublishing: boolean
}

function SessionRow({ session, onPublish, isPublishing }: SessionRowProps) {
  const isActive = session.status === 'active'
  const isPublished = !!session.published_signature

  return (
    <div className={`sr-row ${isActive ? 'sr-row--active' : ''}`}>
      <div className="sr-row-left">
        <span className={`sr-dot sr-dot--${session.status}`} />
        <div className="sr-row-info">
          <span className="sr-agent-name">{session.agent_name ?? 'Unknown Agent'}</span>
          <span className="sr-row-meta">
            {formatRelative(session.created_at)}
            {!isActive && session.ended_at
              ? ` · ${formatDuration(session.started_at, session.ended_at)}`
              : isActive ? ' · running' : ''}
          </span>
        </div>
      </div>
      <div className="sr-row-right">
        <span className={`sr-model-badge sr-model-badge--${modelClass(session.model)}`}>
          {modelLabel(session.model)}
        </span>
        {isPublished ? (
          <span className="sr-published-badge">on-chain</span>
        ) : session.status === 'completed' ? (
          <button
            className="sr-publish-btn"
            onClick={() => onPublish(session.id)}
            disabled={isPublishing}
          >
            {isPublishing ? '...' : 'Publish'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function SessionHistory() {
  const [sessions, setSessions] = useState<LocalAgentSession[]>([])
  const [profile, setProfile] = useState<AgentSessionProfile | null>(null)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [publishAllBusy, setPublishAllBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    window.daemon.registry.listSessions(30).then((res) => {
      if (res.ok && res.data) setSessions(res.data)
    }).catch(() => {})

    window.daemon.registry.getProfile().then((res) => {
      if (res.ok && res.data) setProfile(res.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [load])

  const handlePublish = useCallback(async (sessionId: string) => {
    setError(null)
    setPublishingId(sessionId)
    try {
      const res = await window.daemon.registry.publishSession(sessionId)
      if (res.ok) {
        load()
      } else {
        setError(res.error ?? 'Publish failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setPublishingId(null)
    }
  }, [load])

  const handlePublishAll = useCallback(async () => {
    setError(null)
    setPublishAllBusy(true)
    try {
      const res = await window.daemon.registry.publishAll()
      if (res.ok && res.data) {
        load()
        if (res.data.failed > 0) {
          setError(`${res.data.published} published, ${res.data.failed} failed`)
        }
      } else {
        setError(res.error ?? 'Publish failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setPublishAllBusy(false)
    }
  }, [load])

  const unpublishedCount = profile?.unpublishedCount ?? 0

  return (
    <div className="session-history">
      {profile && (
        <div className="sr-stats">
          <div className="sr-stat">
            <span className="sr-stat-value">{profile.totalSessions}</span>
            <span className="sr-stat-label">sessions</span>
          </div>
          <div className="sr-stat">
            <span className="sr-stat-value">{profile.projectsCount}</span>
            <span className="sr-stat-label">projects</span>
          </div>
          <div className="sr-stat">
            <span className="sr-stat-value">{Math.round(profile.totalDuration / 60000)}m</span>
            <span className="sr-stat-label">total time</span>
          </div>
        </div>
      )}

      {error && <div className="sr-error">{error}</div>}

      {unpublishedCount > 0 && (
        <div className="sr-publish-bar">
          <span className="sr-publish-bar-text">
            {unpublishedCount} unpublished {unpublishedCount === 1 ? 'session' : 'sessions'}
          </span>
          <button
            className="sr-publish-all-btn"
            onClick={handlePublishAll}
            disabled={publishAllBusy}
          >
            {publishAllBusy ? 'Publishing...' : 'Publish All'}
          </button>
        </div>
      )}

      <div className="sr-list">
        {sessions.length === 0 ? (
          <div className="sr-empty">No sessions yet. Spawn an agent to start tracking.</div>
        ) : (
          sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onPublish={handlePublish}
              isPublishing={publishingId === s.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '../../store/ui'
import { EmptyState } from '../../components/EmptyState'
import { Banner, PanelHeader, Stat } from '../../components/Panel'
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
  terminalAlive: boolean
  onPublish: (id: string) => void
  onRename: (id: string, name: string) => void
  onResume: (session: LocalAgentSession) => void
  onRelaunch: (session: LocalAgentSession) => void
  isPublishing: boolean
}

function SessionRow({ session, terminalAlive, onPublish, onRename, onResume, onRelaunch, isPublishing }: SessionRowProps) {
  const isActive = session.status === 'active'
  const isPublished = !!session.published_signature
  const displayName = session.custom_name ?? session.agent_name ?? 'Unknown Agent'

  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(displayName)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setEditValue(displayName)
    setIsEditing(true)
  }

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const commitEdit = () => {
    setIsEditing(false)
    const trimmed = editValue.trim()
    if (trimmed !== displayName) {
      onRename(session.id, trimmed)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setIsEditing(false)
  }

  // terminal_id null = pre-V19 session, never had a tracked terminal
  // terminal_id set but terminalAlive=false = terminal was closed
  const hasTerminalId = !!session.terminal_id
  const canResume = isActive && hasTerminalId && terminalAlive
  const terminalClosed = isActive && hasTerminalId && !terminalAlive
  const canRelaunch = !isActive && !!session.agent_id

  return (
    <div className={`sr-row ${isActive ? 'sr-row--active' : ''}`}>
      <div className="sr-row-left">
        <span className={`sr-dot sr-dot--${session.status}`} />
        <div className="sr-row-info">
          {isEditing ? (
            <input
              ref={inputRef}
              className="sr-name-input"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              maxLength={80}
            />
          ) : (
            <button
              className="sr-agent-name sr-agent-name--editable"
              onClick={startEdit}
              title="Click to rename"
            >
              {displayName}
            </button>
          )}
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
        {canResume && (
          <button
            className="sr-action-btn sr-action-btn--resume"
            onClick={() => onResume(session)}
          >
            Resume
          </button>
        )}
        {terminalClosed && (
          <span className="sr-terminal-closed" title="Terminal was closed">
            Terminal closed
          </span>
        )}
        {canRelaunch && (
          <button
            className="sr-action-btn sr-action-btn--relaunch"
            onClick={() => onRelaunch(session)}
          >
            Re-launch
          </button>
        )}
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

  const terminals = useUIStore((s) => s.terminals)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const setActiveTerminal = useUIStore((s) => s.setActiveTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)

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

  const handleRename = useCallback(async (sessionId: string, name: string) => {
    try {
      await window.daemon.registry.renameSession(sessionId, name)
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, custom_name: name.trim() || null } : s
        )
      )
    } catch {
      // best-effort
    }
  }, [])

  const handleResume = useCallback((session: LocalAgentSession) => {
    if (!session.terminal_id) return

    const terminal = terminals.find((t) => t.id === session.terminal_id)
    if (!terminal) return

    const projectId = terminal.projectId

    // Switch to canvas, show terminal, activate the right tab
    setCenterMode('canvas')
    setActiveTerminal(projectId, session.terminal_id)

    // Small delay so the terminal is visible before writing
    setTimeout(() => {
      window.daemon.terminal.write(session.terminal_id!, '/resume\n')
    }, 200)
  }, [terminals, setActiveTerminal, setCenterMode])

  const handleRelaunch = useCallback(async (session: LocalAgentSession) => {
    if (!session.agent_id) return
    const projectId = session.project_id ?? activeProjectId
    if (!projectId) return

    setError(null)
    try {
      const res = await window.daemon.terminal.spawnAgent({ agentId: session.agent_id, projectId })
      if (res.ok && res.data) {
        const { id, agentName } = res.data
        useUIStore.getState().addTerminal(projectId, id, agentName ?? 'Agent', session.agent_id)
        useUIStore.getState().setCenterMode('canvas')
      }
      load()
    } catch (err) {
      setError(String(err))
    }
  }, [activeProjectId, load])

  const unpublishedCount = profile?.unpublishedCount ?? 0
  const activeCount = sessions.filter((s) => s.status === 'active' && (!s.terminal_id || terminals.some((t) => t.id === s.terminal_id))).length
  const completedCount = sessions.filter((s) => s.status === 'completed').length

  return (
    <div className="session-history">
      <PanelHeader
        className="sr-panel-header"
        kicker="Agent memory"
        brandKicker
        title="Track what is still running and what is worth publishing"
        subtitle="Sessions should be easy to resume, relaunch, rename, and publish without scanning a terminal graveyard."
      />

      {profile && (
        <div className="sr-stats">
          <Stat className="sr-stat" label="active now" value={activeCount} />
          <Stat className="sr-stat" label="completed" value={completedCount} />
          <Stat className="sr-stat" label="projects" value={profile.projectsCount} />
          <Stat className="sr-stat" label="logged time" value={`${Math.round(profile.totalDuration / 60000)}m`} />
        </div>
      )}

      {error && <Banner className="sr-error" tone="danger">{error}</Banner>}

      {unpublishedCount > 0 && (
        <Banner
          className="sr-publish-bar"
          tone="success"
          actions={
            <button
              className="sr-publish-all-btn"
              onClick={handlePublishAll}
              disabled={publishAllBusy}
            >
              {publishAllBusy ? 'Publishing...' : 'Publish All'}
            </button>
          }
        >
          <span className="sr-publish-bar-text">
            {unpublishedCount} unpublished {unpublishedCount === 1 ? 'session' : 'sessions'}
          </span>
        </Banner>
      )}

      <div className="sr-list">
        {sessions.length === 0 ? (
          <EmptyState
            className="sr-empty"
            title="No sessions yet"
            description="Spawn an agent to start tracking."
          />
        ) : (
          sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              terminalAlive={!!s.terminal_id && terminals.some((t) => t.id === s.terminal_id)}
              onPublish={handlePublish}
              onRename={handleRename}
              onResume={handleResume}
              onRelaunch={handleRelaunch}
              isPublishing={publishingId === s.id}
            />
          ))
        )}
      </div>
    </div>
  )
}

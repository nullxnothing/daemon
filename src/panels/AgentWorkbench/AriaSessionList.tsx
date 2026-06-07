import { useMemo, useState } from 'react'
import { useAriaStore } from '../../store/aria'
import { useUIStore } from '../../store/ui'

const VISIBLE_LIMIT = 6

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return day === 1 ? '1 day ago' : `${day} days ago`
}

/** Stacked SESSIONS section: subheader + icon actions, then rows of
 *  [dot] title / project · time, with hover rename/archive/delete. */
export function AriaSessionList() {
  const sessions = useAriaStore((s) => s.sessions)
  const sessionId = useAriaStore((s) => s.sessionId)
  const switchSession = useAriaStore((s) => s.switchSession)
  const renameSession = useAriaStore((s) => s.renameSession)
  const archiveSession = useAriaStore((s) => s.archiveSession)
  const deleteSession = useAriaStore((s) => s.deleteSession)
  const loadSessions = useAriaStore((s) => s.loadSessions)
  const projects = useUIStore((s) => s.projects)

  const [expanded, setExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]))
    return (id: string | null) => (id ? map.get(id) ?? null : null)
  }, [projects])

  const visible = expanded ? sessions : sessions.slice(0, VISIBLE_LIMIT)
  const overflow = sessions.length - VISIBLE_LIMIT

  const commitRename = (id: string) => {
    const title = draft.trim()
    if (title) void renameSession(id, title)
    setRenamingId(null)
    setDraft('')
  }

  return (
    <div className={`aria-sessions${collapsed ? ' collapsed' : ''}`}>
      <div className="aria-sessions-head">
        <button
          type="button"
          className="aria-sessions-toggle"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Show sessions' : 'Hide sessions'}
          aria-expanded={!collapsed}
        >
          <span className="aria-sessions-caret" aria-hidden>{collapsed ? '▸' : '▾'}</span>
          <span className="aria-sessions-kicker">Sessions</span>
          <span className="aria-sessions-count">{sessions.length}</span>
        </button>
        <span className="aria-sessions-head-spacer" />
        <button type="button" className="aria-sessions-icon" title="Refresh" onClick={() => void loadSessions()}>↻</button>
      </div>

      {collapsed ? null : (
      <div className="aria-sessions-list">
        {sessions.length === 0 ? (
          <div className="aria-sessions-empty">No saved chats yet.</div>
        ) : (
          visible.map((s) => {
            const proj = projectName(s.project_id)
            const isActive = s.id === sessionId
            return (
              <div key={s.id} className={`aria-sessions-row${isActive ? ' active' : ''}`}>
                {renamingId === s.id ? (
                  <input
                    className="aria-sessions-rename"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(s.id)
                      if (e.key === 'Escape') { setRenamingId(null); setDraft('') }
                    }}
                    onBlur={() => commitRename(s.id)}
                  />
                ) : (
                  <button type="button" className="aria-sessions-pick" onClick={() => void switchSession(s.id)}>
                    <span className="aria-sessions-dot" data-on={isActive ? 'true' : 'false'} />
                    <span className="aria-sessions-body">
                      <span className="aria-sessions-title">{s.title || 'Untitled chat'}</span>
                      <span className="aria-sessions-meta">
                        {proj ? `${proj} · ` : ''}{relativeTime(s.updated_at)}
                      </span>
                    </span>
                  </button>
                )}
                <div className="aria-sessions-actions">
                  <button type="button" title="Rename" onClick={() => { setRenamingId(s.id); setDraft(s.title || '') }}>✎</button>
                  <button type="button" title="Archive" onClick={() => void archiveSession(s.id)}>⊟</button>
                  <button type="button" title="Delete permanently" className="danger" onClick={() => void deleteSession(s.id)}>✕</button>
                </div>
              </div>
            )
          })
        )}
        {!expanded && overflow > 0 ? (
          <button type="button" className="aria-sessions-more" onClick={() => setExpanded(true)}>
            <span>More</span>
            <span className="aria-sessions-more-count">{overflow}</span>
          </button>
        ) : null}
      </div>
      )}
    </div>
  )
}

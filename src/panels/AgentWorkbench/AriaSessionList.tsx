import { useMemo, useState } from 'react'
import { useAriaStore } from '../../store/aria'
import { useUIStore } from '../../store/ui'

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

/** Single 34px strip: SESSION label, count pill, live dot + active name,
 *  relative time pushed right, refresh. Display-only — management lives in
 *  the header history popover. */
export function AriaSessionStrip() {
  const sessions = useAriaStore((s) => s.sessions)
  const sessionId = useAriaStore((s) => s.sessionId)
  const loadSessions = useAriaStore((s) => s.loadSessions)

  const active = useMemo(() => sessions.find((s) => s.id === sessionId) ?? null, [sessions, sessionId])
  const title = active?.title || 'Untitled chat'
  const time = active ? relativeTime(active.updated_at) : ''

  return (
    <div className="aria-sessions">
      <span className="label">Session</span>
      <span className="aria-sessions-count">{sessions.length}</span>
      <span className="aria-sessions-name">
        <span className="dot live" aria-hidden />
        <span className="aria-sessions-name-text">{title}</span>
      </span>
      {time ? <span className="aria-sessions-time">{time}</span> : null}
      <button type="button" className="aria-sessions-refresh" title="Refresh" aria-label="Refresh" onClick={() => void loadSessions()}>↻</button>
    </div>
  )
}

/** Session history popover (anchored off the header clock button): the full
 *  session list with switch / rename / archive / delete. */
export function SessionHistoryPopover({ onClose }: { onClose: () => void }) {
  const sessions = useAriaStore((s) => s.sessions)
  const sessionId = useAriaStore((s) => s.sessionId)
  const switchSession = useAriaStore((s) => s.switchSession)
  const renameSession = useAriaStore((s) => s.renameSession)
  const archiveSession = useAriaStore((s) => s.archiveSession)
  const deleteSession = useAriaStore((s) => s.deleteSession)
  const projects = useUIStore((s) => s.projects)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const projectName = useMemo(() => {
    const map = new Map(projects.map((p) => [p.id, p.name]))
    return (id: string | null) => (id ? map.get(id) ?? null : null)
  }, [projects])

  const commitRename = (id: string) => {
    const title = draft.trim()
    if (title) void renameSession(id, title)
    setRenamingId(null)
    setDraft('')
  }

  return (
    <div className="aria-history-pop" role="menu">
      <div className="aria-history-head">
        <span className="label">History</span>
        <span className="aria-sessions-count">{sessions.length}</span>
      </div>
      <div className="aria-history-list">
        {sessions.length === 0 ? (
          <div className="aria-sessions-empty">No saved chats yet.</div>
        ) : (
          sessions.map((s) => {
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
                  <button type="button" className="aria-sessions-pick" onClick={() => { void switchSession(s.id); onClose() }}>
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
      </div>
    </div>
  )
}

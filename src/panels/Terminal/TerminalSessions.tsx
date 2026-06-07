interface SessionEntry {
  id: string
  label: string
  agentId: string | null
  projectId: string
}

/** Right-hand SESSIONS list: live terminal sessions with status dot + index. */
export function TerminalSessions({
  sessions,
  activeSessionId,
  onSelect,
  onClose,
}: {
  sessions: SessionEntry[]
  activeSessionId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
}) {
  return (
    <aside className="terminal-sessions" aria-label="Terminal sessions">
      <div className="terminal-sessions-head">Sessions</div>
      <div className="terminal-sessions-list">
        {sessions.map((session, index) => (
          <div
            key={session.id}
            className={`terminal-session${activeSessionId === session.id ? ' active' : ''}`}
          >
            <button
              type="button"
              className="terminal-session-main"
              onClick={() => onSelect(session.id)}
            >
              <span className={`terminal-session-dot${session.agentId ? ' agent' : ''}${activeSessionId === session.id ? ' live' : ''}`} />
              <span className="terminal-session-label">{session.label}</span>
              <span className="terminal-session-index">{index + 1}</span>
            </button>
            <button
              type="button"
              className="terminal-session-close"
              aria-label={`Close ${session.label}`}
              onClick={() => onClose(session.id)}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}

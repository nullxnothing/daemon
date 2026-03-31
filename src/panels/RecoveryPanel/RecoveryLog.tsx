import { useRef, useEffect } from 'react'
import { useRecoveryStore, type RecoveryLogEntry } from '../../store/recovery'

const LEVEL_COLOR: Record<RecoveryLogEntry['level'], string> = {
  info: 'var(--t3)',
  success: 'var(--green)',
  warning: 'var(--amber)',
  error: 'var(--red)',
}

export function RecoveryLog() {
  const logEntries = useRecoveryStore((s) => s.logEntries)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [logEntries.length])

  return (
    <div className="recovery-log" ref={scrollRef}>
      {logEntries.length === 0 && (
        <div className="recovery-log-empty">Click Scan to begin</div>
      )}
      {logEntries.map((entry, i) => (
        <div key={i} className="recovery-log-line">
          <span className="recovery-log-time">
            {new Date(entry.timestamp).toLocaleTimeString(undefined, { hour12: false })}
          </span>
          <span style={{ color: LEVEL_COLOR[entry.level] }}>{entry.message}</span>
        </div>
      ))}
    </div>
  )
}

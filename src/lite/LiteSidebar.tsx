import { useEffect, useMemo, useState } from 'react'
import {
  CaretRight, GearSix, MagnifyingGlass, PencilSimpleLine,
  ShieldCheck, Wallet, ChartLineUp, X,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useAriaStore } from '../store/aria'
import type { LiteView } from './LiteApp'
import styles from './LiteSidebar.module.css'

const TOOL_VIEWS: Array<{ id: LiteView; label: string; icon: Icon }> = [
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'trade', label: 'Trade', icon: ChartLineUp },
  { id: 'scanner', label: 'Scanner', icon: ShieldCheck },
]

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  return `${day}d`
}

interface LiteSidebarProps {
  view: LiteView
  showTools: boolean
  onToggleTools: () => void
  onNewAgent: () => void
  onSelectView: (view: LiteView) => void
  onOpenSettings: () => void
  onPickSession: () => void
}

export function LiteSidebar({
  view, showTools, onToggleTools, onNewAgent, onSelectView, onOpenSettings, onPickSession,
}: LiteSidebarProps) {
  const sessions = useAriaStore((s) => s.sessions)
  const sessionId = useAriaStore((s) => s.sessionId)
  const switchSession = useAriaStore((s) => s.switchSession)
  const deleteSession = useAriaStore((s) => s.deleteSession)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.daemon.lite.getFlavorInfo().then((res) => {
      if (res.ok && res.data) setVersion(res.data.version)
    })
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => (s.title || 'Untitled chat').toLowerCase().includes(q))
  }, [sessions, query])

  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav}>
        <button type="button" className={`${styles.navRow}${view === 'workspace' ? ` ${styles.navActive}` : ''}`} onClick={onNewAgent}>
          <PencilSimpleLine size={15} className={styles.navIcon} aria-hidden="true" />
          New chat
        </button>
        <button
          type="button"
          className={styles.navRow}
          aria-expanded={searching}
          onClick={() => { setSearching((v) => !v); if (searching) setQuery('') }}
        >
          <MagnifyingGlass size={15} className={styles.navIcon} aria-hidden="true" />
          Search
        </button>
        {searching ? (
          <input
            className={styles.search}
            value={query}
            autoFocus
            placeholder="Search chats"
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearching(false); setQuery('') } }}
          />
        ) : null}
      </nav>

      <div className={styles.sectionLabel}>Chats</div>
      <div className={styles.sessions}>
        {visible.length === 0 ? (
          <div className={styles.empty}>{query ? 'No matching chats' : 'No chats yet'}</div>
        ) : (
          visible.map((s) => (
            <div key={s.id} className={`${styles.sessionRow}${s.id === sessionId ? ` ${styles.sessionActive}` : ''}`}>
              <button
                type="button"
                className={styles.sessionPick}
                onClick={() => { void switchSession(s.id); onPickSession() }}
              >
                <span className={styles.sessionTitle}>{s.title || 'Untitled chat'}</span>
                <span className={styles.sessionTime}>{relativeTime(s.updated_at)}</span>
              </button>
              <button
                type="button"
                className={styles.sessionDelete}
                title="Delete chat"
                aria-label={`Delete ${s.title || 'Untitled chat'}`}
                onClick={() => void deleteSession(s.id)}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.tools}>
        <button
          type="button"
          className={styles.toolsHeader}
          aria-expanded={showTools}
          onClick={onToggleTools}
        >
          <CaretRight size={11} className={`${styles.toolsCaret}${showTools ? ` ${styles.toolsCaretOpen}` : ''}`} aria-hidden="true" />
          Tools
        </button>
        {showTools ? (
          <div className={styles.toolsList}>
            {TOOL_VIEWS.map(({ id, label, icon: Glyph }) => (
              <button
                key={id}
                type="button"
                className={`${styles.navRow}${view === id ? ` ${styles.navActive}` : ''}`}
                aria-pressed={view === id}
                onClick={() => onSelectView(id)}
              >
                <Glyph size={15} className={styles.navIcon} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.footer}>
        <div className={styles.accountRow}>
          <span className={styles.accountName}>
            DAEMON
            {version ? <span className={styles.accountMeta}>v{version}</span> : null}
          </span>
          <button
            type="button"
            className={styles.gear}
            title="Settings"
            aria-label="Settings"
            aria-pressed={view === 'settings'}
            onClick={onOpenSettings}
          >
            <GearSix size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  )
}

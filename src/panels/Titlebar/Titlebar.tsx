import { useState, useRef, useEffect } from 'react'
import { useUIStore, type CenterMode } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { formatCompactUsd } from '../../utils/format'
import daemonIcon from '../../assets/daemon-icon-48.png'
import './Titlebar.css'

interface TitlebarProps {
  projects: Project[]
  onAddProject: () => void
  onRemoveProject: (projectId: string) => void
}

export function Titlebar({ projects, onAddProject, onRemoveProject }: TitlebarProps) {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const centerMode = useUIStore((s) => s.centerMode)
  const setCenterMode = useUIStore((s) => s.setCenterMode)

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <img src={daemonIcon} alt="" className="titlebar-icon" draggable={false} />
        <span className="titlebar-title">DAEMON</span>
      </div>
      <div className="project-tabs">
        {projects.map((p) => (
          <button
            key={p.id}
            className={`project-tab ${activeProjectId === p.id ? 'active' : ''}`}
            onClick={() => setActiveProject(p.id, p.path)}
          >
            <span className={`project-tab-dot ${activeProjectId === p.id ? 'live' : ''}`} title={activeProjectId === p.id ? 'Project active' : 'Project inactive'} />
            <span className="project-tab-name">{p.name}</span>
            <span
              className="project-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onRemoveProject(p.id)
              }}
            >
              &times;
            </span>
          </button>
        ))}
        <button className="project-tab-add" onClick={onAddProject}>+</button>
      </div>
      <div className="titlebar-controls">
        <TitlebarPortfolioSummary />
        <ModeDropdown centerMode={centerMode} setCenterMode={setCenterMode} />
        {import.meta.env.DEV && (
          <button className="titlebar-btn" onClick={() => window.daemon.window.reload()} title="Reload App (Ctrl+Shift+R)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
              <polyline points="21 3 21 9 15 9"/>
            </svg>
          </button>
        )}
        <button className="titlebar-btn" onClick={() => window.daemon.window.minimize()} aria-label="Minimize">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button className="titlebar-btn" onClick={() => window.daemon.window.maximize()} aria-label="Maximize">
          <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
        <button className="titlebar-btn titlebar-btn-close" onClick={() => window.daemon.window.close()} aria-label="Close">
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
      </div>
    </div>
  )
}

const MODE_OPTIONS: Array<{ value: CenterMode; label: string; shortcut: string | null; icon: JSX.Element }> = [
  {
    value: 'canvas',
    label: 'Canvas',
    shortcut: null,
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/>
      </svg>
    ),
  },
  {
    value: 'grind',
    label: 'Grind',
    shortcut: 'Ctrl+Shift+G',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    value: 'browser',
    label: 'Browser',
    shortcut: 'Ctrl+Shift+B',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    ),
  },
]

function ModeDropdown({ centerMode, setCenterMode }: { centerMode: CenterMode; setCenterMode: (m: CenterMode) => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const current = MODE_OPTIONS.find((o) => o.value === centerMode)!

  return (
    <div className="titlebar-mode-wrap" ref={wrapRef}>
      <button
        className={`titlebar-mode-toggle ${centerMode}`}
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Mode: ${current.label}`}
      >
        {current.icon}
        <span>{current.label}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="titlebar-mode-menu" role="listbox" aria-label="Center mode">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`titlebar-mode-option ${opt.value === centerMode ? 'active' : ''}`}
              role="option"
              aria-selected={opt.value === centerMode}
              onClick={() => { setCenterMode(opt.value); setIsOpen(false) }}
            >
              {opt.icon}
              <span>{opt.label}</span>
              {opt.shortcut && <span className="titlebar-mode-shortcut">{opt.shortcut}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TitlebarPortfolioSummary() {
  const visible = useWalletStore((s) => s.showTitlebarWallet)
  const dashboard = useWalletStore((s) => s.dashboard)

  if (!visible || !dashboard || dashboard.portfolio.walletCount === 0) return null

  return (
    <button className="titlebar-portfolio" onClick={() => useUIStore.getState().setActivePanel('wallet')}>
      <span className="titlebar-portfolio-total">${formatCompactUsd(dashboard.portfolio.totalUsd)}</span>
    </button>
  )
}

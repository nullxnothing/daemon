import { useUIStore, type CenterMode } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { formatCompactUsd } from '../../utils/format'
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
        <span className="titlebar-title">DAEMON</span>
      </div>
      <div className="project-tabs">
        {projects.map((p) => (
          <button
            key={p.id}
            className={`project-tab ${activeProjectId === p.id ? 'active' : ''}`}
            onClick={() => setActiveProject(p.id, p.path)}
          >
            <span className={`project-tab-dot ${activeProjectId === p.id ? 'live' : ''}`} />
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
        <button
          className={`titlebar-mode-toggle ${centerMode}`}
          onClick={() => {
            const next: Record<CenterMode, CenterMode> = { canvas: 'grind', grind: 'browser', browser: 'canvas' }
            setCenterMode(next[centerMode])
          }}
          title={`Switch to ${centerMode === 'canvas' ? 'Grind' : centerMode === 'grind' ? 'Browser' : 'Canvas'} Mode`}
        >
          {centerMode === 'grind' ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              <span>Grind</span>
            </>
          ) : centerMode === 'browser' ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              <span>Browser</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="18" rx="2"/>
                <line x1="2" y1="9" x2="22" y2="9"/>
              </svg>
              <span>Canvas</span>
            </>
          )}
        </button>
        {import.meta.env.DEV && (
          <button className="titlebar-btn" onClick={() => window.daemon.window.reload()} title="Reload App (Ctrl+Shift+R)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
              <polyline points="21 3 21 9 15 9"/>
            </svg>
          </button>
        )}
        <button className="titlebar-btn" onClick={() => window.daemon.window.minimize()}>
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button className="titlebar-btn" onClick={() => window.daemon.window.maximize()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
        <button className="titlebar-btn titlebar-btn-close" onClick={() => window.daemon.window.close()}>
          <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1"/></svg>
        </button>
      </div>
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

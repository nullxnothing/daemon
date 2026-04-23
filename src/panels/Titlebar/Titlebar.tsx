import { useEffect, useMemo, useRef, useState, type JSX, type RefObject } from 'react'
import { useUIStore, type CenterMode } from '../../store/ui'
import { useWalletStore } from '../../store/wallet'
import { useShellLayout } from '../../hooks/useShellLayout'
import { formatCompactUsd } from '../../utils/format'
import { WalletQuickView } from '../../components/QuickView/WalletQuickView'
import daemonIcon from '../../assets/daemon-mark.svg'
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
  const browserTabOpen = useUIStore((s) => s.browserTabOpen)
  const toggleBrowserTab = useUIStore((s) => s.toggleBrowserTab)
  const { tier, isDesktop, isCompact, isTablet, isSmall } = useShellLayout()

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  )

  const showProjectTabs = isDesktop || isCompact
  const showPortfolioInline = isDesktop
  const showBrowserInline = isDesktop || isCompact
  const showBrandText = !isTablet && !isSmall
  const showDevReloadInline = isDesktop

  return (
    <div className={`titlebar titlebar--${tier}`}>
      <TitlebarBrand showText={showBrandText} />

      {showProjectTabs ? (
        <ProjectTabs
          projects={projects}
          activeProjectId={activeProjectId}
          onAddProject={onAddProject}
          onRemoveProject={onRemoveProject}
          onSelectProject={setActiveProject}
        />
      ) : (
        <ProjectSwitcher
          activeProject={activeProject}
          projects={projects}
          onAddProject={onAddProject}
          onRemoveProject={onRemoveProject}
          onSelectProject={setActiveProject}
        />
      )}

      <div className="titlebar-controls">
        {showPortfolioInline && <TitlebarPortfolioSummary />}
        {showBrowserInline && (
          <BrowserToggle browserTabOpen={browserTabOpen} toggleBrowserTab={toggleBrowserTab} />
        )}
        <ModeDropdown
          centerMode={centerMode}
          setCenterMode={setCenterMode}
          compactLabel={isSmall}
        />
        {!isDesktop && (
          <TitlebarOverflowMenu
            browserTabOpen={browserTabOpen}
            showBrowserAction={!showBrowserInline}
            showPortfolioAction={!showPortfolioInline}
            showReloadAction={!showDevReloadInline && import.meta.env.DEV}
            onToggleBrowserTab={toggleBrowserTab}
          />
        )}
        {showDevReloadInline && import.meta.env.DEV && (
          <button className="titlebar-btn" onClick={() => window.daemon.window.reload()} title="Reload App (Ctrl+Shift+R)">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
              <polyline points="21 3 21 9 15 9"/>
            </svg>
          </button>
        )}
        <WindowControls />
      </div>
    </div>
  )
}

function TitlebarBrand({ showText }: { showText: boolean }) {
  return (
    <div className={`titlebar-left${showText ? '' : ' titlebar-left--icon-only'}`}>
      <img src={daemonIcon} alt="" className="titlebar-icon" draggable={false} />
      {showText && (
        <>
          <span className="titlebar-title">DAEMON</span>
          <span className="titlebar-beta">BETA</span>
        </>
      )}
    </div>
  )
}

function ProjectTabs({
  projects,
  activeProjectId,
  onAddProject,
  onRemoveProject,
  onSelectProject,
}: {
  projects: Project[]
  activeProjectId: string | null
  onAddProject: () => void
  onRemoveProject: (projectId: string) => void
  onSelectProject: (id: string | null, path: string | null) => void
}) {
  return (
    <div className="project-tabs">
      {projects.map((project) => (
        <button
          key={project.id}
          className={`project-tab ${activeProjectId === project.id ? 'active' : ''}`}
          onClick={() => onSelectProject(project.id, project.path)}
        >
          <span
            className={`project-tab-dot ${activeProjectId === project.id ? 'live' : ''}`}
            title={activeProjectId === project.id ? 'Project active' : 'Project inactive'}
          />
          <span className="project-tab-name">{project.name}</span>
          <span
            className="project-tab-close"
            onClick={(e) => {
              e.stopPropagation()
              onRemoveProject(project.id)
            }}
          >
            &times;
          </span>
        </button>
      ))}
      <button className="project-tab-add" onClick={onAddProject} aria-label="Add project">+</button>
    </div>
  )
}

function ProjectSwitcher({
  activeProject,
  projects,
  onAddProject,
  onRemoveProject,
  onSelectProject,
}: {
  activeProject: Project | null
  projects: Project[]
  onAddProject: () => void
  onRemoveProject: (projectId: string) => void
  onSelectProject: (id: string | null, path: string | null) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useDismissOnOutsideClick(isOpen, wrapRef, () => setIsOpen(false))

  return (
    <div className="titlebar-switcher" ref={wrapRef}>
      <button
        className="titlebar-switcher-toggle"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Switch project"
      >
        <span className={`project-tab-dot ${activeProject ? 'live' : ''}`} />
        <span className="titlebar-switcher-label">{activeProject?.name ?? 'No Project'}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="titlebar-switcher-menu" role="menu" aria-label="Projects">
          {projects.map((project) => (
            <div key={project.id} className="titlebar-switcher-row">
              <button
                className={`titlebar-switcher-item${activeProject?.id === project.id ? ' active' : ''}`}
                role="menuitem"
                onClick={() => {
                  onSelectProject(project.id, project.path)
                  setIsOpen(false)
                }}
              >
                <span className={`project-tab-dot ${activeProject?.id === project.id ? 'live' : ''}`} />
                <span className="titlebar-switcher-item-label">{project.name}</span>
              </button>
              <button
                className="titlebar-switcher-remove"
                onClick={() => onRemoveProject(project.id)}
                aria-label={`Remove ${project.name}`}
              >
                &times;
              </button>
            </div>
          ))}
          <button
            className="titlebar-switcher-add"
            onClick={() => {
              onAddProject()
              setIsOpen(false)
            }}
          >
            Add project
          </button>
        </div>
      )}
    </div>
  )
}

function BrowserToggle({
  browserTabOpen,
  toggleBrowserTab,
}: {
  browserTabOpen: boolean
  toggleBrowserTab: () => void
}) {
  return (
    <button
      className={`titlebar-btn titlebar-btn-browser${browserTabOpen ? ' active' : ''}`}
      onClick={toggleBrowserTab}
      title="Toggle Browser Tab (Ctrl+Shift+B)"
      aria-label="Toggle Browser Tab"
      aria-pressed={browserTabOpen}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    </button>
  )
}

function TitlebarOverflowMenu({
  browserTabOpen,
  showBrowserAction,
  showPortfolioAction,
  showReloadAction,
  onToggleBrowserTab,
}: {
  browserTabOpen: boolean
  showBrowserAction: boolean
  showPortfolioAction: boolean
  showReloadAction: boolean
  onToggleBrowserTab: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const visible = useWalletStore((s) => s.showTitlebarWallet)
  const dashboard = useWalletStore((s) => s.dashboard)

  useDismissOnOutsideClick(isOpen, wrapRef, () => setIsOpen(false))

  const canShowPortfolio = showPortfolioAction && visible && dashboard && dashboard.portfolio.walletCount > 0

  if (!showBrowserAction && !canShowPortfolio && !showReloadAction) return null

  return (
    <div className="titlebar-overflow" ref={wrapRef}>
      <button
        className="titlebar-btn titlebar-btn-overflow"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="More titlebar actions"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {isOpen && (
        <div className="titlebar-overflow-menu" role="menu" aria-label="Titlebar actions">
          {showBrowserAction && (
            <button
              className={`titlebar-overflow-item${browserTabOpen ? ' active' : ''}`}
              role="menuitem"
              onClick={() => {
                onToggleBrowserTab()
                setIsOpen(false)
              }}
            >
              Browser
            </button>
          )}
          {canShowPortfolio && (
            <button
              className="titlebar-overflow-item"
              role="menuitem"
              onClick={() => {
                useUIStore.getState().toggleWalletQuickView()
                setIsOpen(false)
              }}
            >
              Portfolio ${formatCompactUsd(dashboard.portfolio.totalUsd)}
            </button>
          )}
          {showReloadAction && (
            <button
              className="titlebar-overflow-item"
              role="menuitem"
              onClick={() => {
                window.daemon.window.reload()
                setIsOpen(false)
              }}
            >
              Reload App
            </button>
          )}
        </div>
      )}
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
    label: 'Agents',
    shortcut: 'Ctrl+Shift+G',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
]

function ModeDropdown({
  centerMode,
  setCenterMode,
  compactLabel,
}: {
  centerMode: CenterMode
  setCenterMode: (m: CenterMode) => void
  compactLabel?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useDismissOnOutsideClick(isOpen, wrapRef, () => setIsOpen(false))

  const current = MODE_OPTIONS.find((option) => option.value === centerMode)!

  return (
    <div className="titlebar-mode-wrap" ref={wrapRef}>
      <button
        className={`titlebar-mode-toggle ${centerMode}${compactLabel ? ' titlebar-mode-toggle--icon-only' : ''}`}
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Mode: ${current.label}`}
      >
        {current.icon}
        {!compactLabel && <span>{current.label}</span>}
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div className="titlebar-mode-menu" role="listbox" aria-label="Center mode">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`titlebar-mode-option ${option.value === centerMode ? 'active' : ''}`}
              role="option"
              aria-selected={option.value === centerMode}
              onClick={() => {
                setCenterMode(option.value)
                setIsOpen(false)
              }}
            >
              {option.icon}
              <span>{option.label}</span>
              {option.shortcut && <span className="titlebar-mode-shortcut">{option.shortcut}</span>}
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
  const walletQuickViewOpen = useUIStore((s) => s.walletQuickViewOpen)
  const toggleWalletQuickView = useUIStore((s) => s.toggleWalletQuickView)
  const triggerRef = useRef<HTMLButtonElement>(null)

  if (!visible || !dashboard || dashboard.portfolio.walletCount === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        className="titlebar-portfolio"
        onClick={toggleWalletQuickView}
        aria-haspopup="dialog"
        aria-expanded={walletQuickViewOpen}
      >
        <span className="titlebar-portfolio-total">${formatCompactUsd(dashboard.portfolio.totalUsd)}</span>
      </button>
      {walletQuickViewOpen && <WalletQuickView triggerRef={triggerRef} />}
    </>
  )
}

function WindowControls() {
  return (
    <>
      <button className="titlebar-btn" onClick={() => window.daemon.window.minimize()} aria-label="Minimize">
        <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
      </button>
      <button className="titlebar-btn" onClick={() => window.daemon.window.maximize()} aria-label="Maximize">
        <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1"/></svg>
      </button>
      <button className="titlebar-btn titlebar-btn-close" onClick={() => window.daemon.window.close()} aria-label="Close">
        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1"/><line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1"/></svg>
      </button>
    </>
  )
}

function useDismissOnOutsideClick(
  isOpen: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onDismiss, ref])
}

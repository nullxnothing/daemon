import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import './IconSidebar.css'

interface IconSidebarProps {
  showExplorer: boolean
  onToggleExplorer: () => void
  onOpenAgentLauncher: () => void
}

export function IconSidebar({ showExplorer, onToggleExplorer, onOpenAgentLauncher }: IconSidebarProps) {
  const activePanel = useUIStore((s) => s.activePanel)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const activePluginId = usePluginStore((s) => s.activePluginId)
  const setActivePlugin = usePluginStore((s) => s.setActivePlugin)
  const handleCenterPanelClick = (panel: Parameters<typeof setActivePanel>[0]) => {
    setActivePlugin(null)
    setActivePanel(panel)
  }

  const handleExplorerClick = () => {
    onToggleExplorer()
    const panel = useUIStore.getState().activePanel
    if (['env', 'git', 'settings', 'tools', 'recovery', 'plugins'].includes(panel)) {
      useUIStore.getState().setActivePanel('claude')
      usePluginStore.getState().setActivePlugin(null)
    }
  }

  const handlePluginsClick = () => {
    setActivePlugin(null)
    setActivePanel('plugins')
  }


  return (
    <aside className="icon-sidebar">
      {/* ─── Upper group: navigation & center-panel actions ─── */}
      <button
        className={`sidebar-icon ${showExplorer ? 'active' : ''}`}
        onClick={handleExplorerClick}
        title="Explorer"
        aria-label="Explorer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H13L11 5H5C3.9 5 3 5.9 3 7Z"/>
        </svg>
      </button>
      <button
        className="sidebar-icon"
        onClick={onOpenAgentLauncher}
        title="Launch Agent (Ctrl+Shift+A)"
        aria-label="Launch Agent"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </button>
      <button
        className={`sidebar-icon ${activePanel === 'git' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCenterPanelClick('git')}
        title="Git"
        aria-label="Git"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>
          <line x1="12" y1="9" x2="12" y2="12"/><line x1="12" y1="12" x2="6" y2="15"/><line x1="12" y1="12" x2="18" y2="15"/>
        </svg>
      </button>

      <button
        className={`sidebar-icon ${activePanel === 'tools' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCenterPanelClick('tools')}
        title="Tools"
        aria-label="Tools"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
      </button>

      <button
        className={`sidebar-icon ${activePanel === 'plugins' && !activePluginId ? 'active' : ''}`}
        onClick={handlePluginsClick}
        title="Plugins"
        aria-label="Plugins"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </button>

      <button
        className={`sidebar-icon ${activePanel === 'env' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCenterPanelClick('env')}
        title="Env Manager"
        aria-label="Env Manager"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      </button>

      <div className="sidebar-spacer" />

      {/* ─── Bottom: settings only ─── */}
      <button
        className={`sidebar-icon ${activePanel === 'settings' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCenterPanelClick('settings')}
        title="Settings"
        aria-label="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </aside>
  )
}

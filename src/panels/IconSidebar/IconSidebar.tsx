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

  const handleCorePanelClick = (panel: Parameters<typeof setActivePanel>[0]) => {
    setActivePlugin(null)
    setActivePanel(panel)
  }

  return (
    <aside className="icon-sidebar">
      <button
        className={`sidebar-icon ${showExplorer ? 'active' : ''}`}
        onClick={onToggleExplorer}
        title="Explorer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H13L11 5H5C3.9 5 3 5.9 3 7Z"/>
        </svg>
      </button>
      <button
        className="sidebar-icon"
        onClick={onOpenAgentLauncher}
        title="Launch Agent (Ctrl+Shift+A)"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </button>
      <button
        className={`sidebar-icon ${activePanel === 'git' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCorePanelClick('git')}
        title="Git"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>
          <line x1="12" y1="9" x2="12" y2="12"/><line x1="12" y1="12" x2="6" y2="15"/><line x1="12" y1="12" x2="18" y2="15"/>
        </svg>
      </button>
      <div className="sidebar-spacer" />

      <button
        className={`sidebar-icon ${activePanel === 'plugins' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCorePanelClick('plugins')}
        title="Plugins"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </button>

      <button
        className={`sidebar-icon ${activePanel === 'claude' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCorePanelClick('claude')}
        title="Claude"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </button>
      <button
        className={`sidebar-icon ${activePanel === 'env' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCorePanelClick('env')}
        title="Env Manager"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
        </svg>
      </button>
      <button
        className={`sidebar-icon ${activePanel === 'wallet' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCorePanelClick('wallet')}
        title="Wallet"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V9h1.5A1.5 1.5 0 0 1 22 10.5v5a1.5 1.5 0 0 1-1.5 1.5H19v1.5A2.5 2.5 0 0 1 16.5 21h-11A2.5 2.5 0 0 1 3 18.5v-11Z"/>
          <circle cx="18" cy="13" r="1"/>
        </svg>
      </button>
      <button
        className={`sidebar-icon ${activePanel === 'recovery' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCorePanelClick('recovery')}
        title="Wallet Recovery"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 4v6h6" /><path d="M23 20v-6h-6" />
          <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
        </svg>
      </button>
      <button
        className={`sidebar-icon ${activePanel === 'ports' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCorePanelClick('ports')}
        title="Ports"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/>
        </svg>
      </button>
      <button
        className={`sidebar-icon ${activePanel === 'process' && !activePluginId ? 'active' : ''}`}
        onClick={() => handleCorePanelClick('process')}
        title="Processes"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
          <line x1="4" y1="10" x2="20" y2="10"/>
          <line x1="10" y1="4" x2="10" y2="20"/>
        </svg>
      </button>
    </aside>
  )
}

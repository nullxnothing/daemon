import { useUIStore } from '../../store/ui'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { TOOL_ICONS, TOOL_NAMES } from '../../components/CommandDrawer/CommandDrawer'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import './IconSidebar.css'

interface IconSidebarProps {
  showExplorer: boolean
  showRightPanel: boolean
  onToggleExplorer: () => void
  onToggleRightPanel: () => void
  onOpenAgentLauncher: () => void
  isAgentLauncherOpen: boolean
}

export function IconSidebar({ showExplorer, showRightPanel, onToggleExplorer, onToggleRightPanel, onOpenAgentLauncher }: IconSidebarProps) {
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const drawerTool = useUIStore((s) => s.drawerTool)
  const browserTabActive = useUIStore((s) => s.browserTabActive)
  const pinnedTools = useUIStore((s) => s.pinnedTools)
  const isToolVisible = useWorkspaceProfileStore((s) => s.isToolVisible)

  const handleExplorerClick = () => {
    if (drawerOpen) useUIStore.getState().closeDrawer()
    onToggleExplorer()
  }

  const handlePinnedToolClick = (toolId: string) => {
    // Browser is a pinned editor tab, not a drawer panel
    if (toolId === 'browser') {
      useUIStore.getState().toggleBrowserTab()
      return
    }
    const state = useUIStore.getState()
    if (state.drawerOpen && state.drawerTool === toolId) {
      // Already showing this tool — close drawer
      state.closeDrawer()
    } else {
      // Open drawer with this tool
      state.setDrawerTool(toolId)
    }
  }

  const handleLauncherClick = () => {
    const state = useUIStore.getState()
    if (state.drawerOpen && !state.drawerTool) {
      state.closeDrawer()
    } else {
      useUIStore.setState({ drawerOpen: true, drawerTool: null })
    }
  }

  return (
    <aside className="icon-sidebar" data-tour="sidebar">
      {/* Files */}
      <button
        className={`sidebar-icon sidebar-toggle ${showExplorer ? 'active' : ''}`}
        onClick={handleExplorerClick}
        title="Explorer (Ctrl+E)"
        aria-label="Explorer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7V17C3 18.1 3.9 19 5 19H19C20.1 19 21 18.1 21 17V9C21 7.9 20.1 7 19 7H13L11 5H5C3.9 5 3 5.9 3 7Z"/>
        </svg>
      </button>

      {/* Claude — toggle right panel */}
      <button
        className={`sidebar-icon sidebar-toggle ${showRightPanel ? 'active' : ''}`}
        onClick={onToggleRightPanel}
        title="Claude (Ctrl+B)"
        aria-label="Claude"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
      </button>

      {/* Agent Launcher */}
      <button
        className="sidebar-icon sidebar-launcher"
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

      {/* Pinned tools — filtered by workspace profile visibility */}
      {pinnedTools.filter((id) => isToolVisible(id)).length > 0 && <div className="sidebar-divider" />}
      {pinnedTools.filter((id) => isToolVisible(id)).map((toolId) => {
        // Check built-in icons first, then plugin registry
        const Icon = TOOL_ICONS[toolId] ?? PLUGIN_REGISTRY[toolId]?.icon
        const name = TOOL_NAMES[toolId] ?? PLUGIN_REGISTRY[toolId]?.name ?? toolId
        if (!Icon) return null
        const isActive = toolId === 'browser' ? browserTabActive : (drawerOpen && drawerTool === toolId)
        return (
          <button
            key={toolId}
            className={`sidebar-icon ${isActive ? 'active' : ''}`}
            onClick={() => handlePinnedToolClick(toolId)}
            title={name}
            aria-label={name}
          >
            <Icon size={18} />
          </button>
        )
      })}

      <div className="sidebar-spacer" />

      {/* Command Drawer Launcher */}
      <button
        className={`sidebar-icon ${drawerOpen && !drawerTool ? 'active' : ''}`}
        onClick={handleLauncherClick}
        title="Tools (Ctrl+K)"
        aria-label="Tools"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </button>
    </aside>
  )
}

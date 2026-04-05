import { useState, useCallback, type DragEvent } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { TOOL_ICONS, TOOL_NAMES, TOOL_COLORS, TOOL_DND_MIME } from '../../components/CommandDrawer/CommandDrawer'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import './IconSidebar.css'

interface IconSidebarProps {
  showExplorer: boolean
  onToggleExplorer: () => void
  onOpenAgentLauncher: () => void
  isAgentLauncherOpen: boolean
}

export function IconSidebar({ showExplorer, onToggleExplorer, onOpenAgentLauncher }: IconSidebarProps) {
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const drawerTool = useUIStore((s) => s.drawerTool)
  const browserTabActive = useUIStore((s) => s.browserTabActive)
  const pinnedTools = useUIStore((s) => s.pinnedTools)
  const rightPanelTab = useUIStore((s) => s.rightPanelTab)
  const isToolVisible = useWorkspaceProfileStore((s) => s.isToolVisible)

  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [dropZoneActive, setDropZoneActive] = useState(false)

  const handleExplorerClick = () => {
    if (drawerOpen) useUIStore.getState().closeDrawer()
    onToggleExplorer()
  }

  const handlePinnedToolClick = (toolId: string) => {
    if (toolId === 'browser') {
      if (useUIStore.getState().drawerOpen) useUIStore.getState().closeDrawer()
      useUIStore.getState().toggleBrowserTab()
      return
    }
    const state = useUIStore.getState()
    if (state.drawerOpen && state.drawerTool === toolId) {
      state.closeDrawer()
    } else {
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

  // --- Drag-and-drop for pinned tools ---
  const handlePinDragStart = useCallback((e: DragEvent<HTMLButtonElement>, toolId: string) => {
    e.dataTransfer.setData(TOOL_DND_MIME, toolId)
    e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('sidebar-icon--dragging')
  }, [])

  const handlePinDragEnd = useCallback((e: DragEvent<HTMLButtonElement>) => {
    ;(e.currentTarget as HTMLElement).classList.remove('sidebar-icon--dragging')
    setDragOverIdx(null)
    setDropZoneActive(false)
  }, [])

  const handlePinDragOver = useCallback((e: DragEvent<HTMLButtonElement>, idx: number) => {
    if (!e.dataTransfer.types.includes(TOOL_DND_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }, [])

  const handlePinDrop = useCallback((e: DragEvent<HTMLButtonElement>, targetIdx: number) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverIdx(null)
    setDropZoneActive(false)
    const toolId = e.dataTransfer.getData(TOOL_DND_MIME)
    if (!toolId) return

    const store = useUIStore.getState()
    const currentPinned = [...store.pinnedTools]
    const existingIdx = currentPinned.indexOf(toolId)

    if (existingIdx !== -1) {
      // Reorder within pinned
      currentPinned.splice(existingIdx, 1)
      currentPinned.splice(targetIdx, 0, toolId)
    } else {
      // Drop from drawer — pin at position
      currentPinned.splice(targetIdx, 0, toolId)
    }
    store.setPinnedTools(currentPinned)
  }, [])

  // Drop zone at end of pinned tools (for adding new pins)
  const handleZoneDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(TOOL_DND_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropZoneActive(true)
  }, [])

  const handleZoneDragLeave = useCallback(() => {
    setDropZoneActive(false)
  }, [])

  const handleZoneDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDropZoneActive(false)
    setDragOverIdx(null)
    const toolId = e.dataTransfer.getData(TOOL_DND_MIME)
    if (!toolId) return

    const store = useUIStore.getState()
    if (store.pinnedTools.includes(toolId)) return // already pinned, ignore
    store.pinTool(toolId)
  }, [])

  // Right-click to unpin
  const handleContextMenu = useCallback((e: React.MouseEvent, toolId: string) => {
    e.preventDefault()
    useUIStore.getState().unpinTool(toolId)
  }, [])

  const visiblePinned = pinnedTools.filter((id) => isToolVisible(id))

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

      {/* Pinned tools — draggable + drop targets */}
      {visiblePinned.length > 0 && <div className="sidebar-divider" />}
      {visiblePinned.map((toolId, idx) => {
        const Icon = TOOL_ICONS[toolId] ?? PLUGIN_REGISTRY[toolId]?.icon
        const name = TOOL_NAMES[toolId] ?? PLUGIN_REGISTRY[toolId]?.name ?? toolId
        if (!Icon) return null
        const isActive = toolId === 'browser' ? browserTabActive : (drawerOpen && drawerTool === toolId)
        const color = TOOL_COLORS[toolId]
        return (
          <button
            key={toolId}
            className={`sidebar-icon ${isActive ? 'active' : ''}${dragOverIdx === idx ? ' sidebar-icon--drop-target' : ''}`}
            style={color ? { color } as React.CSSProperties : undefined}
            onClick={() => handlePinnedToolClick(toolId)}
            onContextMenu={(e) => handleContextMenu(e, toolId)}
            draggable
            onDragStart={(e) => handlePinDragStart(e, toolId)}
            onDragEnd={handlePinDragEnd}
            onDragOver={(e) => handlePinDragOver(e, idx)}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => handlePinDrop(e, idx)}
            title={`${name} (right-click to unpin)`}
            aria-label={name}
          >
            <Icon size={18} />
          </button>
        )
      })}

      {/* Drop zone for pinning new tools from drawer */}
      <div
        className={`sidebar-drop-zone${dropZoneActive ? ' sidebar-drop-zone--active' : ''}`}
        onDragOver={handleZoneDragOver}
        onDragLeave={handleZoneDragLeave}
        onDrop={handleZoneDrop}
      />

      <div className="sidebar-spacer" />

      {/* Colosseum */}
      <div className="sidebar-divider" />
      <div
        className={`colosseum-icon-wrap${rightPanelTab === 'hackathon' ? ' active' : ''}`}
        onClick={() => useUIStore.getState().setRightPanelTab('hackathon')}
        title="Hackathon (Colosseum)"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M2 12V6a6 6 0 0 1 12 0v6" strokeLinecap="round"/>
          <line x1="2" y1="12" x2="14" y2="12" strokeLinecap="round"/>
          <line x1="5" y1="12" x2="5" y2="7"/>
          <line x1="8" y1="12" x2="8" y2="5"/>
          <line x1="11" y1="12" x2="11" y2="7"/>
        </svg>
      </div>

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

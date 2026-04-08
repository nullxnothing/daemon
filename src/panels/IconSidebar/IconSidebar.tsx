import { useState, useCallback, useEffect, useMemo, useRef, type DragEvent } from 'react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { BUILTIN_TOOLS, TOOL_ICONS, TOOL_NAMES, TOOL_COLORS, TOOL_DND_MIME, preloadToolPanel } from '../../components/CommandDrawer/CommandDrawer'
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
  const isToolVisible = useWorkspaceProfileStore((s) => s.isToolVisible)
  const plugins = usePluginStore((s) => s.plugins)

  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [dropZoneActive, setDropZoneActive] = useState(false)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const toolMenuRef = useRef<HTMLDivElement | null>(null)

  const availableTools = useMemo(() => {
    const pluginTools = plugins
      .filter((plugin) => plugin.enabled)
      .filter((plugin) => !BUILTIN_TOOLS.some((tool) => tool.id === plugin.id))
      .map((plugin) => ({
        id: plugin.id,
        name: PLUGIN_REGISTRY[plugin.id]?.name ?? plugin.id,
      }))

    return [...BUILTIN_TOOLS.map((tool) => ({ id: tool.id, name: tool.name })), ...pluginTools]
      .filter((tool) => tool.id !== 'browser')
      .filter((tool) => !pinnedTools.includes(tool.id))
      .filter((tool) => isToolVisible(tool.id))
  }, [isToolVisible, pinnedTools, plugins])

  useEffect(() => {
    if (!toolMenuOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!toolMenuRef.current?.contains(event.target as Node)) {
        setToolMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setToolMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [toolMenuOpen])

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

  const handleAddToolClick = () => setToolMenuOpen((open) => !open)

  const handleAddToolSelect = (toolId: string) => {
    useUIStore.getState().pinTool(toolId)
    setToolMenuOpen(false)
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
  const handleZoneDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    if (!e.dataTransfer.types.includes(TOOL_DND_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropZoneActive(true)
  }, [])

  const handleZoneDragLeave = useCallback(() => {
    setDropZoneActive(false)
  }, [])

  const handleZoneDrop = useCallback((e: DragEvent<HTMLElement>) => {
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
            onMouseEnter={() => preloadToolPanel(toolId)}
            onFocus={() => preloadToolPanel(toolId)}
            title={`${name} (right-click to unpin)`}
            aria-label={name}
          >
            <Icon size={18} />
          </button>
        )
      })}

      {/* Drop zone for pinning new tools from drawer */}
      <div className="sidebar-submenu-wrap" ref={toolMenuRef}>
        <button
          type="button"
          className={`sidebar-drop-zone${dropZoneActive ? ' sidebar-drop-zone--active' : ''}${toolMenuOpen ? ' active' : ''}`}
          onClick={handleAddToolClick}
          onDragOver={handleZoneDragOver}
          onDragLeave={handleZoneDragLeave}
          onDrop={handleZoneDrop}
          title="Add tool"
          aria-label="Add tool"
        />
        {toolMenuOpen && (
          <div className="sidebar-submenu sidebar-submenu--tools">
            <div className="sidebar-submenu-group">Add To Sidebar</div>
            {availableTools.length > 0 ? (
              availableTools.map((tool) => {
                const Icon = TOOL_ICONS[tool.id] ?? PLUGIN_REGISTRY[tool.id]?.icon
                return (
                  <button
                    key={tool.id}
                    className="sidebar-submenu-item sidebar-submenu-item--tool"
                    onClick={() => handleAddToolSelect(tool.id)}
                    onMouseEnter={() => preloadToolPanel(tool.id)}
                    onFocus={() => preloadToolPanel(tool.id)}
                    title={`Pin ${tool.name}`}
                  >
                    {Icon ? <Icon size={14} /> : null}
                    <span>{tool.name}</span>
                  </button>
                )
              })
            ) : (
              <div className="sidebar-submenu-empty">All available tools are already pinned.</div>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-spacer" />

      {/* Colosseum / Hackathon — opens in drawer */}
      <div className="sidebar-divider" />
      <button
        className={`colosseum-icon-wrap${drawerTool === 'hackathon' ? ' active' : ''}`}
        onClick={() => useUIStore.getState().setDrawerTool('hackathon')}
        title="Hackathon (Colosseum)"
        aria-label="Hackathon"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M2 12V6a6 6 0 0 1 12 0v6" strokeLinecap="round"/>
          <line x1="2" y1="12" x2="14" y2="12" strokeLinecap="round"/>
          <line x1="5" y1="12" x2="5" y2="7"/>
          <line x1="8" y1="12" x2="8" y2="5"/>
          <line x1="11" y1="12" x2="11" y2="7"/>
        </svg>
      </button>

      {/* Command Drawer Launcher */}
      <button
        className={`sidebar-icon ${drawerOpen && !drawerTool ? 'active' : ''}`}
        onClick={() => {
          const state = useUIStore.getState()
          if (state.drawerOpen && !state.drawerTool) {
            state.closeDrawer()
          } else {
            useUIStore.setState({ drawerOpen: true, drawerTool: null })
          }
        }}
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

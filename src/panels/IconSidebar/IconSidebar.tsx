import { useState, useCallback, useEffect, useMemo, useRef, useId, type DragEvent } from 'react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { BUILTIN_TOOLS, TOOL_ICONS, TOOL_NAMES, TOOL_DND_MIME, preloadToolPanel } from '../../components/CommandDrawer/CommandDrawer'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import './IconSidebar.css'

interface IconSidebarProps {
  showExplorer: boolean
  onToggleExplorer: () => void
  onOpenAgentLauncher: () => void
  isAgentLauncherOpen: boolean
}

function ExplorerGlyph({ size = 18 }: { size?: number }) {
  const gradientId = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gradientId} x1="4" y1="5" x2="20" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7bc4ff" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <path d="M4 8a2.5 2.5 0 0 1 2.5-2.5h4.25l1.65 1.8h5.1A2.5 2.5 0 0 1 20 9.8v6.7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5V8Z" stroke={`url(#${gradientId})`} />
      <path d="M4.75 9.5h14.5" stroke={`url(#${gradientId})`} opacity="0.72" />
    </svg>
  )
}

function LauncherGlyph({ size = 18 }: { size?: number }) {
  const gradientId = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gradientId} x1="7" y1="4" x2="17" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <path d="M14.9 4.75c-3.1.6-5.85 2.96-6.85 6L7.2 13.9l2.9-.85a8.9 8.9 0 0 0 3.15 3.15l2.85-.85-.85-2.85c3.04-1 5.4-3.75 6-6.85-.97-.34-2.03-.51-3.1-.51-.76 0-1.52.09-2.25.26Z" stroke={`url(#${gradientId})`} />
      <path d="M10.25 13.75 6.5 17.5M5.25 18.75l2.2-.48.48-2.2" stroke={`url(#${gradientId})`} />
      <path d="M13.9 10.1a1.3 1.3 0 1 0 1.84-1.84 1.3 1.3 0 0 0-1.84 1.84Z" stroke={`url(#${gradientId})`} />
    </svg>
  )
}

function HackathonGlyph({ size = 16 }: { size?: number }) {
  const gradientId = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gradientId} x1="2" y1="3" x2="14" y2="13" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffd84d" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <path d="M3 12.5h10M4.25 12.5V7.75a3.75 3.75 0 0 1 7.5 0v4.75" stroke={`url(#${gradientId})`} />
      <path d="M6.25 7.75v4.75M8 6.25v6.25M9.75 7.75v4.75" stroke={`url(#${gradientId})`} />
    </svg>
  )
}

function ToolsGlyph({ size = 18 }: { size?: number }) {
  const gradientId = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gradientId} x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#14f195" />
          <stop offset="100%" stopColor="#2dd4bf" />
        </linearGradient>
      </defs>
      <path d="M6 6.25h5.25v4.5H6zM12.75 13.25H18v4.5h-5.25zM12.75 6.25H18v4.5h-5.25zM6 13.25h5.25v4.5H6z" stroke={`url(#${gradientId})`} />
    </svg>
  )
}

export function IconSidebar({ showExplorer, onToggleExplorer, onOpenAgentLauncher }: IconSidebarProps) {
  const drawerOpen = useWorkflowShellStore((s) => s.drawerOpen)
  const drawerTool = useWorkflowShellStore((s) => s.drawerTool)
  const browserTabActive = useUIStore((s) => s.browserTabActive)
  const activeWorkspaceToolId = useUIStore((s) => s.activeWorkspaceToolId)
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
    if (drawerOpen) useWorkflowShellStore.getState().closeDrawer()
    onToggleExplorer()
  }

  const handlePinnedToolClick = (toolId: string) => {
    preloadToolPanel(toolId)
    useUIStore.getState().toggleWorkspaceTool(toolId)
  }

  const handleAddToolClick = () => setToolMenuOpen((open) => !open)

  const handleAddToolSelect = (toolId: string) => {
    preloadToolPanel(toolId)
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
        className={`sidebar-icon sidebar-toggle sidebar-icon--explorer ${showExplorer ? 'active' : ''}`}
        onClick={handleExplorerClick}
        title="Explorer (Ctrl+E)"
        aria-label="Explorer"
      >
        <ExplorerGlyph />
      </button>

      {/* Agent Launcher */}
      <button
        className="sidebar-icon sidebar-launcher sidebar-icon--agents"
        onClick={onOpenAgentLauncher}
        title="Launch Agent (Ctrl+Shift+A)"
        aria-label="Launch Agent"
      >
        <LauncherGlyph />
      </button>

      {/* Pinned tools — draggable + drop targets */}
      {visiblePinned.length > 0 && <div className="sidebar-divider" />}
      {visiblePinned.map((toolId, idx) => {
        const Icon = TOOL_ICONS[toolId] ?? PLUGIN_REGISTRY[toolId]?.icon
        const name = TOOL_NAMES[toolId] ?? PLUGIN_REGISTRY[toolId]?.name ?? toolId
        if (!Icon) return null
        const isActive = toolId === 'browser' ? browserTabActive : activeWorkspaceToolId === toolId
        return (
          <button
            key={toolId}
            className={`sidebar-icon ${isActive ? 'active' : ''}${dragOverIdx === idx ? ' sidebar-icon--drop-target' : ''}`}
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
        className={`colosseum-icon-wrap${activeWorkspaceToolId === 'hackathon' ? ' active' : ''}`}
        onClick={() => useUIStore.getState().openWorkspaceTool('hackathon')}
        title="Hackathon (Colosseum)"
        aria-label="Hackathon"
      >
        <HackathonGlyph />
      </button>

      {/* Command Drawer Launcher */}
      <button
        className={`sidebar-icon sidebar-icon--tools ${drawerOpen && !drawerTool ? 'active' : ''}`}
        onClick={() => {
          const state = useWorkflowShellStore.getState()
          if (state.drawerOpen && !state.drawerTool) {
            state.closeDrawer()
          } else {
            state.toggleDrawer()
          }
        }}
        title="Tools (Ctrl+K)"
        aria-label="Tools"
      >
        <ToolsGlyph />
      </button>
    </aside>
  )
}

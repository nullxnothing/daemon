import { useState, useCallback, useEffect, useMemo, useRef, useId, type CSSProperties, type DragEvent } from 'react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { BUILTIN_TOOLS, TOOL_COLORS, TOOL_ICONS, TOOL_NAMES, TOOL_DND_MIME, preloadToolPanel } from '../../components/CommandDrawer/CommandDrawer'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { DAEMON_ICON_GRADIENTS, DAEMON_SIDEBAR_ACCENT_FALLBACK } from '../../styles/daemonTheme'
import './IconSidebar.css'

interface IconSidebarProps {
  showExplorer: boolean
  onToggleExplorer: () => void
  onOpenAgentLauncher: () => void
  isAgentLauncherOpen: boolean
}

function ExplorerGlyph({ size = 18 }: { size?: number }) {
  const gradientId = useId()
  const [from, to] = DAEMON_ICON_GRADIENTS.explorer
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gradientId} x1="4" y1="5" x2="20" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path d="M4 8a2.5 2.5 0 0 1 2.5-2.5h4.25l1.65 1.8h5.1A2.5 2.5 0 0 1 20 9.8v6.7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5V8Z" stroke={`url(#${gradientId})`} />
      <path d="M4.75 9.5h14.5" stroke={`url(#${gradientId})`} opacity="0.72" />
    </svg>
  )
}

function LauncherGlyph({ size = 18 }: { size?: number }) {
  const gradientId = useId()
  const [from, to] = DAEMON_ICON_GRADIENTS.launcher
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gradientId} x1="5" y1="4" x2="19" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="6.25" y="7.25" width="11.5" height="8.5" rx="3" stroke={`url(#${gradientId})`} />
      <path d="M12 4.5v2.75M8.5 18.75h7M12 15.75v3" stroke={`url(#${gradientId})`} />
      <circle cx="9.8" cy="11.4" r="0.9" fill={`url(#${gradientId})`} />
      <circle cx="14.2" cy="11.4" r="0.9" fill={`url(#${gradientId})`} />
      <path d="M9.75 14h4.5" stroke={`url(#${gradientId})`} opacity="0.72" />
    </svg>
  )
}

function XGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  )
}

function DiscordGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
    </svg>
  )
}

function HackathonGlyph({ size = 16 }: { size?: number }) {
  const gradientId = useId()
  const [from, to] = DAEMON_ICON_GRADIENTS.hackathon
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gradientId} x1="2" y1="3" x2="14" y2="13" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <path d="M3 12.5h10M4.25 12.5V7.75a3.75 3.75 0 0 1 7.5 0v4.75" stroke={`url(#${gradientId})`} />
      <path d="M6.25 7.75v4.75M8 6.25v6.25M9.75 7.75v4.75" stroke={`url(#${gradientId})`} />
    </svg>
  )
}

function ToolsGlyph({ size = 20 }: { size?: number }) {
  const gradientId = useId()
  const [from, to] = DAEMON_ICON_GRADIENTS.tools
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id={gradientId} x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke={`url(#${gradientId})`} />
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke={`url(#${gradientId})`} />
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke={`url(#${gradientId})`} />
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke={`url(#${gradientId})`} />
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
      .filter((tool) => tool.id !== 'settings')
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
      if (!useWorkspaceProfileStore.getState().isToolVisible(toolId)) return
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
    if (!useWorkspaceProfileStore.getState().isToolVisible(toolId)) return
    if (store.pinnedTools.includes(toolId)) return // already pinned, ignore
    store.pinTool(toolId)
  }, [])

  // Right-click to unpin
  const handleContextMenu = useCallback((e: React.MouseEvent, toolId: string) => {
    e.preventDefault()
    useUIStore.getState().unpinTool(toolId)
  }, [])

  const visiblePinned = pinnedTools.filter((id) => id !== 'settings' && isToolVisible(id))
  const SettingsIcon = TOOL_ICONS.settings
  const toolStyle = (toolId: string): CSSProperties => ({
    '--tool-accent': TOOL_COLORS[toolId] ?? DAEMON_SIDEBAR_ACCENT_FALLBACK,
  } as CSSProperties)

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
            style={toolStyle(toolId)}
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
                    style={toolStyle(tool.id)}
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

      <div className="sidebar-divider" />
      <button
        className={`sidebar-icon sidebar-icon--settings ${activeWorkspaceToolId === 'settings' ? 'active' : ''}`}
        style={toolStyle('settings')}
        onClick={() => handlePinnedToolClick('settings')}
        onMouseEnter={() => preloadToolPanel('settings')}
        onFocus={() => preloadToolPanel('settings')}
        title="Settings"
        aria-label="Settings"
      >
        {SettingsIcon ? <SettingsIcon size={18} /> : null}
      </button>

      {/* Social Links */}
      <button
        type="button"
        className="sidebar-icon sidebar-icon--social"
        onClick={() => void window.daemon.shell.openExternal('https://x.com/DaemonTerminal')}
        title="Follow on X"
        aria-label="Follow on X"
      >
        <XGlyph />
      </button>
      <button
        type="button"
        className="sidebar-icon sidebar-icon--social sidebar-icon--discord"
        onClick={() => void window.daemon.shell.openExternal('https://discord.gg/uyCJtcEBxA')}
        title="Join Discord"
        aria-label="Join Discord"
      >
        <DiscordGlyph />
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

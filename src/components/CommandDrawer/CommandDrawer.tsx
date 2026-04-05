import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense, type ComponentType, type DragEvent } from 'react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { useWorkspaceProfileStore } from '../../store/workspaceProfile'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { PanelErrorBoundary } from '../ErrorBoundary'
import './CommandDrawer.css'

// All drawer-renderable tools (built-in + plugins)
interface DrawerTool {
  id: string
  name: string
  description: string
  icon: ComponentType<{ size?: number }>
  component: React.LazyExoticComponent<ComponentType>
  category: 'dev' | 'crypto' | 'create' | 'system'
}

// Built-in tool icons — exported for sidebar pinning
export function GitIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5">
      <defs>
        <linearGradient id="git-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0f0f0">
            <animate attributeName="stop-color" values="#f0f0f0;#6e40c9;#f0f0f0" dur="5s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#6e40c9">
            <animate attributeName="stop-color" values="#6e40c9;#238636;#6e40c9" dur="5s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#238636">
            <animate attributeName="stop-color" values="#238636;#f0f0f0;#238636" dur="5s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <circle cx="12" cy="6" r="3" stroke="url(#git-flow)"/><circle cx="6" cy="18" r="3" stroke="url(#git-flow)"/><circle cx="18" cy="18" r="3" stroke="url(#git-flow)"/><line x1="12" y1="9" x2="12" y2="12" stroke="url(#git-flow)"/><line x1="12" y1="12" x2="6" y2="15" stroke="url(#git-flow)"/><line x1="12" y1="12" x2="18" y2="15" stroke="url(#git-flow)"/>
    </svg>
  )
}
function EnvIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
}
function DeployIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L12 16M12 2L8 6M12 2L16 6"/><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/></svg>
}
function EmailIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="14" height="12" rx="2" /><path d="M2 5l7 5 7-5" /></svg>
}
function WalletIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V9h1.5A1.5 1.5 0 0 1 22 10.5v5a1.5 1.5 0 0 1-1.5 1.5H19v1.5A2.5 2.5 0 0 1 16.5 21h-11A2.5 2.5 0 0 1 3 18.5v-11Z"/><circle cx="18" cy="13" r="1"/></svg>
}
function SettingsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
}
function PortsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/></svg>
}
function ProcessIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="10" y1="4" x2="10" y2="20"/></svg>
}
function PaintIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><path d="M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/><path d="M7 13.5Q9 9 12 13.5T17 10"/></svg>
}
function BrowserIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="browser-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa">
            <animate attributeName="stop-color" values="#60a5fa;#38bdf8;#818cf8;#60a5fa" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#38bdf8">
            <animate attributeName="stop-color" values="#38bdf8;#818cf8;#60a5fa;#38bdf8" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#818cf8">
            <animate attributeName="stop-color" values="#818cf8;#60a5fa;#38bdf8;#818cf8" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" stroke="url(#browser-flow)" /><line x1="2" y1="12" x2="22" y2="12" stroke="url(#browser-flow)" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" stroke="url(#browser-flow)" />
    </svg>
  )
}
function DocsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
}
function StarterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="starter-flow" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3ecf8e">
            <animate attributeName="stop-color" values="#3ecf8e;#60a5fa;#3ecf8e" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#60a5fa">
            <animate attributeName="stop-color" values="#60a5fa;#3ecf8e;#60a5fa" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <path d="M13 10V3L4 14h7v7l9-11h-7z" stroke="url(#starter-flow)" />
    </svg>
  )
}
function SolanaIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 397.7 311.7">
      <defs>
        <linearGradient id="solana-flow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00FFA3">
            <animate attributeName="stop-color" values="#00FFA3;#DC1FFF;#00FFA3" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stopColor="#9945FF">
            <animate attributeName="stop-color" values="#9945FF;#00FFA3;#9945FF" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor="#DC1FFF">
            <animate attributeName="stop-color" values="#DC1FFF;#9945FF;#DC1FFF" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
      </defs>
      <path fill="url(#solana-flow)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"/>
      <path fill="url(#solana-flow)" d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"/>
      <path fill="url(#solana-flow)" d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"/>
    </svg>
  )
}

// Icon lookup for pinned sidebar tools
export const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  git: GitIcon, deploy: DeployIcon, env: EnvIcon,
  wallet: WalletIcon, email: EmailIcon, browser: BrowserIcon,
  ports: PortsIcon, processes: ProcessIcon, settings: SettingsIcon,
  'image-editor': PaintIcon, 'solana-toolbox': SolanaIcon, docs: DocsIcon, starter: StarterIcon,
}

// Tool name lookup
export const TOOL_NAMES: Record<string, string> = {
  git: 'Git', deploy: 'Deploy', env: 'Env',
  wallet: 'Wallet', email: 'Email', browser: 'Browser',
  ports: 'Ports', processes: 'Processes', settings: 'Settings',
  'image-editor': 'Image Editor', 'solana-toolbox': 'Solana', docs: 'Docs', starter: 'New Project',
}

// Lazy-load all tool components
const GitPanel = lazy(() => import('../../panels/GitPanel/GitPanel').then(m => ({ default: m.GitPanel })))
const EnvManager = lazy(() => import('../../panels/EnvManager/EnvManager').then(m => ({ default: m.EnvManager })))
const DeployPanel = lazy(() => import('../../panels/plugins/Deploy/Deploy'))
const EmailPanel = lazy(() => import('../../panels/plugins/Email/EmailPanel'))
const WalletPanel = lazy(() => import('../../panels/WalletPanel/WalletPanel').then(m => ({ default: m.WalletPanel })))
const SettingsPanel = lazy(() => import('../../panels/SettingsPanel/SettingsPanel').then(m => ({ default: m.SettingsPanel })))
const PortsPanel = lazy(() => import('../../panels/PortsPanel/PortsPanel').then(m => ({ default: m.PortsPanel })))
const ProcessManager = lazy(() => import('../../panels/ProcessManager/ProcessManager').then(m => ({ default: m.ProcessManager })))
const BrowserMode = lazy(() => import('../../panels/BrowserMode/BrowserMode').then(m => ({ default: m.BrowserMode })))
const ImageEditor = lazy(() => import('../../panels/ImageEditor/ImageEditor'))
const SolanaToolbox = lazy(() => import('../../panels/SolanaToolbox/SolanaToolbox'))
const DocsPanel = lazy(() => import('../../panels/DocsPanel/DocsPanel').then(m => ({ default: m.DocsPanel })))
const ProjectStarter = lazy(() => import('../../panels/ProjectStarter/ProjectStarter'))

// Per-tool accent colors for the drawer grid and sidebar
export const TOOL_COLORS: Record<string, string> = {
  starter: '#3ecf8e',
  git: '#a78bfa',
  deploy: '#60a5fa',
  env: '#f0b429',
  wallet: '#f472b6',
  email: '#fb923c',
  ports: '#38bdf8',
  processes: '#ef5350',
  settings: '#9ca3af',
  'image-editor': '#e879f9',
  'solana-toolbox': '#14f195',
  docs: '#94a3b8',
}

// Built-in tools registry — exported so other modules can enumerate all tool IDs
// Note: 'browser' is intentionally excluded — it opens as a pinned editor tab (Ctrl+Shift+B), not a drawer panel
export const BUILTIN_TOOLS: DrawerTool[] = [
  { id: 'starter', name: 'New Project', description: 'Scaffold a Solana project with AI', icon: StarterIcon, component: ProjectStarter, category: 'dev' },
  { id: 'git', name: 'Git', description: 'Source control', icon: GitIcon, component: GitPanel, category: 'dev' },
  { id: 'deploy', name: 'Deploy', description: 'Vercel & Railway', icon: DeployIcon, component: DeployPanel, category: 'dev' },
  { id: 'env', name: 'Env', description: 'Environment variables', icon: EnvIcon, component: EnvManager, category: 'dev' },
  { id: 'wallet', name: 'Wallet', description: 'Solana wallets', icon: WalletIcon, component: WalletPanel, category: 'crypto' },
  { id: 'email', name: 'Email', description: 'Gmail & iCloud', icon: EmailIcon, component: EmailPanel, category: 'create' },
  { id: 'ports', name: 'Ports', description: 'Port scanner', icon: PortsIcon, component: PortsPanel, category: 'system' },
  { id: 'processes', name: 'Processes', description: 'System monitor', icon: ProcessIcon, component: ProcessManager, category: 'system' },
  { id: 'settings', name: 'Settings', description: 'App configuration', icon: SettingsIcon, component: SettingsPanel, category: 'system' },
  { id: 'image-editor', name: 'Image Editor', description: 'Edit images with layers & filters', icon: PaintIcon, component: ImageEditor, category: 'create' },
  { id: 'solana-toolbox', name: 'Solana', description: 'Solana tools, MCPs, validator', icon: SolanaIcon, component: SolanaToolbox, category: 'crypto' },
  { id: 'docs', name: 'Docs', description: 'DAEMON documentation', icon: DocsIcon, component: DocsPanel, category: 'system' },
]

function getDrawerTools(toolVisibility: Record<string, boolean>): DrawerTool[] {
  const tools = [...BUILTIN_TOOLS]

  // Add enabled plugins
  const plugins = usePluginStore.getState().plugins
  for (const p of plugins) {
    if (!p.enabled) continue
    const manifest = PLUGIN_REGISTRY[p.id]
    if (!manifest) continue
    // Skip plugins already represented as built-in tools
    if (BUILTIN_TOOLS.some(t => t.id === p.id)) continue
    tools.push({
      id: p.id,
      name: manifest.name,
      description: manifest.description,
      icon: manifest.icon,
      component: manifest.component,
      category: 'crypto',
    })
  }

  // Filter by workspace profile visibility
  return tools.filter((t) => {
    if (t.id === 'settings') return true
    if (!(t.id in toolVisibility)) return true
    return toolVisibility[t.id]
  })
}

function ToolFallback() {
  return <div className="drawer-loading">Loading...</div>
}

// Shared MIME type for tool drag-and-drop (drawer <-> sidebar)
export const TOOL_DND_MIME = 'application/x-daemon-tool'

export function CommandDrawer() {
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const drawerTool = useUIStore((s) => s.drawerTool)
  const drawerFullscreen = useUIStore((s) => s.drawerFullscreen)
  const drawerToolOrder = useUIStore((s) => s.drawerToolOrder)
  const setDrawerTool = useUIStore((s) => s.setDrawerTool)
  const closeDrawer = useUIStore((s) => s.closeDrawer)
  const toggleDrawerFullscreen = useUIStore((s) => s.toggleDrawerFullscreen)

  const [search, setSearch] = useState('')
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const plugins = usePluginStore((s) => s.plugins)
  const toolVisibility = useWorkspaceProfileStore((s) => s.toolVisibility)
  const rawTools = useMemo(() => getDrawerTools(toolVisibility), [plugins, toolVisibility]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply custom ordering if set
  const allTools = useMemo(() => {
    if (!drawerToolOrder.length) return rawTools
    const byId = new Map(rawTools.map((t) => [t.id, t]))
    const ordered: DrawerTool[] = []
    for (const id of drawerToolOrder) {
      const tool = byId.get(id)
      if (tool) { ordered.push(tool); byId.delete(id) }
    }
    // Append any tools not in the saved order (new tools)
    for (const tool of byId.values()) ordered.push(tool)
    return ordered
  }, [rawTools, drawerToolOrder])

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allTools
    return allTools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    )
  }, [allTools, search])

  // Focus search input when drawer opens in grid mode
  useEffect(() => {
    if (drawerOpen && !drawerTool) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [drawerOpen, drawerTool])

  // Esc to close or go back to grid
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (document.querySelector('.agent-launcher-overlay, .palette-overlay')) return
      e.preventDefault()
      e.stopPropagation()
      if (drawerTool) {
        useUIStore.setState({ drawerTool: null, drawerFullscreen: false })
      } else {
        closeDrawer()
      }
    }
  }, [drawerTool, closeDrawer])

  useEffect(() => {
    if (!drawerOpen) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [drawerOpen, handleKeyDown])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && filteredTools.length > 0) {
      e.preventDefault()
      setDrawerTool(filteredTools[0].id)
      setSearch('')
    }
  }

  const handleToolClick = (toolId: string) => {
    setDrawerTool(toolId)
    setSearch('')
  }

  // --- Drag-and-drop for reordering ---
  const handleDragStart = useCallback((e: DragEvent<HTMLButtonElement>, toolId: string) => {
    e.dataTransfer.setData(TOOL_DND_MIME, toolId)
    e.dataTransfer.effectAllowed = 'move'
    ;(e.currentTarget as HTMLElement).classList.add('drawer-tool-card--dragging')
  }, [])

  const handleDragEnd = useCallback((e: DragEvent<HTMLButtonElement>) => {
    ;(e.currentTarget as HTMLElement).classList.remove('drawer-tool-card--dragging')
    setDragOverIdx(null)
  }, [])

  const handleCardDragOver = useCallback((e: DragEvent<HTMLButtonElement>, idx: number) => {
    if (!e.dataTransfer.types.includes(TOOL_DND_MIME)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverIdx(idx)
  }, [])

  const handleCardDrop = useCallback((e: DragEvent<HTMLButtonElement>, targetIdx: number) => {
    e.preventDefault()
    setDragOverIdx(null)
    const draggedId = e.dataTransfer.getData(TOOL_DND_MIME)
    if (!draggedId) return
    const currentOrder = allTools.map((t) => t.id)
    const fromIdx = currentOrder.indexOf(draggedId)
    if (fromIdx === -1 || fromIdx === targetIdx) return
    currentOrder.splice(fromIdx, 1)
    currentOrder.splice(targetIdx, 0, draggedId)
    useUIStore.getState().setDrawerToolOrder(currentOrder)
  }, [allTools])

  if (!drawerOpen) return null

  const activeTool = drawerTool ? allTools.find(t => t.id === drawerTool) : null

  return (
    <div className={`command-drawer${drawerFullscreen ? ' command-drawer--fullscreen' : ''}`} ref={drawerRef}>
      {/* Header */}
      <div className="drawer-header">
        {activeTool ? (
          <>
            <button className="drawer-back" onClick={() => useUIStore.setState({ drawerTool: null, drawerFullscreen: false })} title="Back to tools">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <span className="drawer-title">{activeTool.name}</span>
          </>
        ) : (
          <input
            ref={searchRef}
            className="drawer-search"
            placeholder="Search tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
        )}
        {activeTool && (
          <button className="drawer-fullscreen" onClick={toggleDrawerFullscreen} title={drawerFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {drawerFullscreen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
              </svg>
            )}
          </button>
        )}
        <button className="drawer-close" onClick={closeDrawer} title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="drawer-content">
        {activeTool ? (
          <PanelErrorBoundary fallbackLabel="Tool crashed — press Esc to go back">
            <Suspense fallback={<ToolFallback />}>
              <activeTool.component />
            </Suspense>
          </PanelErrorBoundary>
        ) : (
          <div className="drawer-grid">
            {filteredTools.map((tool, idx) => {
              const Icon = tool.icon
              const color = TOOL_COLORS[tool.id] ?? '#3ecf8e'
              return (
                <button
                  key={tool.id}
                  className={`drawer-tool-card${dragOverIdx === idx ? ' drawer-tool-card--drop-target' : ''}`}
                  style={{ '--tool-color': color, '--tool-glow': `${color}20` } as React.CSSProperties}
                  draggable
                  onClick={() => handleToolClick(tool.id)}
                  onDragStart={(e) => handleDragStart(e, tool.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleCardDragOver(e, idx)}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => handleCardDrop(e, idx)}
                >
                  <div className="drawer-tool-icon"><Icon size={20} /></div>
                  <div className="drawer-tool-name">{tool.name}</div>
                  <div className="drawer-tool-desc">{tool.description}</div>
                </button>
              )
            })}
            {filteredTools.length === 0 && (
              <div className="drawer-empty">No tools match "{search}"</div>
            )}
            {filteredTools.length > 0 && !search && (
              <div className="drawer-hint">Drag favorites to sidebar</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

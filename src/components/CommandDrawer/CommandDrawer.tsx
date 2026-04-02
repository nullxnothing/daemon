import { useState, useRef, useEffect, useCallback, lazy, Suspense, type ComponentType } from 'react'
import { useUIStore } from '../../store/ui'
import { usePluginStore } from '../../store/plugins'
import { PLUGIN_REGISTRY } from '../../plugins/registry'
import { PluginErrorBoundary } from '../ErrorBoundary'
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
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><line x1="12" y1="9" x2="12" y2="12"/><line x1="12" y1="12" x2="6" y2="15"/><line x1="12" y1="12" x2="18" y2="15"/></svg>
}
function EnvIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
}
function DeployIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L12 16M12 2L8 6M12 2L16 6"/><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/></svg>
}
function ImageIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
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
function ToolsIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
}
function PaintIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><path d="M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/><path d="M7 13.5Q9 9 12 13.5T17 10"/></svg>
}
function BrowserIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
}

// Icon lookup for pinned sidebar tools
export const TOOL_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  git: GitIcon, deploy: DeployIcon, env: EnvIcon, tools: ToolsIcon,
  wallet: WalletIcon, images: ImageIcon, email: EmailIcon, browser: BrowserIcon,
  ports: PortsIcon, processes: ProcessIcon, settings: SettingsIcon,
  'image-editor': PaintIcon,
}

// Tool name lookup
export const TOOL_NAMES: Record<string, string> = {
  git: 'Git', deploy: 'Deploy', env: 'Env', tools: 'Tools',
  wallet: 'Wallet', images: 'Images', email: 'Email', browser: 'Browser',
  ports: 'Ports', processes: 'Processes', settings: 'Settings',
  'image-editor': 'Image Editor',
}

// Lazy-load all tool components
const GitPanel = lazy(() => import('../../panels/GitPanel/GitPanel').then(m => ({ default: m.GitPanel })))
const EnvManager = lazy(() => import('../../panels/EnvManager/EnvManager').then(m => ({ default: m.EnvManager })))
const DeployPanel = lazy(() => import('../../panels/plugins/Deploy/Deploy'))
const ImagePanel = lazy(() => import('../../panels/ImagePanel/ImagePanel').then(m => ({ default: m.ImagePanel })))
const EmailPanel = lazy(() => import('../../panels/plugins/Email/EmailPanel'))
const WalletPanel = lazy(() => import('../../panels/WalletPanel/WalletPanel').then(m => ({ default: m.WalletPanel })))
const SettingsPanel = lazy(() => import('../../panels/SettingsPanel/SettingsPanel').then(m => ({ default: m.SettingsPanel })))
const PortsPanel = lazy(() => import('../../panels/PortsPanel/PortsPanel').then(m => ({ default: m.PortsPanel })))
const ProcessManager = lazy(() => import('../../panels/ProcessManager/ProcessManager').then(m => ({ default: m.ProcessManager })))
const ToolBrowser = lazy(() => import('../../panels/Tools/ToolBrowser').then(m => ({ default: m.ToolBrowser })))
const BrowserMode = lazy(() => import('../../panels/BrowserMode/BrowserMode').then(m => ({ default: m.BrowserMode })))
const ImageEditor = lazy(() => import('../../panels/ImageEditor/ImageEditor'))

// Built-in tools registry
const BUILTIN_TOOLS: DrawerTool[] = [
  { id: 'git', name: 'Git', description: 'Source control', icon: GitIcon, component: GitPanel, category: 'dev' },
  { id: 'deploy', name: 'Deploy', description: 'Vercel & Railway', icon: DeployIcon, component: DeployPanel, category: 'dev' },
  { id: 'env', name: 'Env', description: 'Environment variables', icon: EnvIcon, component: EnvManager, category: 'dev' },
  { id: 'tools', name: 'Tools', description: 'Project scripts', icon: ToolsIcon, component: ToolBrowser, category: 'dev' },
  { id: 'wallet', name: 'Wallet', description: 'Solana wallets', icon: WalletIcon, component: WalletPanel, category: 'crypto' },
  { id: 'images', name: 'Images', description: 'AI image generation', icon: ImageIcon, component: ImagePanel, category: 'create' },
  { id: 'email', name: 'Email', description: 'Gmail & iCloud', icon: EmailIcon, component: EmailPanel, category: 'create' },
  { id: 'browser', name: 'Browser', description: 'Embedded browser', icon: BrowserIcon, component: BrowserMode, category: 'dev' },
  { id: 'ports', name: 'Ports', description: 'Port scanner', icon: PortsIcon, component: PortsPanel, category: 'system' },
  { id: 'processes', name: 'Processes', description: 'System monitor', icon: ProcessIcon, component: ProcessManager, category: 'system' },
  { id: 'settings', name: 'Settings', description: 'App configuration', icon: SettingsIcon, component: SettingsPanel, category: 'system' },
  { id: 'image-editor', name: 'Image Editor', description: 'Edit images with layers & filters', icon: PaintIcon, component: ImageEditor, category: 'create' },
]

function getDrawerTools(): DrawerTool[] {
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

  return tools
}

function ToolFallback() {
  return <div className="drawer-loading">Loading...</div>
}

export function CommandDrawer() {
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const drawerTool = useUIStore((s) => s.drawerTool)
  const drawerFullscreen = useUIStore((s) => s.drawerFullscreen)
  const setDrawerTool = useUIStore((s) => s.setDrawerTool)
  const closeDrawer = useUIStore((s) => s.closeDrawer)
  const toggleDrawerFullscreen = useUIStore((s) => s.toggleDrawerFullscreen)

  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  const allTools = getDrawerTools()

  // Filter tools by search
  const filteredTools = search.trim()
    ? allTools.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      )
    : allTools

  // Focus search input when drawer opens in grid mode
  useEffect(() => {
    if (drawerOpen && !drawerTool) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [drawerOpen, drawerTool])

  // Esc to close or go back to grid
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (drawerTool) {
        // Back to grid
        setDrawerTool(null)
        useUIStore.getState().drawerOpen = true // keep open
        useUIStore.setState({ drawerOpen: true, drawerTool: null })
      } else {
        closeDrawer()
      }
    }
  }, [drawerTool, setDrawerTool, closeDrawer])

  useEffect(() => {
    if (!drawerOpen) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [drawerOpen, handleKeyDown])

  // Handle Enter in search to select first match
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
          <PluginErrorBoundary fallbackLabel="Tool crashed — press Esc to go back">
            <Suspense fallback={<ToolFallback />}>
              <activeTool.component />
            </Suspense>
          </PluginErrorBoundary>
        ) : (
          <div className="drawer-grid">
            {filteredTools.map((tool) => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  className="drawer-tool-card"
                  onClick={() => handleToolClick(tool.id)}
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
          </div>
        )}
      </div>
    </div>
  )
}

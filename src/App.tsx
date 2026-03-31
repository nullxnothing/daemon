import { useEffect, useState, useCallback, Suspense } from 'react'
import { FileExplorer } from './panels/FileExplorer/FileExplorer'
import { EditorPanel } from './panels/Editor/Editor'
import { TerminalPanel } from './panels/Terminal/Terminal'
import { AgentLauncher } from './panels/AgentLauncher/AgentLauncher'
import { ClaudePanel } from './panels/ClaudePanel/ClaudePanel'
import { ProcessManager } from './panels/ProcessManager/ProcessManager'
import { EnvManager } from './panels/EnvManager/EnvManager'
import { PortsPanel } from './panels/PortsPanel/PortsPanel'
import { GitPanel } from './panels/GitPanel/GitPanel'
import { WalletPanel } from './panels/WalletPanel/WalletPanel'
import { RecoveryPanel } from './panels/RecoveryPanel/RecoveryPanel'
import { SettingsPanel } from './panels/SettingsPanel/SettingsPanel'
import { ToolBrowser } from './panels/Tools/ToolBrowser'
import { PluginManager } from './panels/PluginManager/PluginManager'
import { PluginDashboard } from './panels/PluginDashboard/PluginDashboard'
import { Titlebar } from './panels/Titlebar/Titlebar'
import { IconSidebar } from './panels/IconSidebar/IconSidebar'
import { StatusBar } from './panels/StatusBar/StatusBar'
import { Onboarding } from './panels/Onboarding/Onboarding'
import { PluginErrorBoundary } from './components/ErrorBoundary'
import { useUIStore } from './store/ui'
import { useWalletStore } from './store/wallet'
import { usePluginStore } from './store/plugins'
import { PLUGIN_REGISTRY } from './plugins/registry'
import { useSplitter } from './hooks/useSplitter'
import './App.css'

function PluginFallback() {
  return <div style={{ padding: '16px 12px', fontSize: 11, color: 'var(--t3)' }}>Loading plugin...</div>
}

function App() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activePanel = useUIStore((s) => s.activePanel)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const projects = useUIStore((s) => s.projects)
  const setProjects = useUIStore((s) => s.setProjects)
  const activePluginId = usePluginStore((s) => s.activePluginId)
  const showOnboarding = useUIStore((s) => s.showOnboarding)
  const [showExplorer, setShowExplorer] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showAgentLauncher, setShowAgentLauncher] = useState(false)

  const { size: terminalHeight, splitterProps } = useSplitter({
    direction: 'vertical',
    min: 80,
    max: 600,
    initial: 200,
  })

  // Hide right panel when plugin dashboard is open (redundant with center grid)
  const shouldShowRightPanel = showRightPanel && !(activePanel === 'plugins' && !activePluginId)

  useEffect(() => {
    window.postMessage({ payload: 'removeLoading' }, '*')
    loadProjects()
    usePluginStore.getState().load()
    // Debug: expose store for CDP testing (remove in production)
    ;(window as any).__uiStore = useUIStore
    // Check Claude connection — show onboarding if not connected
    window.daemon.claude.getConnection().then((res) => {
      if (!res.ok || !res.data || res.data.authMode === 'none') {
        useUIStore.getState().setShowOnboarding(true)
      }
    })
  }, [])

  useEffect(() => {
    void useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  const loadProjects = async () => {
    const res = await window.daemon.projects.list()
    if (!res.ok || !res.data) return
    setProjects(res.data)

    // Restore the most recently active project on fresh load / after crash recovery
    if (!useUIStore.getState().activeProjectId && res.data.length > 0) {
      const sorted = [...res.data].sort((a, b) => (b.last_active ?? 0) - (a.last_active ?? 0))
      const last = sorted[0]
      if (last) setActiveProject(last.id, last.path)
    }
  }

  const handleAddProject = useCallback(async () => {
    const pathRes = await window.daemon.projects.openDialog()
    if (!pathRes.ok || !pathRes.data) return
    const folderPath = pathRes.data
    const name = folderPath.split(/[/\\]/).pop() ?? 'untitled'
    const res = await window.daemon.projects.create({ name, path: folderPath })
    if (res.ok && res.data) {
      setProjects([res.data, ...useUIStore.getState().projects])
      setActiveProject(res.data.id, res.data.path)
    }
  }, [setActiveProject, setProjects])

  const handleRemoveProject = useCallback(async (projectId: string) => {
    const projectTerminals = useUIStore.getState().terminals.filter((t) => t.projectId === projectId)
    await Promise.all(projectTerminals.map((t) => window.daemon.terminal.kill(t.id)))
    await window.daemon.projects.delete(projectId)
    useUIStore.getState().removeProjectState(projectId)
    setProjects(useUIStore.getState().projects.filter((pr) => pr.id !== projectId))
    if (useUIStore.getState().activeProjectId === projectId) {
      setActiveProject(null, null)
    }
  }, [setActiveProject, setProjects])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault()
        setShowAgentLauncher((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        window.daemon.window.reload()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        setShowRightPanel((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Resolve active plugin and its mount type
  const activePlugin = activePluginId ? PLUGIN_REGISTRY[activePluginId] : null
  const isRightPanelPlugin = activePlugin?.mountPosition === 'right-panel-tab'
  const isCenterPanelPlugin = activePlugin?.mountPosition === 'center-panel'
  const isOverlayPlugin = activePlugin?.mountPosition === 'overlay'

  return (
    <div className="app">
      <Titlebar
        projects={projects}
        onAddProject={handleAddProject}
        onRemoveProject={handleRemoveProject}
      />

      <div className="main-layout">
        <IconSidebar
          showExplorer={showExplorer}
          onToggleExplorer={() => setShowExplorer(!showExplorer)}
          onOpenAgentLauncher={() => setShowAgentLauncher(true)}
        />

        {showExplorer && activeProjectPath && (
          <div className="left-panel">
            <div className="panel-header">Files</div>
            <FileExplorer />
          </div>
        )}

        <div className="center-area">
          <div className="editor-area">
            {isCenterPanelPlugin && activePlugin ? (
              <PluginErrorBoundary>
                <Suspense fallback={<PluginFallback />}>
                  <activePlugin.component />
                </Suspense>
              </PluginErrorBoundary>
            ) : activePanel === 'plugins' && !activePluginId ? (
              <PluginDashboard />
            ) : activePanel === 'env' ? <EnvManager /> : activePanel === 'git' ? <GitPanel /> : activePanel === 'recovery' ? <RecoveryPanel /> : activePanel === 'settings' ? <SettingsPanel /> : activePanel === 'tools' ? <ToolBrowser /> : <EditorPanel />}
          </div>
          <div className="splitter" {...splitterProps} />
          <div className="terminal-area" style={{ height: terminalHeight }}>
            <TerminalPanel />
          </div>
        </div>

        {shouldShowRightPanel && <aside className="right-panel">
          {isCenterPanelPlugin && activePlugin?.companionPanel ? (
            <PluginErrorBoundary>
              <Suspense fallback={<PluginFallback />}>
                <activePlugin.companionPanel />
              </Suspense>
            </PluginErrorBoundary>
          ) : isRightPanelPlugin && activePlugin ? (
            <div className="right-panel-split">
              <div className="right-panel-plugin">
                <PluginErrorBoundary>
                  <Suspense fallback={<PluginFallback />}>
                    <activePlugin.component />
                  </Suspense>
                </PluginErrorBoundary>
              </div>
              <div className="right-panel-claude">
                <ClaudePanel />
              </div>
            </div>
          ) : activePanel === 'plugins' ? (
            <PluginManager />
          ) : (
            <div className="right-panel-tabbed">
              <div className="right-panel-content">
                {activePanel === 'process' ? <ProcessManager />
                  : activePanel === 'ports' ? <PortsPanel />
                  : activePanel === 'wallet' ? <WalletPanel />
                  : <ClaudePanel />}
              </div>
              <div className="right-panel-tabs">
                <button
                  className={`rp-tab ${activePanel === 'claude' || activePanel === 'env' || activePanel === 'git' || activePanel === 'recovery' || activePanel === 'settings' || activePanel === 'tools' ? 'active' : ''}`}
                  onClick={() => { usePluginStore.getState().setActivePlugin(null); useUIStore.getState().setActivePanel('claude') }}
                  title="Claude"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                </button>
                <button
                  className={`rp-tab ${activePanel === 'ports' ? 'active' : ''}`}
                  onClick={() => { usePluginStore.getState().setActivePlugin(null); useUIStore.getState().setActivePanel('ports') }}
                  title="Ports"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                    <line x1="12" y1="2" x2="12" y2="9"/><line x1="12" y1="15" x2="12" y2="22"/>
                  </svg>
                </button>
                <button
                  className={`rp-tab ${activePanel === 'process' ? 'active' : ''}`}
                  onClick={() => { usePluginStore.getState().setActivePlugin(null); useUIStore.getState().setActivePanel('process') }}
                  title="Processes"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="4" y="4" width="16" height="16" rx="2"/>
                    <line x1="4" y1="10" x2="20" y2="10"/>
                    <line x1="10" y1="4" x2="10" y2="20"/>
                  </svg>
                </button>
                <button
                  className={`rp-tab ${activePanel === 'wallet' ? 'active' : ''}`}
                  onClick={() => { usePluginStore.getState().setActivePlugin(null); useUIStore.getState().setActivePanel('wallet') }}
                  title="Wallet"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V9h1.5A1.5 1.5 0 0 1 22 10.5v5a1.5 1.5 0 0 1-1.5 1.5H19v1.5A2.5 2.5 0 0 1 16.5 21h-11A2.5 2.5 0 0 1 3 18.5v-11Z"/>
                    <circle cx="18" cy="13" r="1"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </aside>}
      </div>

      <StatusBar />

      <AgentLauncher
        isOpen={showAgentLauncher}
        onClose={() => setShowAgentLauncher(false)}
      />

      {isOverlayPlugin && activePlugin && (
        <div className="plugin-overlay">
          <PluginErrorBoundary>
            <Suspense fallback={<PluginFallback />}>
              <activePlugin.component />
            </Suspense>
          </PluginErrorBoundary>
        </div>
      )}

      {showOnboarding && <Onboarding />}
    </div>
  )
}

export default App

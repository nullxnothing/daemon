import { useEffect, useState, useMemo, useRef, lazy, Suspense } from 'react'
import { BootLoader } from './components/BootLoader/BootLoader'
import { FileExplorer } from './panels/FileExplorer/FileExplorer'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { buildCommands } from './components/CommandPalette/commands'
import { EditorPanel } from './panels/Editor/Editor'
import { TerminalPanel } from './panels/Terminal/Terminal'
import { AgentLauncher } from './panels/AgentLauncher/AgentLauncher'
import { ClaudePanel } from './panels/ClaudePanel/ClaudePanel'
import { CommandDrawer } from './components/CommandDrawer/CommandDrawer'
import { AgentGrid } from './panels/Terminal/AgentGrid'
import { Titlebar } from './panels/Titlebar/Titlebar'
import { IconSidebar } from './panels/IconSidebar/IconSidebar'
import { StatusBar } from './panels/StatusBar/StatusBar'
import { OnboardingWizard } from './panels/Onboarding/OnboardingWizard'
import { TourOverlay } from './components/Tour/TourOverlay'
import { useOnboardingStore } from './store/onboarding'
import { useWorkspaceProfileStore } from './store/workspaceProfile'
import { PanelErrorBoundary } from './components/ErrorBoundary'
import { useUIStore } from './store/ui'
import { useWalletStore } from './store/wallet'
import { usePluginStore } from './store/plugins'
import { useEmailStore } from './store/email'
import { useSplitter } from './hooks/useSplitter'
import { useProjects } from './hooks/useProjects'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useCommandPalette } from './hooks/useCommandPalette'
import './App.css'

function App() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const activePanel = useUIStore((s) => s.activePanel)
  const projects = useUIStore((s) => s.projects)
  const wizardOpen = useOnboardingStore((s) => s.wizardOpen)
  const showResumeBanner = useOnboardingStore((s) => s.showResumeBanner)
  const tourActive = useOnboardingStore((s) => s.tourActive)
  const showTourOffer = useOnboardingStore((s) => s.showTourOffer)
  const centerMode = useUIStore((s) => s.centerMode)
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const [showExplorer, setShowExplorer] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showAgentLauncher, setShowAgentLauncher] = useState(false)
  const [crashWarningCount, setCrashWarningCount] = useState<number | null>(null)
  const [appReady, setAppReady] = useState(false)

  const [showTerminal, setShowTerminal] = useState(true)

  const { loadProjects, addProject, removeProject } = useProjects()
  const { paletteMode, setPaletteMode, paletteFiles, handleFileSelect, closePalette } = useCommandPalette()

  useAppShortcuts({ setPaletteMode, setShowAgentLauncher, setShowRightPanel, setShowTerminal })

  const centerRef = useRef<HTMLDivElement>(null)
  const halfCenter = Math.round((window.innerHeight - 80) / 2)
  const { size: terminalHeight, splitterProps } = useSplitter({
    direction: 'vertical',
    min: 80,
    max: 99999,
    initial: halfCenter,
    containerRef: centerRef,
  })

  const shouldShowRightPanel = showRightPanel

  // Determine if the editor should be hidden because the terminal has been
  // dragged to fill the full center area height.
  const [centerHeight, setCenterHeight] = useState(0)
  useEffect(() => {
    const el = centerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setCenterHeight(entry.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Collapse threshold: editor gets less than 30px of space
  const isEditorCollapsed = centerHeight > 0 && showTerminal && !drawerOpen && centerMode === 'canvas'
    && terminalHeight >= centerHeight - 34

  useEffect(() => {
    const guard = { cancelled: false }
    loadProjects(guard)
    usePluginStore.getState().load()
    useWorkspaceProfileStore.getState().load()
    // Debug: expose store for CDP testing
    if (import.meta.env.DEV) {
      ;(window as any).__uiStore = useUIStore
    }
    // Load onboarding progress — shows wizard or resume banner as needed
    useOnboardingStore.getState().loadProgress()
    // Signal the boot screen to dismiss after a brief minimum display window.
    // The 700ms floor ensures the loader is never just a flash.
    const readyId = setTimeout(() => {
      setAppReady(true)
      window.postMessage({ payload: 'removeLoading' }, '*')
    }, 700)
    return () => {
      guard.cancelled = true
      clearTimeout(readyId)
    }
  }, [])

  // Renderer crash capture — forward errors to main process via IPC
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      window.daemon.settings.reportCrash({
        type: 'renderer_error',
        message: event.message,
        stack: event.error?.stack ?? '',
      }).catch(() => {})
    }
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason)
      const stack = event.reason instanceof Error ? event.reason.stack ?? '' : ''
      window.daemon.settings.reportCrash({
        type: 'renderer_rejection',
        message,
        stack,
      }).catch(() => {})
    }
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  // Listen for startup crash warning from main process
  useEffect(() => {
    return window.daemon.settings.onCrashWarning((count) => {
      setCrashWarningCount(count)
    })
  }, [])

  useEffect(() => {
    void useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  // Poll unread email counts every 60 seconds
  useEffect(() => {
    const poll = () => useEmailStore.getState().pollUnreadCounts()
    poll()
    const interval = setInterval(poll, 60_000)
    return () => clearInterval(interval)
  }, [])

  // Build command list for the palette
  const paletteCommands = useMemo(
    () =>
      buildCommands({
        setActivePanel: (p) => useUIStore.getState().setActivePanel(p as any),
        setCenterMode: (m) => useUIStore.getState().setCenterMode(m as any),
        getCenterMode: () => useUIStore.getState().centerMode,
        toggleRightPanel: () => setShowRightPanel((v) => !v),
        openAgentLauncher: () => setShowAgentLauncher(true),
        toggleExplorer: () => setShowExplorer((v) => !v),
        setDrawerTool: (tool) => useUIStore.getState().setDrawerTool(tool),
      }),
    [],
  )

  return (
    <div className="app">
      <BootLoader ready={appReady} />
      {crashWarningCount !== null && (
        <div className="crash-warning-banner">
          <span>DAEMON recovered from {crashWarningCount} errors in the last hour.</span>
          <button
            className="crash-warning-link"
            onClick={() => { useUIStore.getState().setActivePanel('settings'); setCrashWarningCount(null) }}
          >
            View crash log
          </button>
          <button className="crash-warning-dismiss" onClick={() => setCrashWarningCount(null)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <Titlebar
        projects={projects}
        onAddProject={addProject}
        onRemoveProject={removeProject}
      />

      <div className="main-layout">
        <IconSidebar
          showExplorer={showExplorer}
          showRightPanel={showRightPanel}
          onToggleExplorer={() => setShowExplorer(!showExplorer)}
          onToggleRightPanel={() => setShowRightPanel(!showRightPanel)}
          onOpenAgentLauncher={() => setShowAgentLauncher(true)}
          isAgentLauncherOpen={showAgentLauncher}
        />

        {showExplorer && activeProjectPath && (
          <div className="left-panel" data-tour="file-explorer" style={drawerOpen ? { pointerEvents: 'none' } : undefined}>
            <FileExplorer />
          </div>
        )}

        <div className="center-area" style={{ position: 'relative' }} ref={centerRef}>
          {!isEditorCollapsed && (
            <div className="editor-area" data-tour="editor" style={drawerOpen ? { pointerEvents: 'none' } : undefined}>
              {centerMode === 'grind' ? (
                <AgentGrid />
              ) : (
                <PanelErrorBoundary fallbackLabel="Editor crashed — press Ctrl+K to access tools">
                  <EditorPanel />
                </PanelErrorBoundary>
              )}
            </div>
          )}
          {centerMode === 'canvas' && showTerminal && !drawerOpen && <div className="splitter" {...splitterProps} />}
          {centerMode === 'canvas' && showTerminal && (
            <div
              className="terminal-area"
              data-tour="terminal"
              style={{
                height: isEditorCollapsed ? undefined : terminalHeight,
                flex: isEditorCollapsed ? 1 : undefined,
                display: drawerOpen ? 'none' : undefined,
              }}
            >
              <TerminalPanel />
            </div>
          )}
          <CommandDrawer />
        </div>

        {shouldShowRightPanel && (
          <aside className="right-panel" data-tour="right-panel">
            <ClaudePanel />
          </aside>
        )}
      </div>

      <StatusBar />

      <AgentLauncher
        isOpen={showAgentLauncher}
        onClose={() => setShowAgentLauncher(false)}
      />

      {paletteMode && (
        <CommandPalette
          mode={paletteMode}
          commands={paletteCommands}
          files={paletteFiles}
          projectRoot={activeProjectPath}
          onClose={closePalette}
          onSelectFile={handleFileSelect}
        />
      )}

      {showResumeBanner && (
        <div className="resume-banner">
          <span className="resume-banner-text">Continue setting up DAEMON?</span>
          <button
            className="resume-banner-btn primary"
            onClick={() => useOnboardingStore.getState().openWizard()}
          >
            Resume
          </button>
          <button
            className="resume-banner-btn secondary"
            onClick={() => useOnboardingStore.getState().dismissBanner()}
          >
            Dismiss
          </button>
        </div>
      )}
      {wizardOpen && <OnboardingWizard />}

      {showTourOffer && (
        <div className="wizard-overlay">
          <div className="tour-offer-card">
            <div className="tour-offer-title">Setup complete</div>
            <div className="tour-offer-desc">
              Take a quick tour to learn where everything is?
            </div>
            <div className="tour-offer-actions">
              <button className="wizard-btn primary" onClick={() => useOnboardingStore.getState().startTour()}>
                Start Tour
              </button>
              <button className="wizard-btn secondary" onClick={() => useOnboardingStore.getState().dismissTourOffer()}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {tourActive && <TourOverlay />}
    </div>
  )
}

export default App

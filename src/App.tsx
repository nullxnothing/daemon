import { useEffect, useState, useMemo, useRef, useCallback, lazy, Suspense } from 'react'
import { BootLoader } from './components/BootLoader/BootLoader'
import { FileExplorer } from './panels/FileExplorer/FileExplorer'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { buildCommands } from './components/CommandPalette/commands'
import { AgentLauncher } from './panels/AgentLauncher/AgentLauncher'
import { CommandDrawer } from './components/CommandDrawer/CommandDrawer'
import { Titlebar } from './panels/Titlebar/Titlebar'
import { IconSidebar } from './panels/IconSidebar/IconSidebar'
import { StatusBar } from './panels/StatusBar/StatusBar'
import { OnboardingWizard } from './panels/Onboarding/OnboardingWizard'
import { LaunchWizard } from './panels/LaunchWizard/LaunchWizard'
import { TourOverlay } from './components/Tour/TourOverlay'
import { ToastHost } from './components/ToastHost'
import { ConfirmDialog } from './components/ConfirmDialog'
import { useNotificationsStore } from './store/notifications'
import { useAppActions } from './store/appActions'
import { useOnboardingStore } from './store/onboarding'
import { useWorkspaceProfileStore } from './store/workspaceProfile'
import { PanelErrorBoundary } from './components/ErrorBoundary'
import { useUIStore } from './store/ui'
import { useWalletStore } from './store/wallet'
import { usePluginStore } from './store/plugins'
import { useEmailStore } from './store/email'
import { useSolanaToolboxStore } from './store/solanaToolbox'
import { SolanaOnboardingBanner } from './components/SolanaOnboarding/SolanaOnboardingBanner'
import { useSplitter } from './hooks/useSplitter'
import { useProjects } from './hooks/useProjects'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useCommandPalette } from './hooks/useCommandPalette'
import './App.css'

const EditorPanel = lazy(() => import('./panels/Editor/Editor').then((module) => ({ default: module.EditorPanel })))
const TerminalPanel = lazy(() => import('./panels/Terminal/Terminal').then((module) => ({ default: module.TerminalPanel })))
const RightPanel = lazy(() => import('./panels/RightPanel/RightPanel').then((module) => ({ default: module.RightPanel })))
const AgentGrid = lazy(() => import('./panels/Terminal/AgentGrid').then((module) => ({ default: module.AgentGrid })))

function PanelSkeleton({ className }: { className: string }) {
  return <div className={className} />
}

function App() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const projects = useUIStore((s) => s.projects)
  const wizardOpen = useOnboardingStore((s) => s.wizardOpen)
  const showResumeBanner = useOnboardingStore((s) => s.showResumeBanner)
  const tourActive = useOnboardingStore((s) => s.tourActive)
  const showTourOffer = useOnboardingStore((s) => s.showTourOffer)
  const centerMode = useUIStore((s) => s.centerMode)
  const drawerOpen = useUIStore((s) => s.drawerOpen)
  const launchWizardOpen = useUIStore((s) => s.launchWizardOpen)
  const [showExplorer, setShowExplorer] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showAgentLauncher, setShowAgentLauncher] = useState(false)
  const [crashWarningCount, setCrashWarningCount] = useState<number | null>(null)
  const [appReady, setAppReady] = useState(false)

  const [showTerminal, setShowTerminal] = useState(true)

  const { loadProjects, addProject, removeProject } = useProjects()
  const { paletteMode, setPaletteMode, paletteFiles, handleFileSelect, closePalette } = useCommandPalette()
  const closeAgentLauncher = useCallback(() => setShowAgentLauncher(false), [])

  useAppShortcuts({ setPaletteMode, setShowAgentLauncher, setShowExplorer: setShowExplorer, setShowRightPanel, setShowTerminal })

  const centerRef = useRef<HTMLDivElement>(null)
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight)
  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const halfCenter = Math.round((windowHeight - 80) / 2)
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
    useUIStore.getState().loadPinnedState()
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

  // Load activity history once on mount so the activity log is populated
  useEffect(() => {
    useNotificationsStore.getState().loadActivity()
  }, [])

  // Imperative app actions from nested components — replaces synthetic keyboard
  // events. Each requestId increments to retrigger.
  const filePaletteRequestId = useAppActions((s) => s.filePaletteRequestId)
  const agentLauncherRequestId = useAppActions((s) => s.agentLauncherRequestId)
  const terminalFocusRequestId = useAppActions((s) => s.terminalFocusRequestId)
  useEffect(() => { if (filePaletteRequestId > 0) setPaletteMode('files') }, [filePaletteRequestId, setPaletteMode])
  useEffect(() => { if (agentLauncherRequestId > 0) setShowAgentLauncher(true) }, [agentLauncherRequestId])
  useEffect(() => { if (terminalFocusRequestId > 0) setShowTerminal(true) }, [terminalFocusRequestId])

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

  // Listen for startup crash warning from main process.
  // Only show the banner when at least 3 crashes occurred — single transient
  // errors are not worth interrupting the user.
  useEffect(() => {
    const CRASH_BANNER_THRESHOLD = 3
    return window.daemon.settings.onCrashWarning((count) => {
      if (count >= CRASH_BANNER_THRESHOLD) {
        setCrashWarningCount(count)
      }
    })
  }, [])

  useEffect(() => {
    void useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  // Detect Solana project when active project changes
  useEffect(() => {
    if (activeProjectPath) {
      const store = useSolanaToolboxStore.getState()
      void store.detectProject(activeProjectPath)
      void store.loadMcps(activeProjectPath)
    }
  }, [activeProjectPath])

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
        setCenterMode: (m) => useUIStore.getState().setCenterMode(m as any),
        getCenterMode: () => useUIStore.getState().centerMode,
        toggleRightPanel: () => setShowRightPanel((v) => !v),
        openAgentLauncher: () => setShowAgentLauncher(true),
        toggleExplorer: () => setShowExplorer((v) => !v),
        setDrawerTool: (tool) => useUIStore.getState().setDrawerTool(tool),
        toggleBrowserTab: () => useUIStore.getState().toggleBrowserTab(),
        toggleDashboardTab: () => useUIStore.getState().toggleDashboardTab(),
      }),
    [],
  )

  return (
    <div className="app">
      <a href="#editor-area" className="skip-link">Skip to editor</a>
      <a href="#terminal-area" className="skip-link">Skip to terminal</a>
      <BootLoader ready={appReady} />
      {crashWarningCount !== null && (
        <div className="crash-warning-banner">
          <span>DAEMON recovered from {crashWarningCount} errors in the last hour.</span>
          <button
            className="crash-warning-link"
            onClick={() => { useUIStore.getState().setDrawerTool('settings'); setCrashWarningCount(null) }}
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
          onToggleExplorer={() => setShowExplorer(!showExplorer)}
          onOpenAgentLauncher={() => setShowAgentLauncher(true)}
          isAgentLauncherOpen={showAgentLauncher}
        />

        {showExplorer && activeProjectPath && (
          <div className="left-panel" data-tour="file-explorer">
            <FileExplorer />
          </div>
        )}

        <div className="center-area" style={{ position: 'relative' }} ref={centerRef}>
          <SolanaOnboardingBanner />
          {!isEditorCollapsed && (
            <div id="editor-area" className="editor-area" data-tour="editor">
              {centerMode === 'grind' ? (
                <Suspense fallback={<PanelSkeleton className="editor-panel" />}>
                  <AgentGrid />
                </Suspense>
              ) : (
                <PanelErrorBoundary fallbackLabel="Editor crashed — press Ctrl+K to access tools">
                  <Suspense fallback={<PanelSkeleton className="editor-panel" />}>
                    <EditorPanel />
                  </Suspense>
                </PanelErrorBoundary>
              )}
            </div>
          )}
          {centerMode === 'canvas' && showTerminal && !drawerOpen && <div className="splitter" {...splitterProps} />}
          {centerMode === 'canvas' && (
            <div
              id="terminal-area"
              className="terminal-area"
              data-tour="terminal"
              style={{
                height: isEditorCollapsed ? undefined : terminalHeight,
                flex: isEditorCollapsed ? 1 : undefined,
                display: (!showTerminal || drawerOpen) ? 'none' : undefined,
              }}
            >
              <Suspense fallback={<PanelSkeleton className="terminal-panel" />}>
                <TerminalPanel />
              </Suspense>
            </div>
          )}
          <CommandDrawer />
        </div>

        {shouldShowRightPanel && (
          <aside className="right-panel" data-tour="right-panel">
            <Suspense fallback={<PanelSkeleton className="right-panel" />}>
              <RightPanel />
            </Suspense>
          </aside>
        )}
      </div>

      <StatusBar />

      <AgentLauncher
        isOpen={showAgentLauncher}
        onClose={closeAgentLauncher}
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
      {launchWizardOpen && <LaunchWizard />}

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
      <ToastHost />
      <ConfirmDialog />
    </div>
  )
}

export default App

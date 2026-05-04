import { useEffect, useState, useMemo, useRef, useCallback, Suspense } from 'react'
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
import { useWorkflowShellStore } from './store/workflowShell'
import { SolanaOnboardingBanner } from './components/SolanaOnboarding/SolanaOnboardingBanner'
import { Skeleton } from './components/Panel'
import { useSplitter } from './hooks/useSplitter'
import { useProjects } from './hooks/useProjects'
import { useAppShortcuts } from './hooks/useAppShortcuts'
import { useCommandPalette } from './hooks/useCommandPalette'
import { useShellLayout } from './hooks/useShellLayout'
import { daemon } from './lib/daemonBridge'
import { lazyNamedWithReload } from './utils/lazyWithReload'
import { preloadToolPanel } from './components/CommandDrawer/CommandDrawer'
import './App.css'
import './styles/drawerSurfaces.css'

const EditorPanel = lazyNamedWithReload('editor-panel', () => import('./panels/Editor/Editor'), (module) => module.EditorPanel)
const TerminalPanel = lazyNamedWithReload('terminal-panel', () => import('./panels/Terminal/Terminal'), (module) => module.TerminalPanel)
const RightPanel = lazyNamedWithReload('right-panel', () => import('./panels/RightPanel/RightPanel'), (module) => module.RightPanel)
const AgentGrid = lazyNamedWithReload('agent-grid', () => import('./panels/Terminal/AgentGrid'), (module) => module.AgentGrid)

function PanelSkeleton({ className }: { className: string }) {
  return <Skeleton className={className} />
}

function App() {
  const smokeMode = useMemo(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('smoke') === '1'
  }, [])
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const projects = useUIStore((s) => s.projects)
  const wizardOpen = useOnboardingStore((s) => s.wizardOpen)
  const showResumeBanner = useOnboardingStore((s) => s.showResumeBanner)
  const tourActive = useOnboardingStore((s) => s.tourActive)
  const showTourOffer = useOnboardingStore((s) => s.showTourOffer)
  const centerMode = useUIStore((s) => s.centerMode)
  const drawerOpen = useWorkflowShellStore((s) => s.drawerOpen)
  const launchWizardOpen = useWorkflowShellStore((s) => s.launchWizardOpen)
  const [showExplorer, setShowExplorer] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showAgentLauncher, setShowAgentLauncher] = useState(false)
  const [crashWarningCount, setCrashWarningCount] = useState<number | null>(null)
  const [appReady, setAppReady] = useState(false)
  const [bootStatus, setBootStatus] = useState('initializing workspace...')

  const [showTerminal, setShowTerminal] = useState(true)
  const { tier, isCompact, isTablet, isSmall } = useShellLayout()

  const { loadProjects, addProject, removeProject } = useProjects()
  const { paletteMode, setPaletteMode, paletteFiles, handleFileSelect, closePalette } = useCommandPalette()
  const isToolVisible = useWorkspaceProfileStore((s) => s.isToolVisible)
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
  const canShowTerminal = showTerminal && (Boolean(activeProjectId) || projects.length > 0)

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
  const isEditorCollapsed = centerHeight > 0 && canShowTerminal && !drawerOpen && centerMode === 'canvas'
    && terminalHeight >= centerHeight - 34

  useEffect(() => {
    if (smokeMode) console.log('[smoke-renderer] app:mount')
    const guard = { cancelled: false }
    setAppReady(false)
    setBootStatus('initializing workspace...')

    const bootSequence = async () => {
      const minimumDisplay = new Promise((resolve) => setTimeout(resolve, 700))
      setBootStatus('loading workspace data...')
      const startupTasks: Array<[string, Promise<unknown>]> = [
        ['loading projects...', loadProjects(guard)],
        ['loading plugins...', usePluginStore.getState().load()],
        ['loading workspace profile...', useWorkspaceProfileStore.getState().load()],
        ['restoring layout...', useUIStore.getState().loadPinnedState()],
        ['loading onboarding...', useOnboardingStore.getState().loadProgress()],
        ['loading activity...', useNotificationsStore.getState().loadActivity()],
        ['loading wallet data...', import('./store/walletData').then(({ useWalletDataStore }) => useWalletDataStore.getState().fetch())],
      ]

      const tasksPromise = Promise.allSettled(startupTasks.map(([, task]) => task))
      const [results] = await Promise.all([tasksPromise, minimumDisplay])

      if (guard.cancelled) return
      if (smokeMode) {
        const rejected = results.filter((result) => result.status === 'rejected').length
        console.log('[smoke-renderer] app:boot-tasks-settled', JSON.stringify({ rejected }))
      }
      setBootStatus('ready')
      setAppReady(true)
      window.postMessage({ payload: 'removeLoading' }, '*')
    }

    void bootSequence()

    // Debug: expose store for CDP testing
    if (import.meta.env.DEV) {
      ;(window as any).__uiStore = useUIStore
    }
    return () => {
      guard.cancelled = true
    }
  }, [loadProjects, smokeMode])

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

  const previousTierRef = useRef(tier)
  useEffect(() => {
    const previousTier = previousTierRef.current
    previousTierRef.current = tier

    if (previousTier === tier) return

    if (tier === 'tablet') {
      setShowRightPanel(false)
      return
    }

    if (tier === 'small') {
      setShowRightPanel(false)
      setShowExplorer(false)
    }
  }, [tier])

  // Renderer crash capture — forward errors to main process via IPC
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      daemon.settings.reportCrash({
        type: 'renderer_error',
        message: event.message,
        stack: event.error?.stack ?? '',
      }).catch(() => {})
    }
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason)
      const stack = event.reason instanceof Error ? event.reason.stack ?? '' : ''
      daemon.settings.reportCrash({
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
    return daemon.settings.onCrashWarning((count) => {
      if (count >= CRASH_BANNER_THRESHOLD) {
        setCrashWarningCount(count)
      }
    })
  }, [])

  useEffect(() => {
    return daemon.settings.onUiRecoveryApplied((result) => {
      const cleared = result.clearedKeys.length
      const sessionSuffix = result.clearedActiveSessions > 0
        ? ` and ${result.clearedActiveSessions} stale session${result.clearedActiveSessions === 1 ? '' : 's'}`
        : ''
      useNotificationsStore.getState().pushToast({
        kind: 'warning',
        context: 'Workspace recovery',
        ttlMs: 9000,
        message: `DAEMON reset ${cleared} unstable UI setting${cleared === 1 ? '' : 's'}${sessionSuffix} so the workspace could boot cleanly.`,
      })
    })
  }, [])

  useEffect(() => {
    if (!smokeMode) return
    console.log('[smoke-renderer] app:state', JSON.stringify({
      appReady,
      activeProjectId,
      centerMode,
      drawerOpen,
      launchWizardOpen,
      tier,
      showExplorer,
      showRightPanel,
      showTerminal,
    }))
  }, [activeProjectId, appReady, centerMode, drawerOpen, launchWizardOpen, showExplorer, showRightPanel, showTerminal, smokeMode, tier])

  useEffect(() => {
    if (smokeMode) console.log('[smoke-renderer] app:layout-mounted')
  }, [smokeMode])

  useEffect(() => {
    void useWalletStore.getState().refresh(activeProjectId)
  }, [activeProjectId])

  useEffect(() => {
    if (!appReady) return
    const pinnedTools = useUIStore.getState().pinnedTools
    const likelyNext = ['wallet', 'git', 'project-readiness']
    const warmSet = [...new Set([...pinnedTools, ...likelyNext])]
      .filter((toolId) => toolId !== 'browser')
      .slice(0, 6)

    let cancelled = false
    const warmPanels = () => {
      if (cancelled) return
      warmSet.forEach((toolId) => preloadToolPanel(toolId))
    }

    const idleCallback = (window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }).requestIdleCallback

    if (typeof idleCallback === 'function') {
      const idleId = idleCallback(warmPanels, { timeout: 1500 })
      return () => {
        cancelled = true
        window.cancelIdleCallback?.(idleId)
      }
    }

    const timeoutId = window.setTimeout(warmPanels, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [appReady])

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
        returnToEditor: () => {
          const ui = useUIStore.getState()
          ui.setCenterMode('canvas')
          ui.setBrowserTabActive(false)
          ui.setDashboardTabActive(false)
          ui.setActiveWorkspaceTool(null)
          useWorkflowShellStore.getState().closeDrawer()
        },
        openWorkspaceTool: (tool) => useUIStore.getState().openWorkspaceTool(tool),
        closeDrawer: () => useWorkflowShellStore.getState().closeDrawer(),
        toggleBrowserTab: () => useUIStore.getState().toggleBrowserTab(),
        toggleDashboardTab: () => useUIStore.getState().toggleDashboardTab(),
        isToolVisible,
      }),
    [isToolVisible],
  )

  return (
    <div className={`app app--${tier}`}>
      <a href="#editor-area" className="skip-link">Skip to editor</a>
      <a href="#terminal-area" className="skip-link">Skip to terminal</a>
      <BootLoader ready={appReady} status={bootStatus} />
      {crashWarningCount !== null && (
        <div className="crash-warning-banner">
          <span>DAEMON recovered from {crashWarningCount} errors in the last hour.</span>
          <button
            className="crash-warning-link"
            onClick={() => { useUIStore.getState().openWorkspaceTool('settings'); setCrashWarningCount(null) }}
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

      <div className={`main-layout main-layout--${tier}`}>
        <IconSidebar
          showExplorer={showExplorer}
          onToggleExplorer={() => setShowExplorer(!showExplorer)}
          onOpenAgentLauncher={() => setShowAgentLauncher(true)}
          isAgentLauncherOpen={showAgentLauncher}
        />

        {showExplorer && activeProjectPath && !isSmall && (
          <div className="left-panel" data-tour="file-explorer">
            <FileExplorer />
          </div>
        )}

        <div
          className={`center-area${isCompact ? ' center-area--compact' : ''}${isTablet ? ' center-area--tablet' : ''}${isSmall ? ' center-area--small' : ''}`}
          style={{ position: 'relative' }}
          ref={centerRef}
        >
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
          {centerMode === 'canvas' && canShowTerminal && !drawerOpen && <div className="splitter" {...splitterProps} />}
          {centerMode === 'canvas' && (
            <div
              id="terminal-area"
              className="terminal-area"
              data-tour="terminal"
              style={{
                height: isEditorCollapsed ? undefined : terminalHeight,
                flex: isEditorCollapsed ? 1 : undefined,
                display: (!canShowTerminal || drawerOpen) ? 'none' : undefined,
              }}
            >
              <Suspense fallback={<PanelSkeleton className="terminal-panel" />}>
                <TerminalPanel />
              </Suspense>
            </div>
          )}
          <CommandDrawer />
        </div>

        {shouldShowRightPanel && !isTablet && !isSmall && (
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

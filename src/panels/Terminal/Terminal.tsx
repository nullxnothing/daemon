import { lazy, Suspense, useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useNotificationsStore } from '../../store/notifications'
import { TerminalInstance } from './TerminalInstance'
import { TerminalLauncher } from './TerminalLauncher'
import { TerminalViewTabs, type TerminalView } from './TerminalViewTabs'
import { TerminalSessions } from './TerminalSessions'
import { TerminalProblems, useDiagnostics } from './TerminalProblems'
import { readTerminalLaunchRecents, addToRecents, type TerminalLaunchRecent } from './RecentsManager'
import './Terminal.css'

const PortsPanel = lazy(() => import('../PortsPanel/PortsPanel').then((m) => ({ default: m.PortsPanel })))

const SOLANA_AGENT_DB_ID = 'solana-agent'
const IS_SMOKE_TEST = new URLSearchParams(window.location.search).get('smoke') === '1'

type SplitLayout = {
  direction: 'horizontal' | 'vertical'
  secondaryId: string
}

export function TerminalPanel({ onCollapse }: { onCollapse?: () => void } = {}) {
  const [activeView, setActiveView] = useState<TerminalView>('terminal')
  const { files: diagnosticFiles, total: problemCount } = useDiagnostics()
  const terminals = useUIStore((s) => s.terminals)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const removeTerminal = useUIStore((s) => s.removeTerminal)
  const setActiveTerminal = useUIStore((s) => s.setActiveTerminal)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const setDrawerTool = useWorkflowShellStore((s) => s.setDrawerTool)
  const centerMode = useUIStore((s) => s.centerMode)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const projects = useUIStore((s) => s.projects)
  const activeTerminalId = useUIStore((s) =>
    s.activeProjectId ? s.activeTerminalIdByProject[s.activeProjectId] ?? null : null,
  )
  const visibleTerminals = useMemo(
    () => terminals.filter((tab) => tab.projectId === activeProjectId),
    [terminals, activeProjectId],
  )
  const [splitLayoutsByProject, setSplitLayoutsByProject] = useState<Record<string, SplitLayout | undefined>>({})
  const [launchRecents, setLaunchRecents] = useState<TerminalLaunchRecent[]>(() => readTerminalLaunchRecents())
  const [isDragOver, setIsDragOver] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const panelDragDepthRef = useRef(0)
  const terminalCreateInFlightRef = useRef<Promise<string | null> | null>(null)
  const splitCreatingRef = useRef(false)
  const splitLayout = activeProjectId ? splitLayoutsByProject[activeProjectId] : undefined

  const addLaunchRecent = useCallback((recent: Omit<TerminalLaunchRecent, 'timestamp'>) => {
    setLaunchRecents((prev) => addToRecents(prev, recent))
  }, [])

  const resolveProjectContext = useCallback(() => {
    if (activeProjectId && activeProjectPath) {
      return {
        projectId: activeProjectId,
        projectPath: activeProjectPath,
        projectName: projects.find((project) => project.id === activeProjectId)?.name ?? null,
      }
    }
    if (projects.length === 0) {
      setLaunchError('Open or create a project first to start a terminal.')
      return null
    }
    const fallback = [...projects].sort((a, b) => (b.last_active ?? 0) - (a.last_active ?? 0))[0]
    if (!fallback) {
      setLaunchError('Open or create a project first to start a terminal.')
      return null
    }
    setActiveProject(fallback.id, fallback.path)
    setLaunchError(null)
    return { projectId: fallback.id, projectPath: fallback.path, projectName: fallback.name ?? null }
  }, [activeProjectId, activeProjectPath, projects, setActiveProject])

  const handleNewTerminal = useCallback(async (
    label = 'Terminal',
    startupCommand?: string,
  ) => {
    if (terminalCreateInFlightRef.current) return terminalCreateInFlightRef.current

    const projectContext = resolveProjectContext()
    if (!projectContext) return null

    const createTerminal = async () => {
      setLaunchError(null)
      const res = await window.daemon.terminal.create({ cwd: projectContext.projectPath, startupCommand })
      if (res.ok && res.data) {
        addTerminal(projectContext.projectId, res.data.id, label)
        useNotificationsStore.getState().addActivity({
          kind: 'success',
          context: 'Terminal',
          message: `Opened ${label} in ${projectContext.projectPath}`,
          projectId: projectContext.projectId,
          projectName: projectContext.projectName,
        })
        return res.data.id
      }
      useNotificationsStore.getState().addActivity({
        kind: 'error',
        context: 'Terminal',
        message: res.error ?? `Failed to open ${label}`,
        projectId: projectContext.projectId,
        projectName: projectContext.projectName,
      })
      setLaunchError(res.error ?? 'Failed to open terminal.')
      return null
    }

    const createPromise = createTerminal().finally(() => {
      if (terminalCreateInFlightRef.current === createPromise) terminalCreateInFlightRef.current = null
    })
    terminalCreateInFlightRef.current = createPromise
    return createPromise
  }, [resolveProjectContext, addTerminal])

  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    panelDragDepthRef.current = 0
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const filePath = window.daemon?.getPathForFile?.(file) || (file as File & { path?: string }).path
      if (!filePath) continue

      const folderName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'Terminal'
      const res = await window.daemon.terminal.create({ cwd: filePath, userInitiated: true })
      if (res.ok && res.data && activeProjectId) {
        addTerminal(activeProjectId, res.data.id, folderName)
      }
    }
  }, [activeProjectId, addTerminal])

  const handleStartShell = useCallback(async () => {
    await handleNewTerminal('Terminal')
  }, [handleNewTerminal])

  const handleLaunchCommand = useCallback(async (command: string, label: string) => {
    const terminalId = await handleNewTerminal(label)
    if (!terminalId) return
    window.daemon.terminal.write(terminalId, `${command}\n`)
    addLaunchRecent({ kind: 'command', key: command, command, label })
  }, [addLaunchRecent, handleNewTerminal])

  const handleStartClaudeChat = useCallback(() => {
    setLaunchError(null)
    setDrawerTool(null)
  }, [setDrawerTool])

  const handleStartSolanaAgent = useCallback(async () => {
    const projectContext = resolveProjectContext()
    if (!projectContext) return
    setLaunchError(null)
    const res = await window.daemon.terminal.spawnAgent({ agentId: SOLANA_AGENT_DB_ID, projectId: projectContext.projectId })
    if (res.ok && res.data) {
      addTerminal(projectContext.projectId, res.data.id, res.data.agentName ?? 'Solana Agent', res.data.agentId)
      return
    }
    setLaunchError(res.error ?? 'Failed to start Solana agent.')
  }, [resolveProjectContext, addTerminal])

  const handleStartSpettro = useCallback(async () => {
    const projectContext = resolveProjectContext()
    if (!projectContext) return
    setLaunchError(null)
    const res = await window.daemon.terminal.spawnProvider({
      providerId: 'spettro',
      projectId: projectContext.projectId,
      cwd: projectContext.projectPath,
    })
    if (res.ok && res.data) {
      addTerminal(projectContext.projectId, res.data.id, res.data.agentName ?? 'Spettro', res.data.agentId)
      return
    }
    setLaunchError(res.error ?? 'Failed to start Spettro.')
  }, [resolveProjectContext, addTerminal])

  const handleLaunchAgent = useCallback(async (agent: Agent) => {
    const projectContext = resolveProjectContext()
    if (!projectContext) return
    setLaunchError(null)
    const res = await window.daemon.terminal.spawnAgent({ agentId: agent.id, projectId: projectContext.projectId })
    if (res.ok && res.data) {
      addTerminal(projectContext.projectId, res.data.id, res.data.agentName ?? agent.name, res.data.agentId)
      addLaunchRecent({ kind: 'agent', key: agent.id, label: agent.name })
      return
    }
    setLaunchError(res.error ?? `Failed to start ${agent.name}.`)
  }, [resolveProjectContext, addLaunchRecent, addTerminal])

  const handleCloseTerminal = useCallback(async (id: string) => {
    if (!activeProjectId) return
    await window.daemon.terminal.kill(id)
    removeTerminal(activeProjectId, id)
    useNotificationsStore.getState().addActivity({
      kind: 'info',
      context: 'Terminal',
      message: `Closed terminal ${id}`,
      projectId: activeProjectId,
      projectName: projects.find((project) => project.id === activeProjectId)?.name ?? null,
    })
    setSplitLayoutsByProject((prev) => {
      const current = prev[activeProjectId]
      if (!current || current.secondaryId !== id) return prev
      return { ...prev, [activeProjectId]: undefined }
    })
  }, [activeProjectId, projects, removeTerminal])

  const handleSplit = useCallback(async (direction: 'horizontal' | 'vertical') => {
    if (splitCreatingRef.current) return
    const projectContext = resolveProjectContext()
    if (!projectContext) return
    const projectId = projectContext.projectId
    let currentActiveTerminalId = activeTerminalId
    if (!currentActiveTerminalId) {
      currentActiveTerminalId = await handleNewTerminal('Terminal')
      if (!currentActiveTerminalId) return
    }
    let secondaryId = splitLayoutsByProject[projectId]?.secondaryId
    const hasExistingSecondary = Boolean(secondaryId && visibleTerminals.some((tab) => tab.id === secondaryId))
    if (!hasExistingSecondary) {
      splitCreatingRef.current = true
      try {
        const res = await window.daemon.terminal.create({ cwd: projectContext.projectPath })
        if (!res.ok || !res.data) {
          setLaunchError(res.error ?? 'Failed to open split terminal.')
          return
        }
        secondaryId = res.data.id
        addTerminal(projectId, secondaryId, 'Split')
        setActiveTerminal(projectId, currentActiveTerminalId)
        useNotificationsStore.getState().addActivity({
          kind: 'success',
          context: 'Terminal',
          message: `Opened split terminal ${secondaryId}`,
          projectId,
          projectName: projectContext.projectName,
        })
      } finally {
        splitCreatingRef.current = false
      }
    }
    if (!secondaryId) return
    setLaunchError(null)
    setSplitLayoutsByProject((prev) => ({ ...prev, [projectId]: { direction, secondaryId } }))
  }, [resolveProjectContext, activeTerminalId, handleNewTerminal, splitLayoutsByProject, visibleTerminals, addTerminal, setActiveTerminal])

  const handleUnsplit = useCallback(() => {
    if (!activeProjectId) return
    setSplitLayoutsByProject((prev) => ({ ...prev, [activeProjectId]: undefined }))
  }, [activeProjectId])

  // Auto-create the first terminal as a neutral shell. Agent sessions should only
  // start from explicit user actions, not from opening the bottom terminal.
  useEffect(() => {
    if (IS_SMOKE_TEST) return
    if (!activeProjectId || visibleTerminals.length !== 0 || terminalCreateInFlightRef.current) return
    void handleNewTerminal('Terminal')
  }, [activeProjectId, visibleTerminals.length, handleNewTerminal])

  // Sync split layout when terminals change
  useEffect(() => {
    if (!activeProjectId || !activeTerminalId) return
    const split = splitLayoutsByProject[activeProjectId]
    if (!split) return
    const hasSecondary = visibleTerminals.some((tab) => tab.id === split.secondaryId)
    if (!hasSecondary) {
      const fallback = visibleTerminals.find((tab) => tab.id !== activeTerminalId)?.id
      setSplitLayoutsByProject((prev) => ({
        ...prev,
        [activeProjectId]: fallback ? { ...split, secondaryId: fallback } : undefined,
      }))
      return
    }
    if (split.secondaryId === activeTerminalId) {
      const fallback = visibleTerminals.find((tab) => tab.id !== activeTerminalId)?.id
      if (!fallback) {
        setSplitLayoutsByProject((prev) => ({ ...prev, [activeProjectId]: undefined }))
      } else {
        setSplitLayoutsByProject((prev) => ({ ...prev, [activeProjectId]: { ...split, secondaryId: fallback } }))
      }
    }
  }, [activeProjectId, activeTerminalId, splitLayoutsByProject, visibleTerminals])

  const terminalById = useMemo(() => {
    const map = new Map<string, (typeof visibleTerminals)[number]>()
    for (const terminal of visibleTerminals) map.set(terminal.id, terminal)
    return map
  }, [visibleTerminals])

  const paneIds = useMemo(() => {
    if (!activeTerminalId) return []
    if (!splitLayout) return [activeTerminalId]
    if (splitLayout.secondaryId === activeTerminalId) return [activeTerminalId]
    if (!terminalById.has(splitLayout.secondaryId)) return [activeTerminalId]
    return [activeTerminalId, splitLayout.secondaryId]
  }, [activeTerminalId, splitLayout, terminalById])

  return (
    <div
      className={`terminal-panel ${isDragOver ? 'drag-over' : ''}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        panelDragDepthRef.current += 1
        setIsDragOver(true)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        panelDragDepthRef.current = Math.max(0, panelDragDepthRef.current - 1)
        if (panelDragDepthRef.current === 0) setIsDragOver(false)
      }}
      onDrop={handleFolderDrop}
    >
      <TerminalViewTabs
        activeView={activeView}
        onSelectView={setActiveView}
        problemCount={problemCount}
        onCollapse={onCollapse}
        trailing={activeView === 'terminal' ? (
          <>
            <TerminalLauncher
              activeProjectId={activeProjectId}
              canLaunchInProject={Boolean(activeProjectId) || projects.length > 0}
              launchRecents={launchRecents}
              onStartShell={handleStartShell}
              onStartClaudeChat={handleStartClaudeChat}
              onStartSpettro={handleStartSpettro}
              onStartSolanaAgent={handleStartSolanaAgent}
              onLaunchAgent={handleLaunchAgent}
              onLaunchCommand={handleLaunchCommand}
            />
            <button type="button" className="terminal-view-action" onClick={() => void handleSplit('vertical')} title="Split vertical" aria-label="Split vertical">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            </button>
            <button type="button" className="terminal-view-action" onClick={() => void handleSplit('horizontal')} title="Split horizontal" aria-label="Split horizontal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
            </button>
            {splitLayout && (
              <button type="button" className="terminal-view-action" onClick={handleUnsplit} title="Unsplit" aria-label="Unsplit terminal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </>
        ) : undefined}
      />

      {activeView === 'terminal' && (
        <>
          <div className="terminal-body">
            <div className="terminal-views">
              {visibleTerminals.length === 0 ? (
                <div
                  className="terminal-empty-state"
                  role="button"
                  tabIndex={0}
                  onClick={handleStartShell}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleStartShell() } }}
                >
                  <span className="terminal-empty-icon">&gt;_</span>
                  <span className="terminal-empty-label">Click to start a terminal</span>
                  <span className="terminal-empty-hint">or press Ctrl+`</span>
                  {launchError && <span className="terminal-empty-error">{launchError}</span>}
                </div>
              ) : paneIds.length <= 1 ? (
                /* Render ALL terminal instances to avoid unmount/remount on tab switch.
                   Only the active one is visible — the rest are hidden via isVisible=false.
                   This prevents xterm's Viewport.syncScrollArea "dimensions" crash that
                   occurs when the terminal is disposed while internal observers are pending. */
                visibleTerminals.map((tab) => (
                  <TerminalInstance key={tab.id} id={tab.id} isVisible={tab.id === activeTerminalId} />
                ))
              ) : (
                <div className={`terminal-split ${splitLayout?.direction ?? 'vertical'}`}>
                  {paneIds.map((id) => (
                    <div key={id} className="terminal-pane">
                      <div className="terminal-pane-header">
                        <button
                          className={`terminal-pane-title ${activeTerminalId === id ? 'active' : ''}`}
                          onClick={() => activeProjectId && setActiveTerminal(activeProjectId, id)}
                        >
                          {terminalById.get(id)?.label ?? 'Terminal'}
                        </button>
                        {splitLayout?.secondaryId === id && (
                          <button type="button" className="terminal-pane-close" onClick={() => handleUnsplit()} title="Close split pane">&times;</button>
                        )}
                      </div>
                      <div className="terminal-pane-body">
                        <TerminalInstance id={id} isVisible />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {visibleTerminals.length > 0 && (
              <TerminalSessions
                sessions={visibleTerminals}
                activeSessionId={activeTerminalId}
                onSelect={(id) => activeProjectId && setActiveTerminal(activeProjectId, id)}
                onClose={handleCloseTerminal}
              />
            )}
          </div>
        </>
      )}

      {activeView === 'problems' && (
        <div className="terminal-altview">
          <TerminalProblems files={diagnosticFiles} />
        </div>
      )}

      {activeView === 'output' && (
        <div className="terminal-altview">
          <div className="terminal-pane-empty">Output streams from running tasks will appear here.</div>
        </div>
      )}

      {activeView === 'ports' && (
        <div className="terminal-altview">
          <Suspense fallback={<div className="terminal-pane-empty">Loading ports…</div>}>
            <PortsPanel />
          </Suspense>
        </div>
      )}
    </div>
  )
}

export default TerminalPanel

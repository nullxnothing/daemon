import { useRef, useState, useCallback, useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useAppActions } from '../../store/appActions'
import daemonLogo from '../../assets/daemon-mark.svg'

interface EditorWelcomeProps {
  activeProjectId: string | null
}

const QUICK_TEMPLATES = [
  { id: 'anchor-program', name: 'Anchor Program', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', color: '#60a5fa' },
  { id: 'trading-bot', name: 'Trading Bot', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: '#f0b429' },
  { id: 'dapp-nextjs', name: 'dApp', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9', color: '#c084fc' },
]

export function EditorWelcome({ activeProjectId }: EditorWelcomeProps) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const projects = useUIStore((s) => s.projects)
  const terminals = useUIStore((s) => s.terminals)
  const [isEmptyDragOver, setIsEmptyDragOver] = useState(false)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const emptyDragDepthRef = useRef(0)

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const terminalCount = terminals.filter((t) => t.projectId === activeProjectId).length

  // Load git branch for context
  useEffect(() => {
    if (!activeProjectPath) { setGitBranch(null); return }
    window.daemon.git.branch(activeProjectPath).then((res) => {
      setGitBranch(res.ok ? res.data as string : null)
    })
  }, [activeProjectPath])

  const handleEmptyDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    emptyDragDepthRef.current = 0
    setIsEmptyDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const filePath = (file as File & { path?: string }).path
      if (!filePath) continue

      const folderName = filePath.replace(/\\/g, '/').split('/').pop() ?? 'Terminal'
      const res = await window.daemon.terminal.create({ cwd: filePath, userInitiated: true })
      if (res.ok && res.data && activeProjectId) {
        addTerminal(activeProjectId, res.data.id, folderName)
      }
    }
  }, [activeProjectId, addTerminal])

  const handleOpenFileExplorer = useCallback(() => {
    useAppActions.getState().openFilePalette()
  }, [])

  const handleLaunchAgent = useCallback(() => {
    useAppActions.getState().openAgentLauncher()
  }, [])

  const handleNewProject = useCallback(() => {
    useUIStore.getState().openWorkspaceTool('starter')
  }, [])

  const handleOpenTerminal = useCallback(() => {
    useAppActions.getState().focusTerminal()
  }, [])

  return (
    <div
      className={`editor-empty ${isEmptyDragOver ? 'drag-over' : ''}`}
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        emptyDragDepthRef.current += 1
        setIsEmptyDragOver(true)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        emptyDragDepthRef.current = Math.max(0, emptyDragDepthRef.current - 1)
        if (emptyDragDepthRef.current === 0) setIsEmptyDragOver(false)
      }}
      onDrop={handleEmptyDrop}
    >
      <div className="editor-empty-glow" />
      <img src={daemonLogo} alt="" className="editor-empty-logo" draggable={false} />
      <span className="editor-empty-title">DAEMON</span>

      {isEmptyDragOver ? (
        <span className="editor-empty-drop-hint">Drop folder to open terminal</span>
      ) : activeProjectId ? (
        <>
          {/* Dynamic project context */}
          <span className="editor-empty-tagline">
            {activeProject?.name ?? 'Project'}
            {gitBranch && <span className="editor-empty-branch"> ({gitBranch})</span>}
          </span>

          <div className="editor-empty-actions">
            <button className="editor-empty-btn" onClick={handleOpenFileExplorer}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
              Open File
            </button>
            <button className="editor-empty-btn editor-empty-btn--primary" onClick={handleLaunchAgent}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Launch Agent
            </button>
            {terminalCount > 0 ? (
              <button className="editor-empty-btn" onClick={handleOpenTerminal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
                {terminalCount} Terminal{terminalCount !== 1 ? 's' : ''}
              </button>
            ) : (
              <button className="editor-empty-btn" onClick={() => useUIStore.getState().openWorkspaceTool('settings')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Settings
              </button>
            )}
          </div>

          <div className="editor-empty-starter">
            <span className="editor-empty-starter-label">Start building</span>
            <div className="editor-empty-templates">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className="editor-empty-template"
                  style={{ '--tmpl-color': t.color, '--tmpl-glow': `${t.color}15` } as React.CSSProperties}
                  onClick={handleNewProject}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={t.color}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={t.icon} />
                  </svg>
                  {t.name}
                </button>
              ))}
              <button className="editor-empty-template editor-empty-template--more" onClick={handleNewProject}>
                More...
              </button>
            </div>
          </div>
        </>
      ) : (
        <span className="editor-empty-tagline">Select a project to begin</span>
      )}
    </div>
  )
}

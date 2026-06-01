import { useRef, useState, useCallback, useEffect } from 'react'
import { useUIStore } from '../../store/ui'
import { useAppActions } from '../../store/appActions'
import { Button } from '../../components/Button'
import { DaemonMark } from '../../components/DaemonMark'
import { Surface } from '../../components/Panel/Surface'
import { EDITOR_WELCOME_TEMPLATE_COLORS } from '../../styles/daemonTheme'

interface EditorWelcomeProps {
  activeProjectId: string | null
}

const QUICK_TEMPLATES = [
  { id: 'anchor-program', name: 'Anchor Program', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', color: EDITOR_WELCOME_TEMPLATE_COLORS.blue },
  { id: 'trading-bot', name: 'Trading Bot', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: EDITOR_WELCOME_TEMPLATE_COLORS.amber },
  { id: 'dapp-nextjs', name: 'dApp', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9', color: EDITOR_WELCOME_TEMPLATE_COLORS.violet },
  { id: 'meme-coin-website', name: 'Meme Website', icon: 'M12 2l2.4 6.2L21 9l-5 4.1L17.5 20 12 16.4 6.5 20 8 13.1 3 9l6.6-.8L12 2z', color: EDITOR_WELCOME_TEMPLATE_COLORS.pink },
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
      const filePath = window.daemon?.getPathForFile?.(file) || (file as File & { path?: string }).path
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

  const handleOpenProject = useCallback(async () => {
    const pathRes = await window.daemon.projects.openDialog()
    if (!pathRes.ok || !pathRes.data) return

    const folderPath = pathRes.data
    const name = folderPath.split(/[/\\]/).pop() ?? 'untitled'
    const existingProject = useUIStore.getState().projects.find((project) => project.path === folderPath)
    if (existingProject) {
      useUIStore.getState().setActiveProject(existingProject.id, existingProject.path)
      return
    }

    const res = await window.daemon.projects.create({ name, path: folderPath })
    if (res.ok && res.data) {
      const currentProjects = useUIStore.getState().projects
      useUIStore.getState().setProjects([res.data, ...currentProjects])
      useUIStore.getState().setActiveProject(res.data.id, res.data.path)
    }
  }, [])

  const handleOpenAgentStation = useCallback(() => {
    useUIStore.getState().openWorkspaceTool('agent-station')
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
      <DaemonMark className="editor-empty-logo" />
      <span className="editor-empty-eyebrow">Operator workbench</span>
      <h1 className="editor-empty-title">DAEMON</h1>

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
            <Button className="editor-empty-btn" variant="secondary" size="lg" onClick={handleOpenFileExplorer}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                <polyline points="13 2 13 9 20 9"/>
              </svg>
              Open File
            </Button>
            <Button className="editor-empty-btn" variant="primary" size="lg" onClick={handleLaunchAgent}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="8" x2="12" y2="16"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Launch Agent
            </Button>
            {terminalCount > 0 ? (
              <Button className="editor-empty-btn" variant="secondary" size="lg" onClick={handleOpenTerminal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
                </svg>
                {terminalCount} Terminal{terminalCount !== 1 ? 's' : ''}
              </Button>
            ) : (
              <Button className="editor-empty-btn" variant="secondary" size="lg" onClick={() => useUIStore.getState().openWorkspaceTool('settings')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                Settings
              </Button>
            )}
          </div>

          <Surface variant="feature" padding="md" className="editor-empty-starter">
            <span className="editor-empty-starter-label">Start building</span>
            <div className="editor-empty-templates">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  type="button"
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
            </div>
            <Button className="editor-empty-more" variant="ghost" size="sm" onClick={handleNewProject}>
              More templates -&gt;
            </Button>
          </Surface>
        </>
      ) : (
        <>
          <span className="editor-empty-tagline">Create a project, open a folder, or start from a scaffold.</span>

          <div className="editor-empty-actions">
            <Button className="editor-empty-btn" variant="secondary" size="lg" onClick={handleOpenProject}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h6l2 3h8v13H4z" />
              </svg>
              Open Project
            </Button>
            <Button className="editor-empty-btn" variant="primary" size="lg" onClick={handleNewProject}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Project
            </Button>
            <Button className="editor-empty-btn" variant="secondary" size="lg" onClick={handleOpenAgentStation}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8h12M6 16h12M8 4h8v16H8z" />
              </svg>
              Agent Station
            </Button>
          </div>

          <Surface variant="feature" padding="md" className="editor-empty-starter">
            <span className="editor-empty-starter-label">Scaffold</span>
            <div className="editor-empty-templates">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  type="button"
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
            </div>
            <Button className="editor-empty-more" variant="ghost" size="sm" onClick={handleNewProject}>
              More templates -&gt;
            </Button>
          </Surface>
        </>
      )}
    </div>
  )
}

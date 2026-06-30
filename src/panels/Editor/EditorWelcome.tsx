import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useUIStore } from '../../store/ui'
import { useAppActions } from '../../store/appActions'
import { DaemonMark } from '../../components/DaemonMark'
import { EDITOR_WELCOME_TEMPLATE_COLORS } from '../../styles/daemonTheme'
import type { Project } from '../../../electron/shared/types'

interface EditorWelcomeProps {
  activeProjectId: string | null
}

/** A project surfaced in the RECENT PROJECTS list on the default canvas. */
interface RecentProject {
  id: string
  name: string
  path: string
  /** Current git branch (cached server-side, refreshed by projects:list). */
  branch: string | null
  /** Epoch ms of last activity; drives ordering and the "last opened" label. */
  lastActive: number | null
  pinned: boolean
}

/** Abbreviate an absolute path with ~ and forward slashes for display. */
function formatHomePath(path: string | null): string {
  if (!path) return ''
  const normalized = path.replace(/\\/g, '/')
  return normalized.replace(/^([A-Za-z]:)?\/Users\/[^/]+/, '~')
}

/** Compact relative "last opened" label (e.g. "3d", "2h", "just now"). */
function formatLastOpened(epochMs: number | null): string {
  if (!epochMs) return ''
  const diff = Date.now() - epochMs
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  return `${Math.floor(days / 30)}mo`
}

const RECENTS_LIMIT = 5

const QUICK_TEMPLATES = [
  { id: 'anchor-program', name: 'Anchor program', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', color: EDITOR_WELCOME_TEMPLATE_COLORS.blue },
  { id: 'trading-bot', name: 'Trading bot', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', color: EDITOR_WELCOME_TEMPLATE_COLORS.amber },
  { id: 'dapp-nextjs', name: 'dApp', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9', color: EDITOR_WELCOME_TEMPLATE_COLORS.violet },
  { id: 'meme-coin-website', name: 'Meme site', icon: 'M12 2l2.4 6.2L21 9l-5 4.1L17.5 20 12 16.4 6.5 20 8 13.1 3 9l6.6-.8L12 2z', color: EDITOR_WELCOME_TEMPLATE_COLORS.pink },
]

export function EditorWelcome({ activeProjectId }: EditorWelcomeProps) {
  const addTerminal = useUIStore((s) => s.addTerminal)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
  const projects = useUIStore((s) => s.projects)
  const [isEmptyDragOver, setIsEmptyDragOver] = useState(false)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const emptyDragDepthRef = useRef(0)

  const activeProject = projects.find((p) => p.id === activeProjectId)
  const displayPath = activeProjectPath ? formatHomePath(activeProjectPath) : activeProject?.name ?? 'Project'

  // Load git branch for context
  useEffect(() => {
    if (!activeProjectPath) { setGitBranch(null); return }
    window.daemon.git.branch(activeProjectPath).then((res) => {
      setGitBranch(res.ok ? res.data as string : null)
    })
  }, [activeProjectPath])

  const toRecent = useCallback((p: Project): RecentProject => ({
    id: p.id,
    name: p.name,
    path: p.path,
    branch: p.branch,
    lastActive: p.last_active ?? p.created_at,
    pinned: p.pinned === 1,
  }), [])

  // Recents: pinned first (sticky), then most-recently-active, truncated for the canvas.
  const recents = useMemo<RecentProject[]>(() => {
    const sorted = [...projects].sort((a, b) => {
      if ((a.pinned === 1) !== (b.pinned === 1)) return a.pinned === 1 ? -1 : 1
      return (b.last_active ?? b.created_at) - (a.last_active ?? a.created_at)
    })
    return sorted.slice(0, RECENTS_LIMIT).map(toRecent)
  }, [projects, toRecent])

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

  const handleCloneRepo = useCallback(() => {
    useUIStore.getState().openWorkspaceTool('starter')
  }, [])

  const handleOpenRecent = useCallback((project: RecentProject) => {
    useUIStore.getState().setActiveProject(project.id, project.path)
  }, [])

  const handleViewAll = useCallback(() => {
    useUIStore.getState().openWorkspaceTool('starter')
  }, [])

  const handleTogglePin = useCallback(async (id: string, pinned: boolean) => {
    const res = await window.daemon.projects.setPinned({ id, pinned })
    if (!res.ok || !res.data) return
    const updated = res.data
    useUIStore.getState().setProjects(
      useUIStore.getState().projects.map((p) => (p.id === id ? updated : p))
    )
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

      <span className="editor-empty-tagline">
        {activeProjectId ? displayPath : 'No workspace'}
        {activeProjectId && gitBranch && <span className="editor-empty-branch"> ({gitBranch})</span>}
        <span className="editor-empty-tagline-sep"> · </span>
        <span className="editor-empty-tagline-muted">no file open</span>
      </span>

      {isEmptyDragOver ? (
        <span className="editor-empty-drop-hint">Drop folder to open terminal</span>
      ) : (
        <>
          {/* Fused 3-up action row: shared border, hairline gaps. */}
          <div className="editor-empty-actionrow" role="group" aria-label="Workspace actions">
            <button type="button" className="editor-empty-action" onClick={handleOpenProject}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h6l2 3h8v13H4z" />
              </svg>
              <span className="editor-empty-action-label">Open folder</span>
              <kbd className="editor-empty-action-kbd">⌘O</kbd>
            </button>
            <button type="button" className="editor-empty-action editor-empty-action--primary" onClick={handleLaunchAgent}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span className="editor-empty-action-label">Launch agent</span>
            </button>
            <button type="button" className="editor-empty-action" onClick={handleCloneRepo}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3v12" /><circle cx="6" cy="18" r="3" /><circle cx="6" cy="3" r="0.5" />
                <circle cx="18" cy="6" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              <span className="editor-empty-action-label">Clone repo</span>
            </button>
          </div>

          {/* RECENT PROJECTS — the anchor of the canvas. */}
          {recents.length > 0 && (
            <section className="editor-empty-recents" aria-label="Recent projects">
              <div className="editor-empty-recents-head">
                <span className="editor-empty-recents-label">Recent projects</span>
                <button type="button" className="editor-empty-recents-viewall" onClick={handleViewAll}>
                  View all ({projects.length}) <span aria-hidden="true">→</span>
                </button>
              </div>
              <ul className="editor-empty-recents-list">
                {recents.map((project) => {
                  const isPinned = project.pinned
                  return (
                    <li key={project.id} className={`editor-empty-recent-row ${isPinned ? 'is-pinned' : ''}`}>
                      <button
                        type="button"
                        className="editor-empty-recent-open"
                        onClick={() => handleOpenRecent(project)}
                      >
                        <svg className="editor-empty-recent-folder" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h6l2 3h8v13H4z" />
                        </svg>
                        <span className="editor-empty-recent-name">{project.name}</span>
                        {project.branch && (
                          <span className="editor-empty-recent-branch" title={project.branch}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" />
                              <path d="M6 9v6M18 9a9 9 0 0 1-9 9" />
                            </svg>
                            <span className="editor-empty-recent-branch-name">{project.branch}</span>
                          </span>
                        )}
                        <span className="editor-empty-recent-spacer" />
                        <span className="editor-empty-recent-path">{formatHomePath(project.path)}</span>
                        <span className="editor-empty-recent-time">{formatLastOpened(project.lastActive)}</span>
                      </button>
                      <button
                        type="button"
                        className="editor-empty-recent-pin"
                        aria-label={isPinned ? `Unpin ${project.name}` : `Pin ${project.name}`}
                        aria-pressed={isPinned}
                        onClick={() => handleTogglePin(project.id, !isPinned)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 17v5M9 10.76V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v5.76l2 3.24H7z" />
                        </svg>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* START BUILDING — demoted scaffold strip. */}
          <div className="editor-empty-start">
            <div className="editor-empty-start-head">
              <span className="editor-empty-starter-label">Start building</span>
              <button type="button" className="editor-empty-start-more" onClick={handleNewProject}>
                More templates <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="editor-empty-start-chips">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className="editor-empty-chip"
                  style={{ '--tmpl-color': t.color, '--tmpl-glow': `${t.color}15` } as React.CSSProperties}
                  onClick={handleNewProject}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={t.icon} />
                  </svg>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="editor-empty-hints">
            <button type="button" className="editor-empty-hint" onClick={() => useAppActions.getState().openFilePalette()}>
              <kbd>⌘K</kbd> Commands
            </button>
            <button type="button" className="editor-empty-hint" onClick={handleOpenFileExplorer}>
              <kbd>⌘P</kbd> Go to file
            </button>
            <button type="button" className="editor-empty-hint" onClick={handleOpenTerminal}>
              <kbd>⌘J</kbd> Terminal
            </button>
          </div>
        </>
      )}
    </div>
  )
}

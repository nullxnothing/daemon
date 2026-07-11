import { useEffect, useState } from 'react'
import { LiteChat } from '../LiteChat'
import { LiteExplorer } from './LiteExplorer'
import { LiteEditor } from './LiteEditor'
import { LiteTerminal } from './LiteTerminal'
import { LiteWorkflowRail } from './LiteWorkflowRail'
import { useLiteWorkbenchStore } from './liteWorkbenchStore'
import { useAriaStore } from '../../store/aria'
import styles from './LiteWorkbench.module.css'
import { MemeTechStudio } from '../studio/MemeTechStudio'

type WorkbenchSurface = 'code' | 'terminal' | 'studio'
interface LiteWorkbenchProps {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  conversationResetKey?: number
}

export function LiteWorkbench({ draft, onDraftChange, onSend, conversationResetKey = 0 }: LiteWorkbenchProps) {
  const projects = useLiteWorkbenchStore((state) => state.projects)
  const activeProject = useLiteWorkbenchStore((state) => state.activeProject)
  const setProjects = useLiteWorkbenchStore((state) => state.setProjects)
  const setActiveProject = useLiteWorkbenchStore((state) => state.setActiveProject)
  const [projectError, setProjectError] = useState<string | null>(null)
  const turns = useAriaStore((state) => state.turns)
  const [surface, setSurface] = useState<WorkbenchSurface | null>(null)

  const loadProjects = async () => {
    const response = await window.daemon.projects.list()
    if (!response.ok || !response.data) {
      setProjectError(response.error ?? 'Could not load projects.')
      return
    }
    setProjects(response.data)
    if (!useLiteWorkbenchStore.getState().activeProject && response.data[0]) await activateProject(response.data[0])
  }

  useEffect(() => { void loadProjects() }, [])
  useEffect(() => { setSurface(null) }, [conversationResetKey])

  const activateProject = async (project: typeof activeProject) => {
    if (!project || project.id === useLiteWorkbenchStore.getState().activeProject?.id) return
    const state = useLiteWorkbenchStore.getState()
    const dirtyFiles = state.openFiles.filter((file) => file.content !== file.savedContent)
    if (dirtyFiles.length && !window.confirm(`Discard unsaved changes in ${dirtyFiles.length} file(s) and switch projects?`)) return
    await Promise.all(state.terminalIds.map((id) => window.daemon.terminal.kill(id)))
    setActiveProject(project)
    await useAriaStore.getState().initSessions()
  }

  const openProject = async () => {
    const pathResponse = await window.daemon.projects.openDialog()
    if (!pathResponse.ok || !pathResponse.data) return
    const projectPath = pathResponse.data
    const existing = projects.find((project) => project.path.toLowerCase() === projectPath.toLowerCase())
    if (existing) {
      await activateProject(existing)
      return
    }
    const name = projectPath.split(/[\\/]/).at(-1) ?? 'Solana project'
    const response = await window.daemon.projects.create({ name, path: projectPath })
    if (!response.ok || !response.data) {
      setProjectError(response.error ?? 'Could not import this folder.')
      return
    }
    setProjects([response.data, ...projects])
    await activateProject(response.data)
  }

  return (
    <div className={styles.workbench}>
      <div className={styles.topbar}>
        <button type="button" className={styles.projectButton} onClick={() => void openProject()}>
          <span className={styles.projectDot} aria-hidden="true" />
          {activeProject?.name ?? 'Open project'}
        </button>
        <nav className={styles.surfaceTabs} aria-label="Open work surface">
          {surface ? <button type="button" className={styles.backToChat} onClick={() => setSurface(null)}>Chat</button> : null}
          {(['code', 'terminal', 'studio'] as const).map((view) => (
            <button key={view} type="button" aria-pressed={surface === view} onClick={() => setSurface(surface === view ? null : view)}>
              {view === 'studio' ? 'Meme Tech' : view[0].toUpperCase() + view.slice(1)}
            </button>
          ))}
        </nav>
        <span className={styles.localState}><span aria-hidden="true" />Local only</span>
      </div>
      {projectError ? <div className={styles.projectError} role="alert">{projectError}</div> : null}
      <div className={`${styles.workArea}${surface ? ` ${styles.hasWork}` : ''}`}>
        <section className={styles.agentSurface} aria-label="DAEMON conversation">
          {turns.length === 0 ? <div className={styles.agentWelcome}>
            <h1>What are we building?</h1>
            <p>{activeProject ? `${activeProject.name} is in context. Paste an error or describe the next change.` : 'Open a project or start with an idea.'}</p>
            <div className={styles.suggestions}>
              <button type="button" onClick={() => onDraftChange('Understand this project and identify the highest-risk gaps.')}>Understand this project</button>
              <button type="button" onClick={() => onDraftChange('Help me debug the current build or test failure.')}>Debug a failure</button>
            </div>
          </div> : null}
          <LiteChat draft={draft} onDraftChange={onDraftChange} onSend={onSend} />
        </section>
        <section className={`${styles.codeSurface}${surface === 'code' ? '' : ` ${styles.surfaceHidden}`}`} aria-label="Code workspace" aria-hidden={surface !== 'code'}>
          <LiteExplorer project={activeProject} onOpenProject={() => void openProject()} />
          <LiteEditor />
        </section>
        <section className={`${styles.terminalSurface}${surface === 'terminal' ? '' : ` ${styles.surfaceHidden}`}`} aria-label="Terminal workspace" aria-hidden={surface !== 'terminal'}>
          <LiteTerminal isVisible={surface === 'terminal'} />
          <LiteWorkflowRail />
        </section>
        <section className={`${styles.studioSurface}${surface === 'studio' ? '' : ` ${styles.surfaceHidden}`}`} aria-label="Meme Tech workspace" aria-hidden={surface !== 'studio'}>
          <MemeTechStudio project={activeProject} />
        </section>
      </div>
    </div>
  )
}

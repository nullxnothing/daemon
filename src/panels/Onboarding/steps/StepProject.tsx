import { useState } from 'react'
import { useOnboardingStore } from '../../../store/onboarding'
import { useUIStore } from '../../../store/ui'
import { markFunnelStep } from '../../../lib/firstMission'

export function StepProject() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)
  const [scaffolding, setScaffolding] = useState(false)
  const [scaffoldError, setScaffoldError] = useState('')

  const complete = (openTool: boolean) => {
    if (openTool) openWorkspaceTool('starter')
    setStepStatus('project', 'complete')
    markFunnelStep('project_ready')
    advanceStep()
  }

  // One click: scaffold ~/daemon-first-mission (three files, git init) and make
  // it the active project so the mission's read tools always have something real.
  const handleDemoWorkspace = async () => {
    if (scaffolding) return
    setScaffolding(true)
    setScaffoldError('')
    const res = await window.daemon.projects.createDemoWorkspace()
    if (!res.ok || !res.data) {
      setScaffolding(false)
      setScaffoldError(res.error ?? 'Could not create the demo workspace.')
      return
    }
    const project = res.data
    const ui = useUIStore.getState()
    if (!ui.projects.some((p) => p.id === project.id)) {
      ui.setProjects([project, ...ui.projects])
    }
    ui.setActiveProject(project.id, project.path)
    markFunnelStep('demo_workspace_created')
    setScaffolding(false)
    complete(false)
  }

  return (
    <div className="wizard-api-section">
      <div className="wizard-hint">
        The First Mission works on any project. If you do not have one handy, the demo
        workspace is three files and takes two seconds.
      </div>
      {scaffoldError && <div className="wizard-error">{scaffoldError}</div>}
      <button
        type="button"
        className="wizard-btn primary"
        data-testid="wizard-demo-workspace"
        onClick={() => void handleDemoWorkspace()}
        disabled={scaffolding}
      >
        {scaffolding ? 'Creating demo workspace...' : 'Use the demo workspace'}
      </button>
      <div className="wizard-btn-row">
        <button type="button" className="wizard-btn secondary" onClick={() => complete(true)}>
          Open Project Templates
        </button>
        <button type="button" className="wizard-btn secondary" onClick={() => complete(false)}>
          I have a repo, continue
        </button>
      </div>
    </div>
  )
}

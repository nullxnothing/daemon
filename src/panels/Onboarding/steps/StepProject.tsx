import { useOnboardingStore } from '../../../store/onboarding'
import { useUIStore } from '../../../store/ui'

export function StepProject() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)

  const complete = (openTool: boolean) => {
    if (openTool) openWorkspaceTool('starter')
    setStepStatus('project', 'complete')
    advanceStep()
  }

  return (
    <div className="wizard-api-section">
      <div className="wizard-checks">
        <div className="wizard-check">
          <span className="wizard-dot green" />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Use an already-open repo</span>
            <span className="wizard-check-desc">DAEMON inspects Anchor.toml, package scripts, IDLs, env files, and Solana indicators once a project is open.</span>
          </div>
        </div>
        <div className="wizard-check">
          <span className="wizard-dot green" />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Scaffold a Solana starter</span>
            <span className="wizard-check-desc">Use a template when you want a devnet-first project with runtime config already visible.</span>
          </div>
        </div>
      </div>
      <div className="wizard-btn-row">
        <button type="button" className="wizard-btn primary" onClick={() => complete(true)}>
          Open Project Templates
        </button>
        <button type="button" className="wizard-btn secondary" onClick={() => complete(false)}>
          Continue
        </button>
      </div>
    </div>
  )
}

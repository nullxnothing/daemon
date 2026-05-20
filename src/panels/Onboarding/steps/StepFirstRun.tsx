import { useOnboardingStore } from '../../../store/onboarding'
import { useUIStore } from '../../../store/ui'

export function StepFirstRun() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)

  const finish = (openStart: boolean) => {
    if (openStart) openWorkspaceTool('project-readiness')
    setStepStatus('firstRun', 'complete')
    advanceStep()
  }

  return (
    <div className="wizard-api-section">
      <div className="wizard-checks">
        <div className="wizard-check">
          <span className="wizard-dot green" />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Start from readiness</span>
            <span className="wizard-check-desc">Solana Start shows the next blocker across project, wallet, RPC, MCP, AI, build, and launch setup.</span>
          </div>
        </div>
        <div className="wizard-check">
          <span className="wizard-dot green" />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Use integrations after the route is clear</span>
            <span className="wizard-check-desc">Protocol tools stay available, but they should not block your first Solana workflow.</span>
          </div>
        </div>
      </div>
      <div className="wizard-btn-row">
        <button type="button" className="wizard-btn primary" onClick={() => finish(true)}>
          Open Solana Start
        </button>
        <button type="button" className="wizard-btn secondary" onClick={() => finish(false)}>
          Finish
        </button>
      </div>
    </div>
  )
}

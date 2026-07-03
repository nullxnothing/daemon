import { useOnboardingStore } from '../../../store/onboarding'
import { markFunnelStep } from '../../../lib/firstMission'

/**
 * The Approval Gate primer: a non-interactive preview of a real approval card,
 * rendered with the same classes as the console's ApprovalCard so the live one
 * is instantly recognizable two minutes later. No detours — one Continue.
 */
export function StepAiSafety() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)

  const complete = () => {
    setStepStatus('ai', 'complete')
    markFunnelStep('primer_done')
    advanceStep()
  }

  return (
    <div className="wizard-api-section">
      <div className="agent-approval write wizard-approval-preview" aria-hidden="true">
        <div className="agent-approval-head">
          <span className="agent-approval-risk write">WRITE</span>
          <span className="agent-approval-name">remember_fact</span>
        </div>
        <div className="agent-approval-summary">Save a project fact to memory</div>
        <div className="agent-approval-actions">
          <button type="button" className="agent-approval-reject" disabled tabIndex={-1}>Reject</button>
          <button type="button" className="agent-approval-approve" disabled tabIndex={-1}>Approve</button>
        </div>
      </div>

      <div className="wizard-checks">
        <div className="wizard-check">
          <span className="wizard-dot green" />
          <span className="wizard-check-label">READ runs automatically. Looking is free.</span>
        </div>
        <div className="wizard-check">
          <span className="wizard-dot amber" />
          <span className="wizard-check-label">WRITE stops and asks you. Nothing changes without a yes.</span>
        </div>
        <div className="wizard-check">
          <span className="wizard-dot red" />
          <span className="wizard-check-label">SENSITIVE makes you type the tool name. Money and keys are never one click.</span>
        </div>
      </div>

      <button type="button" className="wizard-btn primary" data-testid="wizard-primary" onClick={complete}>
        Continue
      </button>
    </div>
  )
}

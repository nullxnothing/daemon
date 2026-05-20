import { useOnboardingStore } from '../../../store/onboarding'
import { useUIStore } from '../../../store/ui'

export function StepAiSafety() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)
  const openWorkspaceTool = useUIStore((s) => s.openWorkspaceTool)

  const complete = (openAi: boolean) => {
    if (openAi) openWorkspaceTool('daemon-ai')
    setStepStatus('ai', 'complete')
    advanceStep()
  }

  return (
    <div className="wizard-api-section">
      <div className="wizard-checks">
        <div className="wizard-check">
          <span className="wizard-dot green" />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Ask and Plan are read-first</span>
            <span className="wizard-check-desc">Chat can inspect context, but write, terminal, and wallet-sensitive work routes through approvals.</span>
          </div>
        </div>
        <div className="wizard-check">
          <span className="wizard-dot pulse" />
          <div className="wizard-check-label-wrap">
            <span className="wizard-check-label">Patch and agent runs leave receipts</span>
            <span className="wizard-check-desc">Use the AI Workbench to review runs, tool approvals, patches, and execution history.</span>
          </div>
        </div>
      </div>
      <div className="wizard-btn-row">
        <button type="button" className="wizard-btn primary" onClick={() => complete(true)}>
          Open AI Workbench
        </button>
        <button type="button" className="wizard-btn secondary" onClick={() => complete(false)}>
          Continue
        </button>
      </div>
    </div>
  )
}

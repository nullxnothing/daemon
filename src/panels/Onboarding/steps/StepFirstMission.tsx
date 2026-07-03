import { useOnboardingStore } from '../../../store/onboarding'
import { useUIStore } from '../../../store/ui'
import { useAriaStore } from '../../../store/aria'
import { FIRST_MISSION_PROMPT, markFunnelStep } from '../../../lib/firstMission'

/**
 * Final wizard step: fire the scripted first mission in the console. The wizard
 * closes without raising the tour offer — that would land on top of the approval
 * card and kill the moment — and the offer is raised once the mission turn
 * settles (the send promise resolves after ARIA's closing narration).
 */
export function StepFirstMission() {
  const advanceStep = useOnboardingStore((s) => s.advanceStep)
  const setStepStatus = useOnboardingStore((s) => s.setStepStatus)
  const finishWizardForMission = useOnboardingStore((s) => s.finishWizardForMission)

  const handleRun = () => {
    markFunnelStep('mission_started')
    finishWizardForMission()
    // The console lives in the right rail by default; make sure it is there
    // (and not tucked behind the bottom dock's Terminal tab) before streaming.
    useUIStore.getState().setConsoleDock('right')
    void useAriaStore.getState()
      .sendMessage(FIRST_MISSION_PROMPT)
      .finally(() => useOnboardingStore.getState().raiseDeferredTourOffer())
  }

  const handleSkip = () => {
    useUIStore.getState().openWorkspaceTool('project-readiness')
    setStepStatus('firstMission', 'complete')
    advanceStep()
  }

  return (
    <div className="wizard-api-section">
      <div className="wizard-mission-title">
        One mission, ninety seconds. ARIA reads your workspace, then asks permission
        for one harmless write. You decide.
      </div>
      <div className="wizard-mission-fineprint">
        Runs on devnet defaults. No wallet needed, no funds, nothing on-chain.
      </div>
      <button type="button" className="wizard-btn primary" data-testid="mission-run" onClick={handleRun}>
        Run first mission
      </button>
      <button type="button" className="wizard-skip-step" onClick={handleSkip}>
        Skip, explore on my own
      </button>
    </div>
  )
}

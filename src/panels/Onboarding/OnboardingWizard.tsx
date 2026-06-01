import type { FC } from 'react'
import { FocusTrap } from '../../components/FocusTrap'
import { useOnboardingStore, STEP_ORDER } from '../../store/onboarding'
import type { OnboardingStepId } from '../../store/onboarding'
import { confirm } from '../../store/confirm'
import { StepProfile } from './steps/StepProfile'
import { StepProject } from './steps/StepProject'
import { StepWalletRuntime } from './steps/StepWalletRuntime'
import { StepAiSafety } from './steps/StepAiSafety'
import { StepFirstRun } from './steps/StepFirstRun'
import daemonIcon from '../../assets/daemon-icon.png'
import './OnboardingWizard.css'

const STEP_LABELS: Record<OnboardingStepId, string> = {
  profile: 'Workspace',
  project: 'Project',
  runtime: 'Wallet + RPC',
  ai: 'AI Safety',
  firstRun: 'First Run',
}

const STEP_SUBTITLES: Record<OnboardingStepId, string> = {
  profile: 'What are you building?',
  project: 'Open or scaffold a Solana workspace',
  runtime: 'Choose the safe Solana execution route',
  ai: 'Set the agent boundary before it acts',
  firstRun: 'Start from the readiness checklist',
}

const STEP_COMPONENTS: Record<OnboardingStepId, FC> = {
  profile: StepProfile,
  project: StepProject,
  runtime: StepWalletRuntime,
  ai: StepAiSafety,
  firstRun: StepFirstRun,
}

export function OnboardingWizard() {
  const wizardOpen = useOnboardingStore((s) => s.wizardOpen)
  const currentStepIndex = useOnboardingStore((s) => s.currentStepIndex)
  const progress = useOnboardingStore((s) => s.progress)
  const skipWizard = useOnboardingStore((s) => s.skipWizard)
  const goToStep = useOnboardingStore((s) => s.goToStep)

  const currentStepId = STEP_ORDER[currentStepIndex]
  const StepComponent = STEP_COMPONENTS[currentStepId]
  const canGoBack = currentStepIndex > 0
  const progressPct = Math.round(((currentStepIndex + 1) / STEP_ORDER.length) * 100)

  const handleSkipWithConfirm = async () => {
    const ok = await confirm({
      title: 'Exit setup?',
      body: "You can re-run the setup wizard anytime from Settings → Setup. Your progress so far will be saved.",
      confirmLabel: 'Exit',
    })
    if (ok) skipWizard()
  }

  if (!wizardOpen) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      handleSkipWithConfirm()
    }
  }

  return (
    <div
      className="wizard-overlay"
      onKeyDown={handleKeyDown}
    >
      <FocusTrap active={wizardOpen}>
      <div
        className="wizard-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="daemon-onboarding-title"
        aria-describedby="daemon-onboarding-subtitle"
      >
        <div className="wizard-brand">
          <img src={daemonIcon} alt="" className="wizard-brand-mark" draggable={false} />
          <div id="daemon-onboarding-title" className="wizard-title">DAEMON</div>
        </div>

        {/* Progress dots */}
        <div className="wizard-progress">
          {STEP_ORDER.map((id, i) => {
            const status = progress[id]
            let dotClass = 'wizard-progress-dot'
            if (i === currentStepIndex) dotClass += ' active'
            if (status === 'complete') dotClass += ' complete'
            if (status === 'skipped') dotClass += ' skipped'
            return (
              <div key={id} className="wizard-progress-item">
                {i > 0 && <div className={`wizard-progress-line ${i <= currentStepIndex ? 'filled' : ''}`} />}
                <div className={dotClass} title={STEP_LABELS[id]} />
              </div>
            )
          })}
        </div>

        <div className="wizard-step-label">{STEP_LABELS[currentStepId]}</div>
        <div id="daemon-onboarding-subtitle" className="wizard-subtitle">{STEP_SUBTITLES[currentStepId]}</div>

        {/* Active step */}
        <div className="wizard-step-content">
          <StepComponent key={currentStepId} />
        </div>

        {/* Footer */}
        <div className="wizard-footer">
          <button
            className="wizard-skip-link"
            onClick={() => goToStep(currentStepIndex - 1)}
            disabled={!canGoBack}
            style={{ opacity: canGoBack ? 1 : 0.3, cursor: canGoBack ? 'pointer' : 'not-allowed' }}
          >
            ← Back
          </button>
          <button type="button" className="wizard-skip-link" onClick={handleSkipWithConfirm}>
            Skip setup, explore first
          </button>
          <span className="wizard-step-counter">
            {currentStepIndex + 1} of {STEP_ORDER.length} · {progressPct}%
          </span>
        </div>
      </div>
      </FocusTrap>
    </div>
  )
}

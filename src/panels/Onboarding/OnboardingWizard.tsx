import { useEffect, useRef } from 'react'
import { useOnboardingStore, STEP_ORDER } from '../../store/onboarding'
import type { OnboardingStepId } from '../../store/onboarding'
import { confirm } from '../../store/confirm'
import { StepProfile } from './steps/StepProfile'
import { StepClaude } from './steps/StepClaude'
import { StepGmail } from './steps/StepGmail'
import { StepVercel } from './steps/StepVercel'
import { StepRailway } from './steps/StepRailway'
import daemonIcon from '../../assets/daemon-icon.png'
import './OnboardingWizard.css'

const STEP_LABELS: Record<OnboardingStepId, string> = {
  profile: 'Workspace',
  claude: 'Claude',
  gmail: 'Gmail',
  vercel: 'Vercel',
  railway: 'Railway',
}

const STEP_SUBTITLES: Record<OnboardingStepId, string> = {
  profile: 'What are you building?',
  claude: 'Set up your AI engine',
  gmail: 'Connect your email',
  vercel: 'Deploy to Vercel',
  railway: 'Deploy to Railway',
}

const STEP_COMPONENTS: Record<OnboardingStepId, React.FC> = {
  profile: StepProfile,
  claude: StepClaude,
  gmail: StepGmail,
  vercel: StepVercel,
  railway: StepRailway,
}

export function OnboardingWizard() {
  const wizardOpen = useOnboardingStore((s) => s.wizardOpen)
  const currentStepIndex = useOnboardingStore((s) => s.currentStepIndex)
  const progress = useOnboardingStore((s) => s.progress)
  const skipWizard = useOnboardingStore((s) => s.skipWizard)
  const goToStep = useOnboardingStore((s) => s.goToStep)
  const overlayRef = useRef<HTMLDivElement>(null)

  const currentStepId = STEP_ORDER[currentStepIndex]
  const StepComponent = STEP_COMPONENTS[currentStepId]
  const canGoBack = currentStepIndex > 0
  const progressPct = Math.round(((currentStepIndex + 1) / STEP_ORDER.length) * 100)

  useEffect(() => {
    overlayRef.current?.focus()
  }, [wizardOpen])

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
      ref={overlayRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <div className="wizard-card">
        <div className="wizard-brand">
          <img src={daemonIcon} alt="" className="wizard-brand-mark" draggable={false} />
          <div className="wizard-title">DAEMON</div>
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
        <div className="wizard-subtitle">{STEP_SUBTITLES[currentStepId]}</div>

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
    </div>
  )
}

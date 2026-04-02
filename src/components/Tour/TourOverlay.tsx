import { useEffect } from 'react'
import { useOnboardingStore } from '../../store/onboarding'
import { useTourTarget } from '../../hooks/useTourTarget'
import { TOUR_STEPS } from './tourSteps'
import { TourTooltip } from './TourTooltip'
import './Tour.css'

const CUTOUT_PADDING = 8
const RADIUS = 6

export function TourOverlay() {
  const tourActive = useOnboardingStore((s) => s.tourActive)
  const tourStepIndex = useOnboardingStore((s) => s.tourStepIndex)

  const step = TOUR_STEPS[tourStepIndex]
  const isLastStep = tourStepIndex >= TOUR_STEPS.length - 1

  // Run step action if defined
  useEffect(() => {
    if (tourActive && step?.action) step.action()
  }, [tourActive, tourStepIndex])

  const { rect } = useTourTarget(tourActive && step ? step.target : null)

  // Keyboard navigation
  useEffect(() => {
    if (!tourActive) return
    const handleKey = (e: KeyboardEvent) => {
      const store = useOnboardingStore.getState()
      if (e.key === 'Escape') store.endTour()
      if (e.key === 'Enter' || e.key === 'ArrowRight') store.advanceTour()
      if (e.key === 'ArrowLeft') store.retreatTour()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [tourActive])

  if (!tourActive || !step) return null

  const handleOverlayClick = () => {
    const store = useOnboardingStore.getState()
    store.advanceTour()
  }

  // Cutout dimensions
  const cx = rect ? rect.left - CUTOUT_PADDING : 0
  const cy = rect ? rect.top - CUTOUT_PADDING : 0
  const cw = rect ? rect.width + CUTOUT_PADDING * 2 : 0
  const ch = rect ? rect.height + CUTOUT_PADDING * 2 : 0

  return (
    <div className="tour-overlay">
      <svg className="tour-svg" onClick={handleOverlayClick}>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={cx}
                y={cy}
                width={cw}
                height={ch}
                rx={RADIUS}
                ry={RADIUS}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.7)"
          mask="url(#tour-mask)"
        />
      </svg>

      {rect && (
        <TourTooltip
          title={step.title}
          body={step.body}
          placement={step.placement}
          stepIndex={tourStepIndex}
          totalSteps={TOUR_STEPS.length}
          targetRect={rect}
        />
      )}
    </div>
  )
}

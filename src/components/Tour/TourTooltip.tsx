import { useMemo } from 'react'
import { useOnboardingStore } from '../../store/onboarding'

interface TourTooltipProps {
  title: string
  body: string
  placement: 'top' | 'bottom' | 'left' | 'right'
  stepIndex: number
  totalSteps: number
  targetRect: { top: number; left: number; width: number; height: number }
}

const TOOLTIP_GAP = 16
const CUTOUT_PADDING = 8

export function TourTooltip({ title, body, placement, stepIndex, totalSteps, targetRect }: TourTooltipProps) {
  const isFirst = stepIndex === 0
  const isLast = stepIndex >= totalSteps - 1

  const style = useMemo(() => {
    const r = targetRect
    const pos: React.CSSProperties = { position: 'fixed' }

    switch (placement) {
      case 'right':
        pos.left = r.left + r.width + CUTOUT_PADDING + TOOLTIP_GAP
        pos.top = r.top + r.height / 2
        pos.transform = 'translateY(-50%)'
        break
      case 'left':
        pos.right = window.innerWidth - r.left + CUTOUT_PADDING + TOOLTIP_GAP
        pos.top = r.top + r.height / 2
        pos.transform = 'translateY(-50%)'
        break
      case 'bottom':
        pos.left = r.left + r.width / 2
        pos.top = r.top + r.height + CUTOUT_PADDING + TOOLTIP_GAP
        pos.transform = 'translateX(-50%)'
        break
      case 'top':
        pos.left = r.left + r.width / 2
        pos.bottom = window.innerHeight - r.top + CUTOUT_PADDING + TOOLTIP_GAP
        pos.transform = 'translateX(-50%)'
        break
    }

    return pos
  }, [targetRect, placement])

  const handleAdvance = () => useOnboardingStore.getState().advanceTour()
  const handleRetreat = () => useOnboardingStore.getState().retreatTour()
  const handleEnd = () => useOnboardingStore.getState().endTour()

  return (
    <div className={`tour-tooltip tour-tooltip-${placement}`} style={style} onClick={(e) => e.stopPropagation()}>
      <div className={`tour-tooltip-arrow ${placement}`} />
      <div className="tour-tooltip-header">
        <span className="tour-tooltip-title">{title}</span>
        <span className="tour-tooltip-counter">{stepIndex + 1} of {totalSteps}</span>
      </div>
      <p className="tour-tooltip-body">{body}</p>
      <div className="tour-tooltip-actions">
        {!isFirst && (
          <button type="button" className="tour-tooltip-btn secondary" onClick={handleRetreat}>Back</button>
        )}
        <button type="button" className="tour-tooltip-btn primary" onClick={isLast ? handleEnd : handleAdvance}>
          {isLast ? 'Done' : 'Next'}
        </button>
        <button type="button" className="tour-tooltip-btn skip" onClick={handleEnd}>Skip</button>
      </div>
    </div>
  )
}

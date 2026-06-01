/**
 * Visually-hidden ARIA live region for announcing transient async results
 * (copied, saved, refreshed, errors) to screen readers. Render once near a
 * surface and update `message` to announce. Clearing then re-setting the same
 * text re-announces it.
 */
interface LiveRegionProps {
  message: string
  /** 'polite' (default) waits for a pause; 'assertive' interrupts. */
  politeness?: 'polite' | 'assertive'
}

export function LiveRegion({ message, politeness = 'polite' }: LiveRegionProps) {
  return (
    <div className="sr-only" role="status" aria-live={politeness} aria-atomic="true">
      {message}
    </div>
  )
}

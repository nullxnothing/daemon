import { useEffect, useRef, type ReactNode } from 'react'

interface FocusTrapProps {
  children: ReactNode
  active?: boolean
  restoreFocus?: boolean
  /** When false, the host manages initial focus itself (avoids double-focus). */
  autoFocus?: boolean
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export function FocusTrap({ children, active = true, restoreFocus = true, autoFocus = true }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    previousFocusRef.current = document.activeElement as HTMLElement

    // Focus the first focusable element
    const container = containerRef.current
    if (!container) return

    if (autoFocus) {
      const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE)
      if (firstFocusable) {
        requestAnimationFrame(() => firstFocusable.focus())
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (focusableElements.length === 0) return

      const first = focusableElements[0]
      const last = focusableElements[focusableElements.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (restoreFocus && previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }
  }, [active, restoreFocus, autoFocus])

  // display:contents keeps the wrapper out of layout so the trap can wrap a
  // flex/grid child without altering centering or sizing.
  return <div ref={containerRef} style={{ display: 'contents' }}>{children}</div>
}

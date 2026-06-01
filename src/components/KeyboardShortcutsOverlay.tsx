import { useEffect } from 'react'
import { KeyboardShortcuts } from './KeyboardShortcuts'
import { FocusTrap } from './FocusTrap'
import './KeyboardShortcutsOverlay.css'

interface KeyboardShortcutsOverlayProps {
  onClose: () => void
}

export function KeyboardShortcutsOverlay({ onClose }: KeyboardShortcutsOverlayProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="shortcuts-overlay" onClick={onClose} role="presentation">
      <FocusTrap>
        <div
          className="shortcuts-modal"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <button type="button" className="shortcuts-modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <KeyboardShortcuts />
        </div>
      </FocusTrap>
    </div>
  )
}

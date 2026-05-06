import { useRef, useEffect } from 'react'

// Minimal inline owl — two dots for eyes, no external dependency
function AriaOwlMini() {
  return (
    <svg
      className="aria-hint-owl"
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="4" cy="5" rx="2.5" ry="3" fill="var(--s3)" stroke="var(--s5)" strokeWidth="0.6" />
      <ellipse cx="10" cy="5" rx="2.5" ry="3" fill="var(--s3)" stroke="var(--s5)" strokeWidth="0.6" />
      <circle cx="4" cy="5" r="1.1" fill="var(--green)" opacity="0.85" />
      <circle cx="10" cy="5" r="1.1" fill="var(--green)" opacity="0.85" />
      <circle cx="4.4" cy="4.6" r="0.35" fill="var(--bg)" />
      <circle cx="10.4" cy="4.6" r="0.35" fill="var(--bg)" />
    </svg>
  )
}

// --- Terminal output search ---

interface TerminalSearchOverlayProps {
  query: string
  matchCount: number
  currentMatch: number
  onQueryChange: (q: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export function TerminalSearchOverlay({
  query,
  matchCount,
  currentMatch,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: TerminalSearchOverlayProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'Enter') { e.shiftKey ? onPrev() : onNext(); return }
    if (e.key === 'F3') { e.shiftKey ? onPrev() : onNext(); e.preventDefault() }
  }

  const countLabel = matchCount === 0 ? 'No results' : `${currentMatch + 1} of ${matchCount}`

  return (
    <div className="terminal-search-overlay" onPointerDown={(e) => e.stopPropagation()}>
      <div className="terminal-search-input-row">
        <span className="terminal-search-icon">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
        <input
          ref={inputRef}
          className="terminal-search-input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search output..."
          spellCheck={false}
        />
        <span className="terminal-search-count">{countLabel}</span>
        <button type="button" className="terminal-search-nav" onClick={onPrev} title="Previous (Shift+Enter)" disabled={matchCount === 0}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 6.5L5 3.5L8 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button type="button" className="terminal-search-nav" onClick={onNext} title="Next (Enter)" disabled={matchCount === 0}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button type="button" className="terminal-overlay-dismiss" onClick={onClose}>&times;</button>
      </div>
    </div>
  )
}

// --- Completion hints ---

interface HintsOverlayProps {
  hints: string[]
  onAcceptHint: (hint: string) => void
  onDismiss: () => void
}

export function HintsOverlay({ hints, onAcceptHint, onDismiss }: HintsOverlayProps) {
  return (
    <div className="terminal-overlay hints aria-bubble" onPointerDown={(e) => e.stopPropagation()}>
      <div className="aria-bubble-tail" aria-hidden="true" />
      <div className="terminal-overlay-header">
        <div className="aria-bubble-identity">
          <AriaOwlMini />
          <span className="aria-bubble-label">aria</span>
        </div>
        <button type="button" className="terminal-overlay-dismiss" onClick={onDismiss}>&times;</button>
      </div>
      {hints.slice(0, 5).map((hint) => (
        <button type="button" key={hint} className="terminal-overlay-item" onClick={() => onAcceptHint(hint)}>
          {hint}
        </button>
      ))}
    </div>
  )
}

// --- History search ---

interface HistorySearchOverlayProps {
  query: string
  matches: string[]
  selectionIndex: number
  onSelectAndApply: (index: number) => void
}

export function HistorySearchOverlay({ query, matches, selectionIndex, onSelectAndApply }: HistorySearchOverlayProps) {
  return (
    <div className="terminal-overlay history-search aria-bubble" onPointerDown={(e) => e.stopPropagation()}>
      <div className="aria-bubble-tail" aria-hidden="true" />
      <div className="terminal-overlay-header">
        <div className="aria-bubble-identity">
          <AriaOwlMini />
          <span className="aria-bubble-label">aria</span>
          <span className="aria-bubble-hint-key">ctrl+r</span>
        </div>
      </div>
      <div className="terminal-history-query">{query || 'type to filter...'}</div>
      <div className="terminal-history-results">
        {matches.slice(0, 8).map((match, index) => (
          <button
            key={`${match}-${index}`}
            className={`terminal-overlay-item ${index === selectionIndex ? 'active' : ''}`}
            onClick={() => onSelectAndApply(index)}
          >
            {match}
          </button>
        ))}
        {matches.length === 0 && (
          <div className="terminal-history-empty">No matching commands</div>
        )}
      </div>
    </div>
  )
}

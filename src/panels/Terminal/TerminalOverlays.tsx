interface HintsOverlayProps {
  hints: string[]
  onAcceptHint: (hint: string) => void
  onDismiss: () => void
}

export function HintsOverlay({ hints, onAcceptHint, onDismiss }: HintsOverlayProps) {
  return (
    <div className="terminal-overlay hints" onPointerDown={(e) => e.stopPropagation()}>
      <div className="terminal-overlay-header">
        <div className="terminal-overlay-title">Hints (Tab)</div>
        <button className="terminal-overlay-dismiss" onClick={onDismiss}>&times;</button>
      </div>
      {hints.slice(0, 5).map((hint) => (
        <button key={hint} className="terminal-overlay-item" onClick={() => onAcceptHint(hint)}>{hint}</button>
      ))}
    </div>
  )
}

interface HistorySearchOverlayProps {
  query: string
  matches: string[]
  selectionIndex: number
  onSelectAndApply: (index: number) => void
}

export function HistorySearchOverlay({ query, matches, selectionIndex, onSelectAndApply }: HistorySearchOverlayProps) {
  return (
    <div className="terminal-overlay history-search">
      <div className="terminal-overlay-title">History Search (Ctrl+R)</div>
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

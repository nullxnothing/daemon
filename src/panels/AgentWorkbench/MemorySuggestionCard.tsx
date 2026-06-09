import { useAriaStore } from '../../store/aria'
import type { AriaMemorySuggestionLite } from '../../../electron/shared/types'

export function MemorySuggestionCard({ suggestion }: { suggestion: AriaMemorySuggestionLite }) {
  const resolve = useAriaStore((s) => s.resolveMemorySuggestion)

  return (
    <div className="agent-memory-card">
      <div className="agent-memory-head">
        <span className="agent-memory-badge">REMEMBER?</span>
        <span className="agent-memory-kind">{suggestion.kind.replace(/_/g, ' ')}</span>
      </div>
      <div className="agent-memory-title">{suggestion.title}</div>
      <div className="agent-memory-value">{suggestion.value}</div>
      <div className="agent-memory-actions">
        <button type="button" className="agent-memory-dismiss" onClick={() => void resolve(suggestion.id, false)}>
          Dismiss
        </button>
        <button type="button" className="agent-memory-keep" onClick={() => void resolve(suggestion.id, true)}>
          Keep
        </button>
      </div>
    </div>
  )
}

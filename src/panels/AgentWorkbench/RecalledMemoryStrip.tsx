import { useState } from 'react'
import type { AriaMemorySuggestionLite } from '../../../electron/shared/types'
import { MemoryKnowledgeIcon } from './AgentWorkbench'

/**
 * Shows what ARIA recalled to handle a turn — the "it remembers you" moment.
 * Collapsed to a one-line count by default so it stays calm.
 */
export function RecalledMemoryStrip({ recalled }: { recalled: AriaMemorySuggestionLite[] }) {
  const [open, setOpen] = useState(false)
  if (recalled.length === 0) return null
  const count = recalled.length

  return (
    <div className="agent-recall">
      <button type="button" className="agent-recall-head" onClick={() => setOpen((v) => !v)}>
        <span className="agent-recall-glyph"><MemoryKnowledgeIcon /></span>
        <span className="agent-recall-label">
          Recalled {count} fact{count === 1 ? '' : 's'} you taught me
        </span>
        <span className="agent-recall-caret">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="agent-recall-list">
          {recalled.map((m) => (
            <li key={m.id} className="agent-recall-item">
              <span className="agent-recall-item-title">{m.title}</span>
              <span className="agent-recall-item-value">{m.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

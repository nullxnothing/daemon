import { useState, type ReactNode } from 'react'

export function CollapsibleSection({ title, defaultOpen = true, count, children }: {
  title: string
  defaultOpen?: boolean
  count?: number
  children: ReactNode
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="claude-section">
      <div
        className="claude-section-header"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen) } }}
      >
        <span className="claude-section-arrow">{isOpen ? '▾' : '▸'}</span>
        <span className="claude-section-title">{title}</span>
        {count !== undefined && <span className="claude-section-count">{count}</span>}
      </div>
      {isOpen && children}
    </div>
  )
}

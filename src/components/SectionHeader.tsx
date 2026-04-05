import type { ReactNode } from 'react'
import './SectionHeader.css'

interface SectionHeaderProps {
  title: string
  count?: number | string
  action?: ReactNode
  collapsed?: boolean
  onToggle?: () => void
}

export function SectionHeader({ title, count, action, collapsed, onToggle }: SectionHeaderProps) {
  const isCollapsible = onToggle !== undefined

  return (
    <div
      className={`section-header ${isCollapsible ? 'collapsible' : ''}`}
      onClick={isCollapsible ? onToggle : undefined}
      role={isCollapsible ? 'button' : undefined}
      tabIndex={isCollapsible ? 0 : undefined}
      aria-expanded={isCollapsible ? !collapsed : undefined}
      onKeyDown={isCollapsible ? (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle?.() }
      } : undefined}
    >
      {isCollapsible && (
        <svg
          className={`section-header-chevron ${collapsed ? 'collapsed' : ''}`}
          width="10" height="10" viewBox="0 0 10 10"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="2.5 3.5 5 6.5 7.5 3.5" />
        </svg>
      )}
      <span className="section-header-title">{title}</span>
      {count !== undefined && <span className="section-header-count">{count}</span>}
      {action && <span className="section-header-action" onClick={(e) => e.stopPropagation()}>{action}</span>}
    </div>
  )
}

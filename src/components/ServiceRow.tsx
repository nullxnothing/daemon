import type { ReactNode } from 'react'
import { Dot } from './Dot'
import './ServiceRow.css'

interface ServiceRowProps {
  name: string
  status?: 'green' | 'amber' | 'red' | 'blue' | 'off'
  tag?: string
  description?: string
  action?: ReactNode
  onClick?: () => void
}

export function ServiceRow({ name, status = 'off', tag, description, action, onClick }: ServiceRowProps) {
  return (
    <div
      className={`service-row ${onClick ? 'clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      <Dot color={status} />
      <div className="service-row-info">
        <div className="service-row-main">
          <span className="service-row-name">{name}</span>
          {tag && <span className="service-row-tag">{tag}</span>}
        </div>
        {description && <div className="service-row-desc">{description}</div>}
      </div>
      {action && <div className="service-row-action" onClick={(e) => e.stopPropagation()}>{action}</div>}
    </div>
  )
}

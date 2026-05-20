import type { ReactNode } from 'react'

interface RightRailSectionProps {
  kicker: string
  title: string
  children: ReactNode
  className?: string
  media?: ReactNode
  action?: ReactNode
}

export function RightRailSection({
  kicker,
  title,
  children,
  className,
  media,
  action,
}: RightRailSectionProps) {
  return (
    <section className={`rp-side-widget${className ? ` ${className}` : ''}`}>
      <div className="rp-side-widget-head">
        <div className="rp-side-widget-title-group">
          {media}
          <div className="rp-side-widget-copy">
            <div className="rp-agent-widget-kicker">{kicker}</div>
            <div className="rp-side-widget-title">{title}</div>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

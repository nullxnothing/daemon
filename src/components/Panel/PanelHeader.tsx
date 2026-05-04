import type { ReactNode } from 'react'
import styles from './PanelHeader.module.css'

interface PanelHeaderProps {
  kicker?: string
  /** Tint the kicker green. Reserve for brand-significant panels (Wallet, Dashboard). */
  brandKicker?: boolean
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
  actionsClassName?: string
}

export function PanelHeader({
  kicker,
  brandKicker,
  title,
  subtitle,
  actions,
  className,
  actionsClassName,
}: PanelHeaderProps) {
  const kickerClass = brandKicker
    ? `${styles.kicker} ${styles['kicker--brand']}`
    : styles.kicker
  const headerClass = [styles.header, className].filter(Boolean).join(' ')
  const actionsClass = [styles.actions, actionsClassName].filter(Boolean).join(' ')

  return (
    <header className={headerClass}>
      <div className={styles.copy}>
        {kicker ? <div className={kickerClass}>{kicker}</div> : null}
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={actionsClass}>{actions}</div> : null}
    </header>
  )
}

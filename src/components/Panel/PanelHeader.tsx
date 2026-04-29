import type { ReactNode } from 'react'
import styles from './PanelHeader.module.css'

interface PanelHeaderProps {
  kicker?: string
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PanelHeader({ kicker, title, subtitle, actions }: PanelHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        {kicker ? <div className={styles.kicker}>{kicker}</div> : null}
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
}

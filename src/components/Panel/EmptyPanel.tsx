import type { ReactNode } from 'react'
import styles from './EmptyPanel.module.css'

interface EmptyPanelProps {
  label?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function EmptyPanel({ label, title, description, actions, className }: EmptyPanelProps) {
  const classes = [styles.empty, className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <strong className={styles.title}>{title}</strong>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  )
}

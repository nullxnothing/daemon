import type { ReactNode } from 'react'
import styles from './SectionDivider.module.css'

interface SectionDividerProps {
  label?: ReactNode
  className?: string
}

export function SectionDivider({ label, className }: SectionDividerProps) {
  const classes = [styles.divider, className].filter(Boolean).join(' ')
  return (
    <div className={classes} role="separator">
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  )
}

import type { CSSProperties } from 'react'
import styles from './ProgressRing.module.css'

interface ProgressRingProps {
  value: number
  label?: string
  className?: string
}

export function ProgressRing({ value, label, className }: ProgressRingProps) {
  const normalized = Math.max(0, Math.min(100, value))
  const classes = [styles.ring, className].filter(Boolean).join(' ')
  const style = { '--progress-ring-value': `${normalized}%` } as CSSProperties

  return (
    <div className={classes} style={style} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalized} aria-label={label}>
      <span className={styles.inner}>{Math.round(normalized)}%</span>
    </div>
  )
}

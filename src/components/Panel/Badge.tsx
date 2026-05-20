import type { ReactNode } from 'react'
import styles from './Badge.module.css'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'feature'
type BadgeSize = 'sm' | 'md'

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
  size?: BadgeSize
  className?: string
}

export function Badge({ children, tone = 'neutral', size = 'sm', className }: BadgeProps) {
  const classes = [styles.badge, styles[tone], styles[size], className].filter(Boolean).join(' ')
  return <span className={classes}>{children}</span>
}

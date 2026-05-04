import styles from './StatusDot.module.css'

type StatusTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info'

interface StatusDotProps {
  tone?: StatusTone
  pulse?: boolean
  className?: string
}

export function StatusDot({ tone = 'neutral', pulse = false, className }: StatusDotProps) {
  const classes = [styles.dot, styles[tone], pulse ? styles.pulse : undefined, className].filter(Boolean).join(' ')
  return <span className={classes} aria-hidden="true" />
}

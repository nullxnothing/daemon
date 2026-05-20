import styles from './StatusDot.module.css'

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'feature'

interface StatusDotProps {
  tone?: StatusTone
  pulse?: boolean
  label?: string
  className?: string
}

export function StatusDot({ tone = 'neutral', pulse = false, label, className }: StatusDotProps) {
  const classes = [styles.dot, styles[tone], pulse ? styles.pulse : undefined, className].filter(Boolean).join(' ')
  return <span className={classes} aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined} />
}

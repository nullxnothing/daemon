import type { HTMLAttributes } from 'react'
import styles from './Spinner.module.css'

interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Diameter in px. Defaults to 16. */
  size?: number
  /** Stroke color token. Defaults to currentColor so it inherits text color. */
  tone?: 'current' | 'accent' | 'muted'
  /** Accessible label. When omitted the spinner is decorative (aria-hidden). */
  label?: string
}

const TONE_VAR: Record<NonNullable<SpinnerProps['tone']>, string> = {
  current: 'currentColor',
  accent: 'var(--accent)',
  muted: 'var(--t3)',
}

export function Spinner({ size = 16, tone = 'current', label, className, style, ...props }: SpinnerProps) {
  const classes = [styles.spinner, className].filter(Boolean).join(' ')

  return (
    <span
      className={classes}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size, color: TONE_VAR[tone], ...style }}
      {...props}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.18" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  )
}

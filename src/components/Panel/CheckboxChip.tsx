import type { ReactNode } from 'react'
import styles from './CheckboxChip.module.css'

interface CheckboxChipProps {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  disabled?: boolean
  className?: string
}

export function CheckboxChip({ checked, onChange, children, disabled, className }: CheckboxChipProps) {
  const classes = [styles.chip, checked ? styles.checked : undefined, className].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      aria-pressed={checked}
      disabled={disabled}
      className={classes}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.box} aria-hidden="true">{checked ? 'x' : ''}</span>
      <span>{children}</span>
    </button>
  )
}

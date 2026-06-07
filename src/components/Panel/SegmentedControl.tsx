import type { ReactNode } from 'react'
import styles from './SegmentedControl.module.css'

export interface SegmentItem<T extends string> {
  id: T
  label: ReactNode
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  items: Array<SegmentItem<T>>
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
}

export function SegmentedControl<T extends string>({ items, value, onChange, className, ariaLabel }: SegmentedControlProps<T>) {
  const classes = [styles.control, className].filter(Boolean).join(' ')

  return (
    <div className={classes} role="group" aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={isActive}
            disabled={item.disabled}
            className={[styles.item, isActive ? styles.active : undefined].filter(Boolean).join(' ')}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

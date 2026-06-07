import type { CSSProperties, ReactNode } from 'react'
import styles from './VendorCard.module.css'

type VendorStatus = 'ready' | 'partial' | 'setup' | 'off'

interface VendorCardProps {
  name: ReactNode
  category?: ReactNode
  description?: ReactNode
  monogram: ReactNode
  accent?: string
  status?: VendorStatus
  selected?: boolean
  disabled?: boolean
  action?: ReactNode
  onClick?: () => void
  className?: string
}

export function VendorCard({
  name,
  category,
  description,
  monogram,
  accent,
  status = 'off',
  selected,
  disabled,
  action,
  onClick,
  className,
}: VendorCardProps) {
  const classes = [styles.card, styles[status], selected ? styles.selected : undefined, className].filter(Boolean).join(' ')
  const style = accent ? ({ '--vc': accent } as CSSProperties) : undefined

  return (
    <button type="button" className={classes} style={style} disabled={disabled} aria-pressed={selected} onClick={onClick}>
      <span className={styles.mark}>{monogram}</span>
      <span className={styles.body}>
        <span className={styles.head}>
          <span className={styles.title}>
            {category ? <span className={styles.category}>{category}</span> : null}
            <strong>{name}</strong>
          </span>
          <span className={styles.badge}>{status}</span>
        </span>
        {description ? <span className={styles.description}>{description}</span> : null}
        {action ? <span className={styles.action}>{action}</span> : null}
      </span>
    </button>
  )
}

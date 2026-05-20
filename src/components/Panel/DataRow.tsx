import type { ReactNode } from 'react'
import { Surface } from './Surface'
import styles from './DataRow.module.css'

type DataRowTone = 'default' | 'success' | 'warn' | 'danger' | 'info'
type DataRowDensity = 'compact' | 'default' | 'spacious'

interface DataRowProps {
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  detail?: ReactNode
  actions?: ReactNode
  tone?: DataRowTone
  density?: DataRowDensity
  className?: string
}

export function DataRow({ leading, title, meta, detail, actions, tone = 'default', density = 'default', className }: DataRowProps) {
  const classes = [styles.row, styles[density], className].filter(Boolean).join(' ')

  return (
    <Surface className={classes} tone={tone === 'warn' ? 'warning' : tone} padding="sm">
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <div className={styles.main}>
        <div className={styles.titleLine}>
          <strong className={styles.title}>{title}</strong>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {detail ? <div className={styles.detail}>{detail}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </Surface>
  )
}

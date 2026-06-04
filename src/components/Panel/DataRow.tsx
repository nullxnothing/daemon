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
  /**
   * Flush rows drop the card chrome (border/bg/padding) and keep only the
   * hairline bottom-border grammar, so a stack of them fuses into one list
   * inside a single bordered container (the mockup `.drow` recipe).
   */
  flush?: boolean
  className?: string
}

export function DataRow({ leading, title, meta, detail, actions, tone = 'default', density = 'default', flush = false, className }: DataRowProps) {
  const inner = (
    <>
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <div className={styles.main}>
        <div className={styles.titleLine}>
          <strong className={styles.title}>{title}</strong>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {detail ? <div className={styles.detail}>{detail}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </>
  )

  if (flush) {
    const classes = [styles.row, styles.flush, styles[density], className].filter(Boolean).join(' ')
    return <div className={classes}>{inner}</div>
  }

  const classes = [styles.row, styles[density], className].filter(Boolean).join(' ')
  return (
    <Surface className={classes} tone={tone === 'warn' ? 'warning' : tone} padding="sm">
      {inner}
    </Surface>
  )
}

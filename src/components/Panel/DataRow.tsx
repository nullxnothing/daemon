import type { ReactNode } from 'react'
import styles from './DataRow.module.css'

type DataRowTone = 'default' | 'success' | 'warn' | 'danger' | 'info'

interface DataRowProps {
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  detail?: ReactNode
  actions?: ReactNode
  tone?: DataRowTone
  className?: string
}

const TONE_CLASS: Record<DataRowTone, string | undefined> = {
  default: undefined,
  success: styles.success,
  warn: styles.warn,
  danger: styles.danger,
  info: styles.info,
}

export function DataRow({ leading, title, meta, detail, actions, tone = 'default', className }: DataRowProps) {
  const classes = [styles.row, TONE_CLASS[tone], className].filter(Boolean).join(' ')

  return (
    <article className={classes}>
      {leading ? <div className={styles.leading}>{leading}</div> : null}
      <div className={styles.main}>
        <div className={styles.titleLine}>
          <strong className={styles.title}>{title}</strong>
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {detail ? <div className={styles.detail}>{detail}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </article>
  )
}

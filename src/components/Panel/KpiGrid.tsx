import type { ReactNode } from 'react'
import styles from './KpiGrid.module.css'

export interface KpiCellData {
  label: ReactNode
  value: ReactNode
  /** Dim, small unit rendered inline after the value (e.g. SOL, ◎). */
  unit?: ReactNode
  meta?: ReactNode
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

interface KpiGridProps {
  cells: KpiCellData[]
  className?: string
}

export function KpiGrid({ cells, className }: KpiGridProps) {
  const classes = [styles.grid, className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      {cells.map((cell, index) => (
        <KpiCell
          key={typeof cell.label === 'string' ? cell.label : index}
          label={cell.label}
          value={cell.value}
          unit={cell.unit}
          meta={cell.meta}
          tone={cell.tone}
        />
      ))}
    </div>
  )
}

export function KpiCell({ label, value, unit, meta, tone = 'default' }: KpiCellData) {
  const classes = [styles.cell, styles[tone]].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>
        {value}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </strong>
      {meta ? <span className={styles.meta}>{meta}</span> : null}
    </div>
  )
}

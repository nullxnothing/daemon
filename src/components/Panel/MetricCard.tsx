import type { ReactNode } from 'react'
import { Surface } from './Surface'
import styles from './MetricCard.module.css'

type MetricTone = 'default' | 'success' | 'warn' | 'danger' | 'info'
type MetricSize = 'compact' | 'default' | 'display'

interface MetricCardProps {
  label: string
  value: ReactNode
  unit?: string
  detail?: ReactNode
  tone?: MetricTone
  size?: MetricSize
}

const SIZE_CLASS: Record<MetricSize, string | undefined> = {
  compact: styles['value--compact'],
  default: undefined,
  display: styles['value--display'],
}

export function MetricCard({
  label,
  value,
  unit,
  detail,
  tone = 'default',
  size = 'default',
}: MetricCardProps) {
  const valueClass = [styles.value, SIZE_CLASS[size]].filter(Boolean).join(' ')
  const normalizedValue = value === null || value === undefined || value === '' ? '—' : value

  return (
    <Surface className={styles.metric} tone={tone === 'warn' ? 'warning' : tone}>
      <div className={styles.label}>{label}</div>
      <div className={styles.valueRow}>
        <span className={valueClass}>{normalizedValue}</span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </div>
      {detail ? <div className={styles.detail}>{detail}</div> : null}
    </Surface>
  )
}

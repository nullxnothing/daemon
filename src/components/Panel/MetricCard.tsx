import type { ReactNode } from 'react'
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

const TONE_CLASS: Record<MetricTone, string | undefined> = {
  default: undefined,
  success: styles.success,
  warn: styles.warn,
  danger: styles.danger,
  info: styles.info,
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
  const containerClass = [styles.metric, TONE_CLASS[tone]].filter(Boolean).join(' ')
  const valueClass = [styles.value, SIZE_CLASS[size]].filter(Boolean).join(' ')

  return (
    <div className={containerClass}>
      <div className={styles.label}>{label}</div>
      <div className={styles.valueRow}>
        <span className={valueClass}>{value}</span>
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </div>
      {detail ? <div className={styles.detail}>{detail}</div> : null}
    </div>
  )
}

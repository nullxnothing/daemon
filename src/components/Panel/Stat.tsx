import { useEffect, useState, type ReactNode } from 'react'
import { Surface } from './Surface'
import styles from './Stat.module.css'

type StatTone = 'default' | 'success' | 'warn' | 'danger' | 'info'

interface StatProps {
  label: string
  value: ReactNode
  detail?: ReactNode
  tone?: StatTone
  className?: string
  labelClassName?: string
  valueClassName?: string
  detailClassName?: string
}

export function Stat({
  label,
  value,
  detail,
  tone = 'default',
  className,
  labelClassName,
  valueClassName,
  detailClassName,
}: StatProps) {
  const [tick, setTick] = useState(false)

  useEffect(() => {
    setTick(true)
    const timer = window.setTimeout(() => setTick(false), 240)
    return () => window.clearTimeout(timer)
  }, [value])

  const classes = [styles.stat, className].filter(Boolean).join(' ')
  const labelClass = [styles.label, labelClassName].filter(Boolean).join(' ')
  const valueClass = [styles.value, tick ? styles.tick : undefined, valueClassName].filter(Boolean).join(' ')
  const detailClass = [styles.detail, detailClassName].filter(Boolean).join(' ')
  const normalizedValue = value === null || value === undefined || value === '' ? '—' : value

  return (
    <Surface className={classes} tone={tone === 'warn' ? 'warning' : tone}>
      <span className={labelClass}>{label}</span>
      <strong className={valueClass}>{normalizedValue}</strong>
      {detail ? <span className={detailClass}>{detail}</span> : null}
    </Surface>
  )
}

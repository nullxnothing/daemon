import { Skeleton } from './Skeleton'
import styles from './SkeletonPresets.module.css'

/** A block of fake text lines. Last line is shortened for realism. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={[styles.stack, className].filter(Boolean).join(' ')} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="10px"
          width={i === lines - 1 ? '62%' : '100%'}
        />
      ))}
    </div>
  )
}

/** Repeated list rows: leading dot + two text lines. Matches DataRow shape. */
export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={[styles.rows, className].filter(Boolean).join(' ')} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={styles.row}>
          <Skeleton width="28px" height="28px" className={styles.avatar} />
          <div className={styles.rowBody}>
            <Skeleton height="10px" width="48%" />
            <Skeleton height="8px" width="78%" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** A responsive grid of card placeholders. Matches Card/MetricCard shape. */
export function SkeletonCards({ count = 4, minWidth = 168, className }: { count?: number; minWidth?: number; className?: string }) {
  return (
    <div
      className={[styles.cards, className].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton width="32px" height="32px" className={styles.cardIcon} />
          <Skeleton height="12px" width="64%" />
          <Skeleton height="9px" width="90%" />
          <Skeleton height="9px" width="40%" />
        </div>
      ))}
    </div>
  )
}

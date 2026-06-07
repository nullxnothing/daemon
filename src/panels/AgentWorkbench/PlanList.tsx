import type { AriaPlanStep } from '../../../electron/shared/types'
import styles from './PlanList.module.css'

/** Numbered operator plan (mockup rows 01–04) with per-step status. */
export function PlanList({ steps }: { steps: AriaPlanStep[] }) {
  if (steps.length === 0) return null
  return (
    <ol className={styles.list}>
      {steps.map((step) => (
        <li key={step.index} className={`${styles.step} ${styles[step.status]}`}>
          <span className={styles.index}>{String(step.index).padStart(2, '0')}</span>
          <span className={styles.title}>{step.title}</span>
        </li>
      ))}
    </ol>
  )
}

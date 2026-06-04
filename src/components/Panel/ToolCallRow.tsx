import { useState, type ReactNode } from 'react'
import styles from './ToolCallRow.module.css'

export type ToolCallKind = 'read' | 'edit' | 'run'
type ToolCallStatus = 'pending' | 'running' | 'done' | 'error'

interface ToolCallRowProps {
  kind: ToolCallKind
  label: ReactNode
  meta?: ReactNode
  status?: ToolCallStatus
  details?: ReactNode
  defaultOpen?: boolean
  className?: string
}

export function ToolCallRow({ kind, label, meta, status = 'done', details, defaultOpen = false, className }: ToolCallRowProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const classes = [styles.row, styles[kind], styles[status], className].filter(Boolean).join(' ')
  const canToggle = Boolean(details)

  return (
    <div className={classes}>
      <button
        type="button"
        className={styles.head}
        disabled={!canToggle}
        aria-expanded={canToggle ? isOpen : undefined}
        onClick={() => canToggle && setIsOpen((value) => !value)}
      >
        <span className={styles.kind}>{kind}</span>
        <span className={styles.label}>{label}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
        {status === 'done'
          ? <span className={styles.check} aria-hidden="true">✓</span>
          : <span className={styles.state} aria-hidden="true" />}
      </button>
      {details && isOpen ? <div className={styles.details}>{details}</div> : null}
    </div>
  )
}

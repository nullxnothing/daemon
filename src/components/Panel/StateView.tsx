import type { ReactNode } from 'react'
import { EmptyState } from '../EmptyState'
import { SkeletonRows } from './SkeletonPresets'
import styles from './StateView.module.css'

type AsyncStatus = 'loading' | 'error' | 'empty' | 'ready'

interface StateViewProps {
  /** Explicit status. If omitted, it is derived from the booleans below. */
  status?: AsyncStatus
  isLoading?: boolean
  error?: string | null
  isEmpty?: boolean

  /** Custom loading view. Defaults to skeleton rows. */
  loadingView?: ReactNode
  /** Empty-state config (or a fully custom node). */
  empty?: EmptyConfig | ReactNode
  /** Error-state config (or a fully custom node). */
  errorView?: ReactNode
  /** Retry handler — renders a Retry button on the default error view. */
  onRetry?: () => void

  children: ReactNode
}

interface EmptyConfig {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

function isEmptyConfig(value: EmptyConfig | ReactNode): value is EmptyConfig {
  return Boolean(value) && typeof value === 'object' && 'title' in (value as object)
}

function deriveStatus(props: StateViewProps): AsyncStatus {
  if (props.status) return props.status
  if (props.isLoading) return 'loading'
  if (props.error) return 'error'
  if (props.isEmpty) return 'empty'
  return 'ready'
}

const ErrorGlyph = (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

export function StateView(props: StateViewProps) {
  const status = deriveStatus(props)

  if (status === 'loading') {
    return (
      <div className={styles.shell} role="status" aria-live="polite" aria-busy="true">
        <span className={styles.srOnly}>Loading…</span>
        {props.loadingView ?? <SkeletonRows rows={4} className={styles.pad} />}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={styles.shell} role="alert">
        {props.errorView ?? (
          <EmptyState
            icon={<span className={styles.errorIcon}>{ErrorGlyph}</span>}
            title="This didn't load"
            description={props.error ?? 'Something broke on our end. Give it another go.'}
            action={
              props.onRetry ? (
                <button type="button" className={styles.retry} onClick={props.onRetry}>
                  Try again
                </button>
              ) : undefined
            }
          />
        )}
      </div>
    )
  }

  if (status === 'empty') {
    const empty = props.empty
    return (
      <div className={`${styles.shell} ${styles.enter}`}>
        {isEmptyConfig(empty) ? (
          <EmptyState title={empty.title} description={empty.description} icon={empty.icon} action={empty.action} />
        ) : (
          empty
        )}
      </div>
    )
  }

  return <div className={styles.enter}>{props.children}</div>
}

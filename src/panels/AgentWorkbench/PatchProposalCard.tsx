import { useAriaStore, type AriaActionState } from '../../store/aria'
import type { AriaPatchProposalLite } from '../../../electron/shared/types'
import styles from './PatchProposalCard.module.css'

const STATE_LABEL: Partial<Record<AriaActionState, string>> = {
  applied: 'Changes kept',
  rejected: 'Changes discarded',
  failed: 'Failed to apply',
}

export function PatchProposalCard({
  patch,
  actionState = 'idle',
}: {
  patch: AriaPatchProposalLite
  actionState?: AriaActionState
}) {
  const decidePatch = useAriaStore((s) => s.decidePatch)
  const isTerminal = actionState === 'applied' || actionState === 'rejected' || actionState === 'failed'
  const isDeciding = actionState === 'deciding'

  return (
    <div className={`${styles.card} ${styles[patch.riskLevel]}`}>
      <div className={styles.head}>
        <span className={styles.title}>{patch.title}</span>
        <span className={styles.churn}>
          <span className={styles.add}>+{patch.additions}</span>{' '}
          <span className={styles.del}>-{patch.deletions}</span>
        </span>
      </div>

      {patch.summary ? <p className={styles.summary}>{patch.summary}</p> : null}

      {patch.files.length > 0 ? (
        <div className={styles.files}>
          {patch.files.map((file) => (
            <span key={file} className={styles.file}>{file}</span>
          ))}
        </div>
      ) : null}

      {isTerminal ? (
        <div className={`${styles.status} ${styles[actionState]}`}>{STATE_LABEL[actionState]}</div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.keep}
            disabled={isDeciding}
            onClick={() => decidePatch(patch.id, 'keep')}
          >
            <svg
              className={styles.keepIcon}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Keep changes
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={isDeciding}
            onClick={() => decidePatch(patch.id, 'run-tests')}
            title="Test runner integration coming soon"
          >
            Run tests
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={isDeciding}
            onClick={() => decidePatch(patch.id, 'discard')}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  )
}

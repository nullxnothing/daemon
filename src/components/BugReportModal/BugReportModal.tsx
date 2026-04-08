import { useState, useEffect, useCallback } from 'react'
import styles from './BugReportModal.module.css'

interface BugReportModalProps {
  open: boolean
  onClose: () => void
  activePanel?: string
}

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; url?: string; number?: number }
  | { status: 'error'; message: string }

export function BugReportModal({ open, onClose, activePanel }: BugReportModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [state, setState] = useState<SubmitState>({ status: 'idle' })

  const handleClose = useCallback(() => {
    if (state.status === 'submitting') return
    setTitle('')
    setDescription('')
    setState({ status: 'idle' })
    onClose()
  }, [state.status, onClose])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleClose])

  if (!open) return null

  const canSubmit =
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    state.status !== 'submitting'

  const handleSubmit = async () => {
    if (!canSubmit) return
    setState({ status: 'submitting' })
    try {
      const res = await window.daemon.feedback.submit({
        title: title.trim(),
        description: description.trim(),
        activePanel,
      })
      if (res.ok && res.data) {
        setState({ status: 'success', url: res.data.url, number: res.data.number })
      } else {
        setState({ status: 'error', message: res.error ?? 'Submission failed' })
      }
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Submission failed',
      })
    }
  }

  const handleOpenIssue = () => {
    if (state.status === 'success' && state.url) {
      window.daemon.feedback.openUrl(state.url)
    }
  }

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-labelledby="bug-report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="bug-report-title" className={styles.title}>
            Report a bug
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={handleClose}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {state.status === 'success' ? (
          <div className={styles.body}>
            <div className={styles.successBlock}>
              <div className={styles.successDot} />
              <p className={styles.successText}>
                Reported as issue #{state.number}. Thanks for helping make DAEMON better.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={handleClose}
                >
                  Close
                </button>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={handleOpenIssue}
                >
                  View on GitHub
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.body}>
            <label className={styles.label}>
              <span className={styles.labelText}>Title</span>
              <input
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary of the issue"
                maxLength={200}
                disabled={state.status === 'submitting'}
                autoFocus
              />
            </label>

            <label className={styles.label}>
              <span className={styles.labelText}>What happened?</span>
              <textarea
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Steps to reproduce, what you expected, what happened instead"
                rows={8}
                maxLength={8000}
                disabled={state.status === 'submitting'}
              />
            </label>

            <p className={styles.hint}>
              Your DAEMON version, OS, and environment details are attached automatically.
              No personal data is sent.
            </p>

            {state.status === 'error' && (
              <p className={styles.error}>{state.message}</p>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={handleClose}
                disabled={state.status === 'submitting'}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {state.status === 'submitting' ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

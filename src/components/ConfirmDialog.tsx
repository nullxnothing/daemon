import { useEffect, useRef, useState } from 'react'
import { useConfirmStore } from '../store/confirm'
import './ConfirmDialog.css'

export function ConfirmDialog() {
  const current = useConfirmStore((s) => s.current)
  const resolve = useConfirmStore((s) => s.resolve)
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setTyped('')
    if (current) {
      // Focus the input if a typed confirmation is required, otherwise the confirm button
      requestAnimationFrame(() => {
        if (current.typedConfirmation) inputRef.current?.focus()
        else confirmBtnRef.current?.focus()
      })
    }
  }, [current])

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        resolve(false)
      } else if (e.key === 'Enter' && !current.typedConfirmation) {
        e.preventDefault()
        resolve(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, resolve])

  if (!current) return null

  const typedOk = !current.typedConfirmation || typed === current.typedConfirmation
  const confirmLabel = current.confirmLabel ?? (current.danger ? 'Delete' : 'Confirm')
  const cancelLabel = current.cancelLabel ?? 'Cancel'

  return (
    <div className="confirm-overlay" onClick={() => resolve(false)} role="presentation">
      <div
        className={`confirm-dialog ${current.danger ? 'danger' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div id="confirm-title" className="confirm-title">{current.title}</div>
        {current.body && <div className="confirm-body">{current.body}</div>}

        {current.typedConfirmation && (
          <div className="confirm-typed-row">
            <label className="confirm-typed-label">
              Type <code>{current.typedConfirmation}</code> to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="confirm-typed-input"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        )}

        <div className="confirm-actions">
          <button type="button" className="confirm-btn-cancel" onClick={() => resolve(false)}>
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            className={`confirm-btn-confirm ${current.danger ? 'danger' : ''}`}
            onClick={() => resolve(true)}
            disabled={!typedOk}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

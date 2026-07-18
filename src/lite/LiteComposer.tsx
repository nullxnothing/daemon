import { useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { ArrowUp } from '@phosphor-icons/react'
import { ModelDropdown } from '../components/Panel'
import styles from './LiteComposer.module.css'

interface LiteComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  autoFocus?: boolean
}

/** Cursor-style composer: large rounded card, textarea on top, mode chip +
 *  model picker + send arrow on the bottom row. */
export function LiteComposer({ value, onChange, onSend, placeholder, ariaLabel = 'Message ARIA', disabled, autoFocus }: LiteComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!disabled && value.trim()) onSend()
  }

  return (
    <div className={styles.composer}>
      <textarea
        ref={inputRef}
        className={styles.input}
        value={value}
        placeholder={placeholder ?? 'Ask anything…'}
        aria-label={ariaLabel}
        disabled={disabled}
        rows={2}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={styles.row}>
        <ModelDropdown className={styles.model} />
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.send}
          disabled={disabled || !value.trim()}
          onClick={onSend}
          title="Send"
          aria-label="Send"
        >
          <ArrowUp size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

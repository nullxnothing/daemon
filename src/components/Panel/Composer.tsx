import type { KeyboardEvent, ReactNode } from 'react'
import styles from './Composer.module.css'

interface ComposerContextItem {
  id: string
  label: ReactNode
}

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  sendLabel?: ReactNode
  disabled?: boolean
  model?: ReactNode
  context?: ComposerContextItem[]
  onRemoveContext?: (id: string) => void
  onAddContext?: () => void
  footerStart?: ReactNode
  className?: string
}

export function Composer({
  value,
  onChange,
  onSend,
  placeholder = 'Ask DAEMON AI about this project...',
  sendLabel = 'Send',
  disabled,
  model,
  context = [],
  onRemoveContext,
  onAddContext,
  footerStart,
  className,
}: ComposerProps) {
  const classes = [styles.composer, className].filter(Boolean).join(' ')

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!disabled && value.trim()) onSend()
  }

  const hasContext = Boolean(footerStart) || context.length > 0 || Boolean(onAddContext)

  return (
    <div className={classes}>
      {hasContext ? (
        <div className={styles.context}>
          {footerStart}
          {context.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.contextChip}
              onClick={() => onRemoveContext?.(item.id)}
            >
              {item.label}
            </button>
          ))}
          {onAddContext ? (
            <button type="button" className={styles.contextChip} onClick={onAddContext}>
              + Add context
            </button>
          ) : null}
        </div>
      ) : null}

      <textarea
        className={styles.input}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />

      <div className={styles.footer}>
        {model ? <span className={styles.model}>{model}</span> : null}
        <span className={styles.spacer} />
        <button type="button" className={styles.send} disabled={disabled || !value.trim()} onClick={onSend}>
          {sendLabel}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}

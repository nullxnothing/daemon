import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import styles from './Composer.module.css'

interface ComposerContextItem {
  id: string
  label: ReactNode
}

/** A toggleable context option shown in the "+" popover menu. */
export interface ComposerContextOption {
  id: string
  label: string
  active: boolean
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
  /** When provided, the "+" opens a menu of these options instead of cycling. */
  contextMenu?: ComposerContextOption[]
  onToggleContext?: (id: string, active: boolean) => void
  footerStart?: ReactNode
  /** Render the send button as a compact up-arrow icon instead of a text label. */
  sendIcon?: boolean
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
  contextMenu,
  onToggleContext,
  footerStart,
  sendIcon = false,
  className,
}: ComposerProps) {
  const classes = [styles.composer, className].filter(Boolean).join(' ')

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!disabled && value.trim()) onSend()
  }

  const hasMenu = Boolean(contextMenu && onToggleContext)
  const hasPlus = hasMenu || Boolean(onAddContext)
  // In sendIcon mode the "+" lives in the footer toolbar, so the inline
  // "+ Add context" chip is suppressed to avoid a duplicate affordance.
  const showInlineAdd = Boolean(onAddContext) && !hasMenu && !sendIcon
  const hasContext = Boolean(footerStart) || context.length > 0 || showInlineAdd

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
          {showInlineAdd ? (
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
        {hasPlus ? (
          <div className={styles.toolMenu} ref={menuRef}>
            <button
              type="button"
              className={styles.toolBtn}
              title="Add context"
              aria-haspopup={hasMenu ? 'menu' : undefined}
              aria-expanded={hasMenu ? menuOpen : undefined}
              onClick={() => (hasMenu ? setMenuOpen((v) => !v) : onAddContext?.())}
            >+</button>
            {hasMenu && menuOpen ? (
              <div className={styles.contextPopover} role="menu">
                <div className={styles.contextPopoverHead}>Add context</div>
                {contextMenu!.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={opt.active}
                    className={styles.contextOption}
                    onClick={() => onToggleContext!(opt.id, !opt.active)}
                  >
                    <span className={styles.contextCheck} data-on={opt.active ? 'true' : 'false'} aria-hidden>
                      {opt.active ? '✓' : ''}
                    </span>
                    <span className={styles.contextOptionLabel}>{opt.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {model ? <span className={styles.model}>{model}</span> : null}
        <span className={styles.spacer} />
        {sendIcon ? (
          <button
            type="button"
            className={styles.sendIcon}
            disabled={disabled || !value.trim()}
            onClick={onSend}
            title="Send"
            aria-label="Send"
          >
            <span aria-hidden="true">↑</span>
          </button>
        ) : (
          <button type="button" className={styles.send} disabled={disabled || !value.trim()} onClick={onSend}>
            {sendLabel}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  )
}

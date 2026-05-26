import type { ReactNode } from 'react'
import { useClipboard } from '../hooks/useClipboard'
import { LiveRegion } from './LiveRegion'
import './CopyButton.css'

interface CopyButtonProps {
  /** Text to copy to the clipboard. */
  value: string
  /** Optional visible label. When omitted, renders an icon-only button. */
  label?: string
  /** Label shown for the confirmation flash. Defaults to "Copied". */
  copiedLabel?: string
  /** What the button copies, for the screen-reader announcement & aria-label. */
  ariaItem?: string
  className?: string
  /** Custom children replace the default icon/label entirely. */
  children?: ReactNode
}

const CopyGlyph = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const CheckGlyph = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export function CopyButton({
  value,
  label,
  copiedLabel = 'Copied',
  ariaItem,
  className,
  children,
}: CopyButtonProps) {
  const { copied, copy } = useClipboard()
  const itemName = ariaItem ?? label ?? 'value'
  const classes = ['copy-button', copied ? 'copy-button--copied' : '', className].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={classes}
      onClick={() => void copy(value)}
      aria-label={copied ? `${itemName} copied` : `Copy ${itemName}`}
      title={copied ? copiedLabel : `Copy ${itemName}`}
    >
      <span className="copy-button-icon" aria-hidden="true">
        {copied ? CheckGlyph : CopyGlyph}
      </span>
      {children ?? (label && <span className="copy-button-label">{copied ? copiedLabel : label}</span>)}
      <LiveRegion message={copied ? `${itemName} copied to clipboard` : ''} />
    </button>
  )
}

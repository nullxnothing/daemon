import { useEffect, type ReactNode } from 'react'
import { Icon } from '../icons'
import styles from '../WalletWorkspace.module.css'

interface SheetProps {
  title: string
  eyebrow?: string
  width?: number
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Sheet({ title, eyebrow, width = 440, onClose, children, footer }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className={styles.scrim}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={styles.sheet} style={{ width }}>
        <header className={styles.sheetHead}>
          <div className={styles.sheetId}>
            {eyebrow && <span className={styles.label} style={{ color: 'var(--green)' }}>{eyebrow}</span>}
            <div className={styles.sheetTtl}>{title}</div>
          </div>
          <button className={styles.iconbtn} onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </header>
        <div className={styles.sheetBody}>{children}</div>
        {footer && <footer className={styles.sheetFoot}>{footer}</footer>}
      </div>
    </div>
  )
}

export interface SheetWallet {
  id: string
  name: string
  address: string
  totalUsd: number
  isDefault: boolean
  isAgent: boolean
  canSign: boolean
  holdings: Array<{ mint: string; symbol: string; name: string; amount: number; valueUsd: number; logoUri: string | null }>
}

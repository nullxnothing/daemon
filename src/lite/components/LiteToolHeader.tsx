import type { ReactNode } from 'react'
import type { Icon } from '@phosphor-icons/react'
import styles from './LiteToolHeader.module.css'

interface LiteToolHeaderProps {
  icon: Icon
  title: string
  subtitle?: string
  action?: ReactNode
}

/** Shared header for the Lite tool panels (Wallet / Trade / Scanner). */
export function LiteToolHeader({ icon: Glyph, title, subtitle, action }: LiteToolHeaderProps) {
  return (
    <header className={styles.header}>
      <span className={styles.icon}><Glyph size={18} aria-hidden="true" /></span>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </header>
  )
}

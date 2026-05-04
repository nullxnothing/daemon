import type { ReactNode } from 'react'
import styles from './KeyHint.module.css'

interface KeyHintProps {
  children: ReactNode
  className?: string
}

export function KeyHint({ children, className }: KeyHintProps) {
  const classes = [styles.key, className].filter(Boolean).join(' ')
  return <kbd className={classes}>{children}</kbd>
}

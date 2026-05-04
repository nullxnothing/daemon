import type { ReactNode } from 'react'
import styles from './Toolbar.module.css'

interface ToolbarProps {
  children: ReactNode
  align?: 'start' | 'end' | 'between'
  className?: string
}

export function Toolbar({ children, align = 'end', className }: ToolbarProps) {
  const classes = [styles.toolbar, styles[align], className].filter(Boolean).join(' ')
  return <div className={classes}>{children}</div>
}

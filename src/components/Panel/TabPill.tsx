import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './TabPill.module.css'

interface TabPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  children: ReactNode
}

export function TabPill({ active, className, children, ...props }: TabPillProps) {
  const classes = [styles.pill, active ? styles.active : undefined, className].filter(Boolean).join(' ')
  return (
    <button className={classes} type="button" aria-pressed={active} {...props}>
      {children}
    </button>
  )
}

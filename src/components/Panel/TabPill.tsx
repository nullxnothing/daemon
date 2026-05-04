import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import styles from './TabPill.module.css'

type TabSize = 'sm' | 'md'
type TabVariant = 'pill' | 'underline'

interface TabPillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  size?: TabSize
  variant?: TabVariant
  children: ReactNode
}

export function TabPill({
  active,
  size = 'sm',
  variant = 'pill',
  className,
  children,
  ...props
}: TabPillProps) {
  const classes = [
    styles.pill,
    size === 'md' ? styles.sizeMd : undefined,
    variant === 'underline' ? styles.variantUnderline : undefined,
    active ? styles.active : undefined,
    className,
  ].filter(Boolean).join(' ')

  return (
    <button className={classes} type="button" role="tab" aria-selected={active} {...props}>
      {children}
    </button>
  )
}

interface TabPillRowProps extends HTMLAttributes<HTMLDivElement> {
  variant?: TabVariant
  children: ReactNode
}

export function TabPillRow({ variant = 'pill', className, children, ...props }: TabPillRowProps) {
  const classes = [
    styles.row,
    variant === 'underline' ? styles.rowUnderline : undefined,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div role="tablist" className={classes} {...props}>
      {children}
    </div>
  )
}

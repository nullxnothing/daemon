import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Card.module.css'

type CardTone = 'default' | 'success' | 'warn' | 'danger' | 'info'
type CardPadding = 'sm' | 'md' | 'lg' | 'flush'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone
  padding?: CardPadding
  interactive?: boolean
  selected?: boolean
  children?: ReactNode
}

const TONE_CLASS: Record<CardTone, string | undefined> = {
  default: undefined,
  success: styles.success,
  warn: styles.warn,
  danger: styles.danger,
  info: styles.info,
}

const PADDING_CLASS: Record<CardPadding, string | undefined> = {
  sm: styles['padded-sm'],
  md: undefined,
  lg: styles['padded-lg'],
  flush: styles.flush,
}

export function Card({
  tone = 'default',
  padding = 'md',
  interactive,
  selected,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    TONE_CLASS[tone],
    PADDING_CLASS[padding],
    interactive ? styles.interactive : undefined,
    selected ? styles.selected : undefined,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}

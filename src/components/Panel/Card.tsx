import type { HTMLAttributes, ReactNode } from 'react'
import { Surface } from './Surface'
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

export function Card({
  tone = 'default',
  padding = 'md',
  interactive,
  selected,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [styles.card, className].filter(Boolean).join(' ')

  return (
    <Surface
      tone={tone === 'warn' ? 'warning' : tone}
      padding={padding}
      interactive={interactive}
      selected={selected}
      className={classes}
      {...rest}
    >
      {children}
    </Surface>
  )
}

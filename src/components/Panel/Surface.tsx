import type { HTMLAttributes, ReactNode } from 'react'
import styles from './Surface.module.css'

type SurfaceVariant = 'card' | 'feature' | 'well'
type SurfacePadding = 'sm' | 'md' | 'lg' | 'flush'
type SurfaceTone = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'feature'

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant
  padding?: SurfacePadding
  tone?: SurfaceTone
  interactive?: boolean
  selected?: boolean
  children?: ReactNode
}

export function Surface({
  variant = 'card',
  padding = 'md',
  tone = 'default',
  interactive,
  selected,
  className,
  children,
  ...rest
}: SurfaceProps) {
  const classes = [
    styles.surface,
    styles[`variant-${variant}`],
    styles[`padding-${padding}`],
    tone !== 'default' ? styles[`tone-${tone}`] : undefined,
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

import type { ReactNode } from 'react'
import styles from './Banner.module.css'

type BannerTone = 'info' | 'success' | 'warn' | 'danger'

interface BannerProps {
  tone?: BannerTone
  children: ReactNode
  actions?: ReactNode
  className?: string
}

export function Banner({ tone = 'info', children, actions, className }: BannerProps) {
  const classes = [styles.banner, styles[tone], className].filter(Boolean).join(' ')

  return (
    <div className={classes} role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}>
      <div className={styles.content}>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  )
}

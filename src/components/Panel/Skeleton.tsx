import type { HTMLAttributes } from 'react'
import styles from './Skeleton.module.css'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string
  height?: string
}

export function Skeleton({ width, height, className, style, ...props }: SkeletonProps) {
  const classes = [styles.skeleton, className].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...props}
    />
  )
}

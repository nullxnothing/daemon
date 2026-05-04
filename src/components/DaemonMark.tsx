import type { CSSProperties } from 'react'

interface DaemonMarkProps {
  size?: number
  className?: string
  style?: CSSProperties
}

export function DaemonMark({ size = 18, className, style }: DaemonMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="120 104 520 520"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d="M160 128H470C522.21 128 564.53 170.32 564.53 222.53V364H254.53C202.32 364 160 321.68 160 269.47V128Z" />
      <path d="M311 405H608V514.47C608 566.68 565.68 609 513.47 609H311V405Z" />
    </svg>
  )
}

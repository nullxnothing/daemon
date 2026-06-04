import type { CSSProperties } from 'react'
import styles from './WalletWorkspace.module.css'

const ICON_PATHS = {
  copy: 'M9 9h11v11H9zM5 15V5a1 1 0 0 1 1-1h9',
  check: 'M5 13l4 4L19 7',
  send: 'M12 19V5M5 12l7-7 7 7',
  receive: 'M12 5v14M5 12l7 7 7-7',
  swap: 'M8 4v13M5 14l3 3 3-3M16 20V7M13 10l3-3 3 3',
  plus: 'M12 5v14M5 12h14',
  key: 'M14 7a4 4 0 1 0-3.5 6.9L9 15.5 7.5 17 6 18.5 4.5 17 6 15.5l4.5-1.6A4 4 0 0 0 14 7z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.2-3.2',
  chev: 'M6 9l6 6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M10 6H5v13h13v-5',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  x: 'M6 6l12 12M18 6L6 18',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  card: 'M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM3 10h18',
  spark: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
} as const

export type IconName = keyof typeof ICON_PATHS

export function Icon({ name, size = 14, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return (
    <svg
      className={styles.ico}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      stroke="currentColor"
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

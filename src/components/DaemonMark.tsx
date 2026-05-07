import type { SVGProps } from 'react'

export function DaemonMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 1000 1000" fill="none" aria-hidden="true" focusable="false" {...props}>
      <path
        d="M208 87H598C705.14 87 792 173.86 792 281V472H389C289.04 472 208 390.96 208 291V87Z"
        fill="currentColor"
      />
      <path
        d="M792 529V722C792 828.04 706.04 914 600 914H405V725C405 616.75 492.75 529 601 529H792Z"
        fill="currentColor"
      />
    </svg>
  )
}

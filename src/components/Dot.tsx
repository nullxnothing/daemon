interface DotProps {
  color: 'green' | 'amber' | 'red' | 'off'
  size?: number
}

const COLOR_MAP: Record<DotProps['color'], string> = {
  green: 'var(--green)',
  amber: 'var(--amber)',
  red: 'var(--red)',
  off: 'var(--t3)',
}

export function Dot({ color, size = 5 }: DotProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: COLOR_MAP[color],
        flexShrink: 0,
      }}
    />
  )
}

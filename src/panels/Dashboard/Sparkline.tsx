interface SparklineProps {
  points: number[]
  width: number
  height: number
  color?: string
  strokeWidth?: number
}

export function Sparkline({ points, width, height, color = 'var(--green)', strokeWidth = 1.5 }: SparklineProps) {
  if (points.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={0} y1={height / 2}
          x2={width} y2={height / 2}
          stroke="var(--s5)" strokeWidth={1}
        />
      </svg>
    )
  }

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1

  const padX = 2
  const padY = 4
  const drawW = width - padX * 2
  const drawH = height - padY * 2

  const toX = (i: number) => padX + (i / (points.length - 1)) * drawW
  const toY = (v: number) => padY + (1 - (v - min) / range) * drawH

  const pathD = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(' ')

  // Fill area under curve
  const lastX = toX(points.length - 1).toFixed(1)
  const firstX = toX(0).toFixed(1)
  const bottomY = (padY + drawH).toFixed(1)
  const fillD = `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`spark-fill-${width}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#spark-fill-${width})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

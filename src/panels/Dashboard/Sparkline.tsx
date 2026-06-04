interface SparklineProps {
  points: number[]
  width: number
  height: number
  /** Single signal color for the line + faint area wash. Defaults to the one green. */
  color?: string
  strokeWidth?: number
  /** Schematic axis hairlines (mockup grammar). Off for the dense mini view. */
  axes?: boolean
}

const AREA_FILL_PCT = 7

/**
 * Single-color schematic chart per the design system data-viz rule:
 * one stroke (var(--green) by default), an optional ~7% flat wash, axes in
 * var(--line). No multi-series, no gradient fill.
 */
export function Sparkline({ points, width, height, color = 'var(--green)', strokeWidth = 1.5, axes = false }: SparklineProps) {
  if (points.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="var(--line)" strokeWidth={1} />
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

  const lastX = toX(points.length - 1).toFixed(1)
  const firstX = toX(0).toFixed(1)
  const bottomY = (padY + drawH).toFixed(1)
  const fillD = `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`

  const areaFill = `color-mix(in srgb, ${color} ${AREA_FILL_PCT}%, transparent)`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {axes && (
        <>
          <line x1={0} y1={drawH * 0.25 + padY} x2={width} y2={drawH * 0.25 + padY} stroke="var(--line)" strokeWidth={1} />
          <line x1={0} y1={drawH * 0.5 + padY} x2={width} y2={drawH * 0.5 + padY} stroke="var(--line)" strokeWidth={1} />
          <line x1={0} y1={drawH * 0.75 + padY} x2={width} y2={drawH * 0.75 + padY} stroke="var(--line)" strokeWidth={1} />
        </>
      )}
      <path d={fillD} fill={areaFill} stroke="none" />
      <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

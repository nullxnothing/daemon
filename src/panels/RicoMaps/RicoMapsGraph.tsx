import { useEffect, useMemo, useRef, useState } from 'react'
import type { ForensicsGraphData, ForensicsGraphNode } from '../../types/daemon'

interface RicoMapsGraphProps {
  data: ForensicsGraphData | null
  selectedId: string | null
  onSelect: (node: ForensicsGraphNode) => void
}

interface LayoutNode extends ForensicsGraphNode {
  x: number
  y: number
  r: number
  cluster: number
}

const COLOR_TOKENS: Record<string, string> = {
  target: '--green',
  token: '--amber',
  holder: '--success',
  funder: '--blue',
  funded: '--solana',
  connected: '--warning',
  'cabal-funder': '--red',
  sniper: '--info',
  bundled: '--solana',
}

function buildClusters(data: ForensicsGraphData): Map<string, number> {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id)
    const current = parent.get(id)!
    if (current !== id) parent.set(id, find(current))
    return parent.get(id)!
  }
  const join = (a: string, b: string) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  for (const node of data.nodes) parent.set(node.id, node.id)
  for (const link of data.links) join(link.source, link.target)

  const roots = new Map<string, number>()
  const clusters = new Map<string, number>()
  for (const node of data.nodes) {
    const root = find(node.id)
    if (!roots.has(root)) roots.set(root, roots.size)
    clusters.set(node.id, roots.get(root)!)
  }
  return clusters
}

function layout(data: ForensicsGraphData, width: number, height: number): LayoutNode[] {
  const clusters = buildClusters(data)
  const centerX = width / 2
  const centerY = height / 2
  const maxAmount = Math.max(...data.nodes.map((node) => node.tokenAmount ?? node.solBalance ?? node.val), 1)
  const byDepth = new Map<number, ForensicsGraphNode[]>()

  for (const node of data.nodes) {
    const bucket = byDepth.get(node.depth) ?? []
    bucket.push(node)
    byDepth.set(node.depth, bucket)
  }

  return data.nodes.map((node) => {
    const peers = byDepth.get(node.depth) ?? []
    const index = peers.findIndex((peer) => peer.id === node.id)
    const count = Math.max(peers.length, 1)
    const amount = node.tokenAmount ?? node.solBalance ?? node.val
    const radius = Math.max(8, Math.min(42, 8 + Math.sqrt(amount / maxAmount) * 34))
    const depthRadius = node.depth === 0 ? 0 : Math.min(width, height) * (0.18 + node.depth * 0.16)
    const clusterOffset = (clusters.get(node.id) ?? 0) * 0.55
    const angle = (index / count) * Math.PI * 2 + clusterOffset
    return {
      ...node,
      r: node.depth === 0 ? Math.max(radius, 28) : radius,
      x: centerX + Math.cos(angle) * depthRadius,
      y: centerY + Math.sin(angle) * depthRadius,
      cluster: clusters.get(node.id) ?? 0,
    }
  })
}

export function RicoMapsGraph({ data, selectedId, onSelect }: RicoMapsGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<LayoutNode[]>([])
  const [hovered, setHovered] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 900, height: 520 })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const resize = () => setSize({ width: wrap.clientWidth, height: wrap.clientHeight })
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const nodes = useMemo(() => {
    if (!data || data.nodes.length === 0) return []
    return layout(data, size.width, size.height)
  }, [data, size])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const styles = getComputedStyle(document.documentElement)
    const tokenColor = (token: string) => styles.getPropertyValue(token).trim() || 'white'
    const palette = Object.fromEntries(
      Object.entries(COLOR_TOKENS).map(([type, token]) => [type, tokenColor(token)]),
    )
    const surfaceColor = tokenColor('--surface-flat')
    const suspiciousColor = tokenColor('--red')
    const liveColor = tokenColor('--green')
    const labelColor = tokenColor('--t1')
    const fallbackNodeColor = tokenColor('--t3')

    let frame = 0
    let raf = 0
    const draw = () => {
      frame += 1
      ctx.clearRect(0, 0, size.width, size.height)
      ctx.fillStyle = surfaceColor
      ctx.fillRect(0, 0, size.width, size.height)

      const nodeMap = new Map(nodesRef.current.map((node) => [node.id, node]))
      for (const link of data.links) {
        const source = nodeMap.get(link.source)
        const target = nodeMap.get(link.target)
        if (!source || !target) continue
        const isHot = hovered === source.id || hovered === target.id || selectedId === source.id || selectedId === target.id
        ctx.strokeStyle = link.suspicious
          ? toRgba(suspiciousColor, isHot ? 0.78 : 0.42)
          : toRgba(liveColor, isHot ? 0.34 : 0.15)
        ctx.lineWidth = link.suspicious ? 1.4 : 1
        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.stroke()

        if (isHot || link.suspicious) {
          const t = ((frame % 150) / 150)
          const px = source.x + (target.x - source.x) * t
          const py = source.y + (target.y - source.y) * t
          ctx.fillStyle = link.suspicious ? suspiciousColor : liveColor
          ctx.beginPath()
          ctx.arc(px, py, 2.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      for (const node of nodesRef.current) {
        const color = palette[node.type] ?? fallbackNodeColor
        const active = selectedId === node.id || hovered === node.id
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.r + (active ? 8 : 4), 0, Math.PI * 2)
        ctx.fillStyle = toRgba(color, active ? 0.18 : 0.08)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
        ctx.fillStyle = toRgba(color, 0.14)
        ctx.fill()
        ctx.lineWidth = active ? 2.4 : 1.2
        ctx.strokeStyle = active ? color : toRgba(color, 0.66)
        ctx.stroke()
        if (node.r > 18) {
          ctx.fillStyle = labelColor
          ctx.font = '10px Geist Mono, JetBrains Mono, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(node.type === 'token' ? (node.label || 'TOKEN').slice(0, 8) : amountLabel(node), node.x, node.y)
        }
      }

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [data, hovered, nodes, selectedId, size])

  const findNode = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const x = clientX - rect.left
    const y = clientY - rect.top
    return [...nodesRef.current].reverse().find((node) => {
      const dx = x - node.x
      const dy = y - node.y
      return dx * dx + dy * dy <= node.r * node.r
    }) ?? null
  }

  return (
    <div ref={wrapRef} className="ricomaps-graph">
      {data && data.nodes.length > 0 ? (
        <canvas
          ref={canvasRef}
          onMouseMove={(event) => setHovered(findNode(event.clientX, event.clientY)?.id ?? null)}
          onMouseLeave={() => setHovered(null)}
          onClick={(event) => {
            const node = findNode(event.clientX, event.clientY)
            if (node) onSelect(node)
          }}
        />
      ) : (
        <div className="ricomaps-graph-empty">No scan loaded</div>
      )}
    </div>
  )
}

function amountLabel(node: ForensicsGraphNode): string {
  const value = node.tokenAmount ?? node.solBalance ?? 0
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  if (value >= 1) return value.toFixed(1)
  return '<1'
}

function toRgba(color: string, alpha: number): string {
  const value = color.trim()
  if (value.startsWith('#')) {
    const hex = value.slice(1)
    const normalized = hex.length === 3
      ? hex.split('').map((char) => char + char).join('')
      : hex.padEnd(6, '0').slice(0, 6)
    const red = Number.parseInt(normalized.slice(0, 2), 16)
    const green = Number.parseInt(normalized.slice(2, 4), 16)
    const blue = Number.parseInt(normalized.slice(4, 6), 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }

  const match = value.match(/rgba?\(([^)]+)\)/)
  if (match) {
    const [red, green, blue] = match[1].split(',').map((part) => part.trim())
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }

  return value
}

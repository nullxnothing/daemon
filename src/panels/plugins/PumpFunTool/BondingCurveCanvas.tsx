import { useRef, useEffect, useCallback } from 'react'
import { PUMP_FUN_CURVE_COLORS } from '../../../styles/daemonTheme'

interface BondingCurveData {
  virtualSolReserves: string
  virtualTokenReserves: string
  realSolReserves: string
  realTokenReserves: string
  graduationBps: number
  isGraduated: boolean
}

interface Props {
  curve: BondingCurveData
  tradeAction?: 'buy' | 'sell'
  tradeAmountSol?: number
}

// Pump.fun constant-product curve: price = solReserves / tokenReserves
// As tokens are bought, tokenReserves decreases and price rises

const COLORS = PUMP_FUN_CURVE_COLORS

export function BondingCurveCanvas({ curve, tradeAction, tradeAmountSol }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef(0)
  const startTimeRef = useRef(performance.now())

  const draw = useCallback((now: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const elapsed = now - startTimeRef.current

    // Padding
    const px = 8
    const pt = 6
    const pb = 4
    const pr = 8
    const plotW = w - px - pr
    const plotH = h - pt - pb

    ctx.clearRect(0, 0, w, h)

    // Parse reserves — bail if curve is drained (graduated or transitional)
    const vSol = Number(curve.virtualSolReserves)
    const vToken = Number(curve.virtualTokenReserves)
    if (!Number.isFinite(vSol) || !Number.isFinite(vToken) || vSol <= 0 || vToken <= 0) {
      ctx.font = '10px "JetBrains Mono", monospace'
      ctx.fillStyle = COLORS.gradLabel
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(curve.isGraduated ? 'Graduated' : 'No curve data', w / 2, h / 2)
      return
    }

    const k = vSol * vToken // constant product

    // Determine the x-axis range (tokens sold from bonding curve)
    // Total token supply on curve: ~1.073B for pump.fun
    // realTokenReserves = tokens still available on curve
    const realTokens = Number(curve.realTokenReserves)
    const totalCurveTokens = vToken // virtual reserves at start ≈ total
    const tokensSold = totalCurveTokens - Number(curve.virtualTokenReserves) + (totalCurveTokens - realTokens)

    // We'll plot from 0% to 110% of graduation to show headroom
    // Graduation happens at ~100% (10000 bps)
    const gradProgress = curve.graduationBps / 10000
    const maxProgress = Math.max(gradProgress + 0.15, 0.3) // show at least 30% of curve

    // Curve function: given progress t (0-1), compute price
    // price(t) = k / (totalTokens * (1 - t * gradFraction))^2 ... simplified
    // For visual purposes: price grows as tokens are sold
    // Use a clean power curve that matches the visual behavior
    const curvePoints = 120
    const prices: number[] = []
    let maxPrice = 0

    for (let i = 0; i <= curvePoints; i++) {
      const t = (i / curvePoints) * maxProgress
      // Constant product price model: price = solReserves / tokenReserves
      // As fraction t of tokens sold: tokenReserves = vToken * (1 - t)
      // solReserves = k / tokenReserves = k / (vToken * (1 - t))
      // price = solReserves / tokenReserves = k / (vToken * (1 - t))^2
      const remaining = Math.max(1 - t, 0.001)
      const price = k / (vToken * remaining * (vToken * remaining))
      prices.push(price)
      if (price > maxPrice) maxPrice = price
    }

    // Scale prices to plot area
    const scaleX = (t: number) => px + (t / maxProgress) * plotW
    const scaleY = (price: number) => pt + plotH - (price / maxPrice) * plotH * 0.88 // 88% height to leave headroom

    // Draw fill gradient under curve
    const fillGrad = ctx.createLinearGradient(0, pt, 0, pt + plotH)
    fillGrad.addColorStop(0, COLORS.fillTop)
    fillGrad.addColorStop(0.5, COLORS.fillBottom)
    fillGrad.addColorStop(1, 'transparent')

    ctx.beginPath()
    ctx.moveTo(scaleX(0), pt + plotH)
    for (let i = 0; i <= curvePoints; i++) {
      const t = (i / curvePoints) * maxProgress
      ctx.lineTo(scaleX(t), scaleY(prices[i]))
    }
    ctx.lineTo(scaleX(maxProgress), pt + plotH)
    ctx.closePath()
    ctx.fillStyle = fillGrad
    ctx.fill()

    // Trade impact zone
    if (tradeAmountSol && tradeAmountSol > 0 && tradeAction) {
      const currentT = gradProgress
      // Estimate impact: amountSol changes reserves
      const impactFraction = tradeAmountSol / (vSol * 2) // rough visual estimate
      const impactT = tradeAction === 'buy'
        ? Math.min(currentT + impactFraction, maxProgress)
        : Math.max(currentT - impactFraction, 0)

      const startT = Math.min(currentT, impactT)
      const endT = Math.max(currentT, impactT)

      ctx.beginPath()
      ctx.moveTo(scaleX(startT), pt + plotH)
      // Walk along the curve from startT to endT
      const impactSteps = 30
      for (let i = 0; i <= impactSteps; i++) {
        const t = startT + (i / impactSteps) * (endT - startT)
        const remaining = Math.max(1 - t, 0.001)
        const price = k / (vToken * remaining * (vToken * remaining))
        ctx.lineTo(scaleX(t), scaleY(price))
      }
      ctx.lineTo(scaleX(endT), pt + plotH)
      ctx.closePath()
      ctx.fillStyle = tradeAction === 'buy' ? COLORS.impactBuy : COLORS.impactSell
      ctx.fill()
    }

    // Graduation threshold line
    if (gradProgress < maxProgress) {
      const gradX = scaleX(1.0) // graduation at 100%
      if (gradX >= px && gradX <= px + plotW) {
        ctx.beginPath()
        ctx.setLineDash([3, 4])
        ctx.moveTo(gradX, pt)
        ctx.lineTo(gradX, pt + plotH)
        ctx.strokeStyle = COLORS.gradLine
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.setLineDash([])

        ctx.font = '8px "JetBrains Mono", monospace'
        ctx.fillStyle = COLORS.gradLabel
        ctx.textAlign = 'center'
        ctx.fillText('grad', gradX, pt + plotH - 2)
      }
    }

    // Draw curve line with gradient
    ctx.beginPath()
    for (let i = 0; i <= curvePoints; i++) {
      const t = (i / curvePoints) * maxProgress
      const x = scaleX(t)
      const y = scaleY(prices[i])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }

    const lineGrad = ctx.createLinearGradient(px, 0, px + plotW, 0)
    lineGrad.addColorStop(0, COLORS.curveLine)
    lineGrad.addColorStop(0.7, COLORS.curveLine)
    lineGrad.addColorStop(1, COLORS.curveLineTop)
    ctx.strokeStyle = lineGrad
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Current position dot
    const currentX = scaleX(gradProgress)
    const currentRemaining = Math.max(1 - gradProgress, 0.001)
    const currentPrice = k / (vToken * currentRemaining * (vToken * currentRemaining))
    const currentY = scaleY(currentPrice)

    // Pulsing glow
    const pulse = 0.6 + 0.4 * Math.sin(elapsed * 0.003)
    ctx.globalAlpha = 0.15 * pulse
    ctx.beginPath()
    ctx.arc(currentX, currentY, 10, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.dot
    ctx.fill()

    ctx.globalAlpha = 0.3 * pulse
    ctx.beginPath()
    ctx.arc(currentX, currentY, 6, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.dot
    ctx.fill()

    // Solid dot
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(currentX, currentY, 3, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.dot
    ctx.fill()

    // Thin crosshair lines from dot to edges
    ctx.globalAlpha = 0.15
    ctx.beginPath()
    ctx.setLineDash([2, 3])
    // Horizontal to left edge
    ctx.moveTo(px, currentY)
    ctx.lineTo(currentX - 8, currentY)
    // Vertical to bottom
    ctx.moveTo(currentX, currentY + 8)
    ctx.lineTo(currentX, pt + plotH)
    ctx.strokeStyle = COLORS.priceLine
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1

    rafRef.current = requestAnimationFrame(draw)
  }, [curve, tradeAction, tradeAmountSol])

  useEffect(() => {
    startTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="pf-curve-canvas"
    />
  )
}

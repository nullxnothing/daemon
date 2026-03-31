const TAU = Math.PI * 2
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

const COLORS = [
  '#2a2a2a', // 0 idle        (--s5)
  '#7a7a7a', // 1 scanning    (--t2)
  '#4a8c62', // 2 has funds   (--green)
  '#8c7a4a', // 3 processing  (--amber)
  '#ebebeb', // 4 complete    (--t1)
  '#8c4a4a', // 5 failed      (--red)
]

const GLOW_STATES = new Set([1, 2, 3])
const PULSE_STATES = new Set([1, 3])

interface ActiveFlow {
  nodeIndex: number
  startTime: number
  amount: number
  ctrlX: number
  ctrlY: number
}

export class RecoveryRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private rafId = 0
  private running = false

  private count = 0
  private posX = new Float32Array(0)
  private posY = new Float32Array(0)
  private states: Uint8Array<ArrayBuffer> = new Uint8Array(0)

  private cx = 0
  private cy = 0
  private w = 0
  private h = 0
  private dpr = 1
  private nodeRadius = 3
  private centerRadius = 14

  private flows: ActiveFlow[] = []
  private totalRecovered = 0

  init(canvas: HTMLCanvasElement, count: number) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.count = count
    this.posX = new Float32Array(count)
    this.posY = new Float32Array(count)
    this.states = new Uint8Array(count)
    this.resize()
  }

  resize() {
    if (!this.canvas || !this.ctx) return
    const rect = this.canvas.parentElement?.getBoundingClientRect()
    if (!rect) return

    this.dpr = window.devicePixelRatio || 1
    this.w = rect.width
    this.h = rect.height
    this.canvas.width = this.w * this.dpr
    this.canvas.height = this.h * this.dpr
    this.canvas.style.width = `${this.w}px`
    this.canvas.style.height = `${this.h}px`
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)

    this.cx = this.w / 2
    this.cy = this.h / 2
    this.layoutNodes()
  }

  private layoutNodes() {
    if (this.count === 0) return

    const maxR = Math.min(this.w, this.h) * 0.42
    const scale = maxR / Math.sqrt(this.count)

    // Adjust node radius based on count
    this.nodeRadius = this.count > 200 ? 2.5 : this.count > 50 ? 3 : 4

    for (let i = 0; i < this.count; i++) {
      const r = scale * Math.sqrt(i + 1) // +1 to avoid center overlap
      const theta = (i + 1) * GOLDEN_ANGLE
      this.posX[i] = this.cx + r * Math.cos(theta)
      this.posY[i] = this.cy + r * Math.sin(theta)
    }
  }

  updateStates(states: Uint8Array<ArrayBuffer>) {
    this.states = states
  }

  updateTotalRecovered(total: number) {
    this.totalRecovered = total
  }

  addFlow(nodeIndex: number, amount: number) {
    if (nodeIndex < 0 || nodeIndex >= this.count) return
    if (this.flows.length >= 20) return

    const nx = this.posX[nodeIndex]
    const ny = this.posY[nodeIndex]
    // Control point: perpendicular offset from midpoint for curve variety
    const mx = (nx + this.cx) / 2
    const my = (ny + this.cy) / 2
    const dx = this.cx - nx
    const dy = this.cy - ny
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const offset = (Math.random() - 0.5) * 80
    const ctrlX = mx + (-dy / len) * offset
    const ctrlY = my + (dx / len) * offset

    this.flows.push({ nodeIndex, startTime: performance.now(), amount, ctrlX, ctrlY })
  }

  start() {
    if (this.running) return
    this.running = true
    const loop = (now: number) => {
      if (!this.running) return
      this.render(now)
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  destroy() {
    this.stop()
    this.canvas = null
    this.ctx = null
  }

  private render(now: number) {
    const ctx = this.ctx
    if (!ctx) return

    ctx.clearRect(0, 0, this.w, this.h)

    // Draw flows (behind nodes)
    this.drawFlows(ctx, now)

    // Draw all nodes
    for (let i = 0; i < this.count; i++) {
      const state = this.states[i]
      const x = this.posX[i]
      const y = this.posY[i]
      const color = COLORS[state] ?? COLORS[0]

      // Glow for active states
      if (GLOW_STATES.has(state)) {
        const glowAlpha = PULSE_STATES.has(state)
          ? 0.12 + 0.08 * Math.sin(now * 0.004 + i * 0.5)
          : 0.15
        ctx.globalAlpha = glowAlpha
        ctx.beginPath()
        ctx.arc(x, y, this.nodeRadius * 3, 0, TAU)
        ctx.fillStyle = color
        ctx.fill()
      }

      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(x, y, this.nodeRadius, 0, TAU)
      ctx.fillStyle = color
      ctx.fill()
    }

    // Center node (master wallet)
    this.drawCenterNode(ctx, now)

    // Prune finished flows
    this.flows = this.flows.filter((f) => now - f.startTime < 1800)
  }

  private drawFlows(ctx: CanvasRenderingContext2D, now: number) {
    for (const flow of this.flows) {
      const elapsed = now - flow.startTime
      const t = Math.min(elapsed / 1500, 1)
      const nx = this.posX[flow.nodeIndex]
      const ny = this.posY[flow.nodeIndex]

      // Draw the curve trail
      ctx.globalAlpha = 0.15 * (1 - t)
      ctx.strokeStyle = '#8c7a4a'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(nx, ny)
      ctx.quadraticCurveTo(flow.ctrlX, flow.ctrlY, this.cx, this.cy)
      ctx.stroke()

      // Traveling dot along the bezier
      const px = (1 - t) * (1 - t) * nx + 2 * (1 - t) * t * flow.ctrlX + t * t * this.cx
      const py = (1 - t) * (1 - t) * ny + 2 * (1 - t) * t * flow.ctrlY + t * t * this.cy
      ctx.globalAlpha = 1 - t * 0.5
      ctx.beginPath()
      ctx.arc(px, py, 2.5, 0, TAU)
      ctx.fillStyle = '#ebebeb'
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private drawCenterNode(ctx: CanvasRenderingContext2D, now: number) {
    // Outer glow
    const pulse = 0.06 + 0.03 * Math.sin(now * 0.002)
    ctx.globalAlpha = pulse
    ctx.beginPath()
    ctx.arc(this.cx, this.cy, this.centerRadius * 2.5, 0, TAU)
    ctx.fillStyle = '#ebebeb'
    ctx.fill()

    // Solid center
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(this.cx, this.cy, this.centerRadius, 0, TAU)
    ctx.fillStyle = '#0a0a0a'
    ctx.fill()
    ctx.strokeStyle = '#2a2a2a'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // SOL total text
    ctx.font = '10px "JetBrains Mono", monospace'
    ctx.fillStyle = '#ebebeb'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${this.totalRecovered.toFixed(4)}`, this.cx, this.cy)

    // Label below
    ctx.font = '8px "JetBrains Mono", monospace'
    ctx.fillStyle = '#3d3d3d'
    ctx.fillText('SOL', this.cx, this.cy + this.centerRadius + 10)
  }
}

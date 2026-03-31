import { useRef, useEffect } from 'react'
import { RecoveryRenderer } from './recoveryRenderer'
import { useRecoveryStore } from '../../store/recovery'

export function RecoveryCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<RecoveryRenderer | null>(null)

  const walletCount = useRecoveryStore((s) => s.wallets.length)

  // Init renderer when wallet count changes
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const renderer = new RecoveryRenderer()
    renderer.init(canvas, walletCount || 0)
    renderer.start()
    rendererRef.current = renderer

    // Resize observer
    const ro = new ResizeObserver(() => renderer.resize())
    const parent = canvas.parentElement
    if (parent) ro.observe(parent)

    return () => {
      renderer.destroy()
      ro.disconnect()
      rendererRef.current = null
    }
  }, [walletCount])

  // Subscribe to state changes outside React render cycle
  useEffect(() => {
    const unsub = useRecoveryStore.subscribe((state, prev) => {
      const renderer = rendererRef.current
      if (!renderer) return

      if (state.stateVersion !== prev.stateVersion) {
        renderer.updateStates(state.walletStates as Uint8Array<ArrayBuffer>)
      }
      if (state.totalRecovered !== prev.totalRecovered) {
        renderer.updateTotalRecovered(state.totalRecovered)
      }
    })
    return unsub
  }, [])

  // Listen for flow events to trigger animations
  useEffect(() => {
    const unsub = useRecoveryStore.subscribe((state, prev) => {
      const renderer = rendererRef.current
      if (!renderer) return

      // Detect new flow events by checking if totalRecovered changed during execution
      if (state.status === 'executing' && state.totalRecovered > prev.totalRecovered) {
        // Find which wallet just completed by scanning for state transitions
        for (let i = 0; i < state.walletStates.length; i++) {
          if (state.walletStates[i] === 4 && prev.walletStates[i] === 3) {
            renderer.addFlow(i, state.totalRecovered - prev.totalRecovered)
            break
          }
        }
      }
    })
    return unsub
  }, [])

  return <canvas ref={canvasRef} className="recovery-canvas" />
}

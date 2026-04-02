import { useState, useEffect, useCallback } from 'react'

interface TargetRect {
  top: number
  left: number
  width: number
  height: number
}

interface UseTourTargetResult {
  rect: TargetRect | null
  visible: boolean
}

export function useTourTarget(selector: string | null): UseTourTargetResult {
  const [rect, setRect] = useState<TargetRect | null>(null)

  const measure = useCallback(() => {
    if (!selector) {
      setRect(null)
      return
    }
    const el = document.querySelector(selector)
    if (!el) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [selector])

  useEffect(() => {
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(document.body)

    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  return { rect, visible: rect !== null }
}

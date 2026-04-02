import { useState, useRef, useCallback, useEffect, type RefObject } from 'react'

interface UseSplitterOptions {
  direction: 'horizontal' | 'vertical'
  min: number
  max: number
  initial: number
  /** Optional container ref — when provided, the effective max is clamped to the container's size minus a small buffer for the splitter. */
  containerRef?: RefObject<HTMLElement | null>
}

interface UseSplitterReturn {
  size: number
  splitterProps: {
    onPointerDown: (e: React.PointerEvent) => void
  }
}

export function useSplitter({ direction, min, max, initial, containerRef }: UseSplitterOptions): UseSplitterReturn {
  const [size, setSize] = useState(initial)
  const isDragging = useRef(false)
  const startPos = useRef(0)
  const startSize = useRef(0)
  const sizeRef = useRef(size)
  sizeRef.current = size

  const getEffectiveMax = useCallback(() => {
    if (!containerRef?.current) return max
    const containerSize = direction === 'vertical'
      ? containerRef.current.clientHeight
      : containerRef.current.clientWidth
    // Subtract splitter thickness (4px) from the available space
    return Math.min(max, containerSize - 4)
  }, [direction, max, containerRef])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    isDragging.current = true
    startPos.current = direction === 'vertical' ? e.clientY : e.clientX
    startSize.current = sizeRef.current
    document.body.style.cursor = direction === 'vertical' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
  }, [direction])

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return
      const current = direction === 'vertical' ? e.clientY : e.clientX
      const delta = direction === 'vertical'
        ? startPos.current - current
        : current - startPos.current
      const effectiveMax = getEffectiveMax()
      const next = Math.max(min, Math.min(effectiveMax, startSize.current + delta))
      setSize(next)
    }

    const handlePointerUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [direction, min, getEffectiveMax])

  return {
    size,
    splitterProps: { onPointerDown: handlePointerDown },
  }
}

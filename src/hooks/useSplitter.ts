import { useState, useRef, useCallback, useEffect } from 'react'

interface UseSplitterOptions {
  direction: 'horizontal' | 'vertical'
  min: number
  max: number
  initial: number
}

interface UseSplitterReturn {
  size: number
  splitterProps: {
    onPointerDown: (e: React.PointerEvent) => void
  }
}

export function useSplitter({ direction, min, max, initial }: UseSplitterOptions): UseSplitterReturn {
  const [size, setSize] = useState(initial)
  const isDragging = useRef(false)
  const startPos = useRef(0)
  const startSize = useRef(0)
  const sizeRef = useRef(size)
  sizeRef.current = size

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
      const next = Math.max(min, Math.min(max, startSize.current + delta))
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
  }, [direction, min, max])

  return {
    size,
    splitterProps: { onPointerDown: handlePointerDown },
  }
}

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
    onMouseDown: (e: React.MouseEvent) => void
  }
}

export function useSplitter({ direction, min, max, initial }: UseSplitterOptions): UseSplitterReturn {
  const [size, setSize] = useState(initial)
  const isDragging = useRef(false)
  const startPos = useRef(0)
  const startSize = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    startPos.current = direction === 'vertical' ? e.clientY : e.clientX
    startSize.current = size
    document.body.style.cursor = direction === 'vertical' ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
  }, [size, direction])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const current = direction === 'vertical' ? e.clientY : e.clientX
      // For vertical splitter (terminal), dragging up increases size
      const delta = direction === 'vertical'
        ? startPos.current - current
        : current - startPos.current
      const next = Math.max(min, Math.min(max, startSize.current + delta))
      setSize(next)
    }

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [direction, min, max])

  return {
    size,
    splitterProps: { onMouseDown: handleMouseDown },
  }
}

import { useEffect, useRef, useState, useCallback, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import './QuickView.css'

interface QuickViewProps {
  isOpen: boolean
  onClose: () => void
  triggerRef: RefObject<HTMLElement | null>
  anchor: 'below' | 'above'
  variant: 'wallet' | 'email'
  children: ReactNode
}

const CARD_WIDTH = 320
const VIEWPORT_MARGIN = 8

export function QuickView({ isOpen, onClose, triggerRef, anchor, variant, children }: QuickViewProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isExiting, setIsExiting] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })

  const calcPosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = rect.right - CARD_WIDTH
    if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN
    if (left + CARD_WIDTH > vw - VIEWPORT_MARGIN) left = vw - VIEWPORT_MARGIN - CARD_WIDTH

    let top: number
    if (anchor === 'below') {
      top = rect.bottom + 4
      if (cardRef.current) {
        const cardH = cardRef.current.offsetHeight
        if (top + cardH > vh - VIEWPORT_MARGIN) top = vh - VIEWPORT_MARGIN - cardH
      }
    } else {
      const cardH = cardRef.current?.offsetHeight ?? 300
      top = rect.top - 4 - cardH
      if (top < VIEWPORT_MARGIN) top = VIEWPORT_MARGIN
    }

    setPosition({ top, left })
  }, [triggerRef, anchor])

  useEffect(() => {
    if (!isOpen) return
    calcPosition()
  }, [isOpen, calcPosition])

  useEffect(() => {
    if (!isOpen) return
    const handleResize = () => calcPosition()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen, calcPosition])

  useEffect(() => {
    if (!isOpen || isExiting) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, isExiting])

  const handleClose = useCallback(() => {
    setIsExiting(true)
  }, [])

  const handleAnimationEnd = useCallback(() => {
    if (isExiting) {
      setIsExiting(false)
      onClose()
      triggerRef.current?.focus()
    }
  }, [isExiting, onClose, triggerRef])

  if (!isOpen && !isExiting) return null

  const enterDir = anchor === 'below' ? '-4px' : '4px'

  return createPortal(
    <>
      <div
        className="quickview-backdrop"
        onMouseDown={handleClose}
      />
      <div
        ref={cardRef}
        className={`quickview-card quickview-card--${variant} ${isExiting ? 'quickview-card--exit' : 'quickview-card--enter'}`}
        style={{
          top: position.top,
          left: position.left,
          '--enter-dir': enterDir,
        } as React.CSSProperties}
        role="dialog"
        aria-label={variant === 'wallet' ? 'Wallet summary' : 'Recent emails'}
        onAnimationEnd={handleAnimationEnd}
      >
        {children}
      </div>
    </>,
    document.body
  )
}

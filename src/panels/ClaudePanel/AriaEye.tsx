import { useEffect, useRef, useCallback, useState } from 'react'
import './AriaEye.css'

export type AriaEyeState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'success'
  | 'error'
  | 'sleeping'
  | 'peek'

interface AriaEyeProps {
  state: AriaEyeState
  size?: 'small' | 'large'
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function AriaEye({ state, size = 'small' }: AriaEyeProps) {
  const [isBlinking, setIsBlinking] = useState(false)
  const [lookX, setLookX] = useState(0)

  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lookTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blinkInnerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lookResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearAllTimers = useCallback(() => {
    if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current)
    if (lookTimerRef.current) clearTimeout(lookTimerRef.current)
    if (blinkInnerRef.current) clearTimeout(blinkInnerRef.current)
    if (lookResetRef.current) clearTimeout(lookResetRef.current)
  }, [])

  const scheduleBlink = useCallback(() => {
    if (state === 'sleeping' || state === 'peek') return

    const delay = randomBetween(3000, 8000)
    blinkTimerRef.current = setTimeout(() => {
      setIsBlinking(true)
      blinkInnerRef.current = setTimeout(() => {
        setIsBlinking(false)
        scheduleBlink()
      }, 150)
    }, delay)
  }, [state])

  const scheduleLook = useCallback(() => {
    if (state === 'sleeping' || state === 'peek') return

    const delay = randomBetween(8000, 16000)
    lookTimerRef.current = setTimeout(() => {
      const positions = [-2.5, -1.5, 0, 1.5, 2.5]
      const idx = randomBetween(0, positions.length - 1)
      setLookX(positions[idx])

      lookResetRef.current = setTimeout(() => {
        setLookX(0)
      }, randomBetween(600, 1500))

      scheduleLook()
    }, delay)
  }, [state])

  useEffect(() => {
    clearAllTimers()
    setLookX(0)

    const isActive = state === 'idle' || state === 'listening' || state === 'thinking'

    if (isActive) {
      scheduleBlink()
      scheduleLook()
    }

    return clearAllTimers
  }, [state, clearAllTimers, scheduleBlink, scheduleLook])

  const classNames = [
    'aria-face',
    `aria-face-${state}`,
    `aria-face-${size}`,
    isBlinking ? 'aria-face-blink' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={classNames}
      style={{ '--look-x': `${lookX}px` } as React.CSSProperties}
    >
      <div className="aria-eye aria-eye-left" />
      <div className="aria-eye aria-eye-right" />
    </div>
  )
}

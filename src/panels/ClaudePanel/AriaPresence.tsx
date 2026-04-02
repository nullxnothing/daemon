import { useState, useEffect, useRef, useCallback } from 'react'
import { useAriaStore } from '../../store/aria'
import { AriaEye } from './AriaEye'
import type { AriaEyeState } from './AriaEye'

const IDLE_TIMEOUT = 5 * 60 * 1000 // 5 min -> sleeping
const PEEK_MIN = 60 * 1000
const PEEK_MAX = 180 * 1000

interface AriaPresenceProps {
  isChatFocused: boolean
  isChatExpanded: boolean
  size?: 'small' | 'large'
}

export function AriaPresence({ isChatFocused, isChatExpanded, size = 'small' }: AriaPresenceProps) {
  const isLoading = useAriaStore((s) => s.isLoading)
  const messages = useAriaStore((s) => s.messages)

  const [eyeState, setEyeState] = useState<AriaEyeState>('idle')
  const [flashState, setFlashState] = useState<'success' | 'error' | null>(null)

  const prevLoadingRef = useRef(isLoading)
  const prevMsgCountRef = useRef(messages.length)
  const lastActivityRef = useRef(Date.now())
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)

    idleTimerRef.current = setTimeout(() => {
      setEyeState('sleeping')
    }, IDLE_TIMEOUT)
  }, [])

  // Track user activity to reset idle
  useEffect(() => {
    const onActivity = () => {
      if (eyeState === 'sleeping') {
        setEyeState('idle')
      }
      resetIdleTimer()
    }

    window.addEventListener('keydown', onActivity)
    window.addEventListener('mousedown', onActivity)
    window.addEventListener('mousemove', onActivity)

    resetIdleTimer()

    return () => {
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('mousedown', onActivity)
      window.removeEventListener('mousemove', onActivity)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [eyeState, resetIdleTimer])

  // Detect loading transitions for success/error flash
  useEffect(() => {
    const wasLoading = prevLoadingRef.current
    const msgCount = messages.length
    const prevCount = prevMsgCountRef.current

    if (wasLoading && !isLoading) {
      // Response arrived — check if last message is an error
      const lastMsg = messages[messages.length - 1]
      const isError = lastMsg?.content?.startsWith('Error:')

      setFlashState(isError ? 'error' : 'success')
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => {
        setFlashState(null)
      }, 1500)
    }

    prevLoadingRef.current = isLoading
    prevMsgCountRef.current = msgCount
  }, [isLoading, messages])

  // Peek behavior — only when idle and chat collapsed
  useEffect(() => {
    const schedulePeek = () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current)

      const delay = Math.floor(Math.random() * (PEEK_MAX - PEEK_MIN + 1)) + PEEK_MIN
      peekTimerRef.current = setTimeout(() => {
        if (eyeState === 'idle' && !isChatExpanded) {
          setEyeState('peek')
          setTimeout(() => {
            setEyeState('idle')
            schedulePeek()
          }, 3000)
        } else {
          schedulePeek()
        }
      }, delay)
    }

    schedulePeek()
    return () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current)
    }
  }, [eyeState, isChatExpanded])

  // Cleanup flash timer
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  // Resolve final state with priority
  let resolvedState: AriaEyeState = eyeState

  if (flashState) {
    resolvedState = flashState
  } else if (isLoading) {
    resolvedState = 'thinking'
  } else if (isChatFocused) {
    resolvedState = 'listening'
  } else if (eyeState === 'sleeping' || eyeState === 'peek') {
    resolvedState = eyeState
  } else {
    resolvedState = 'idle'
  }

  return <AriaEye state={resolvedState} size={size} />
}

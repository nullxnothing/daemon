import { type RefObject, useEffect, useRef } from 'react'

export function useStickyScroll<T extends HTMLElement>(
  scrollRef: RefObject<T | null>,
  deps: readonly unknown[],
  threshold = 48,
) {
  const shouldStickRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const updateStickiness = () => {
      shouldStickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
    }

    updateStickiness()
    el.addEventListener('scroll', updateStickiness, { passive: true })
    return () => el.removeEventListener('scroll', updateStickiness)
  }, [scrollRef, threshold])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !shouldStickRef.current) return
    el.scrollTo({ top: el.scrollHeight })
  }, deps)
}

import { useEffect, useState } from 'react'
import { DaemonMark } from '../DaemonMark'
import './BootLoader.css'

const LETTERS = ['D', 'A', 'E', 'M', 'O', 'N']

const STATUS_SEQUENCE = [
  'initializing runtime...',
  'loading modules...',
  'connecting services...',
  'ready',
]

interface BootLoaderProps {
  /** When true, the loader fades out and unmounts after the transition. */
  ready: boolean
  status?: string
}

export function BootLoader({ ready, status }: BootLoaderProps) {
  const [mounted, setMounted] = useState(true)
  const [statusIndex, setStatusIndex] = useState(0)

  // Cycle status text while loading
  useEffect(() => {
    if (ready) return
    const id = setInterval(() => {
      setStatusIndex((i) => Math.min(i + 1, STATUS_SEQUENCE.length - 2))
    }, 900)
    return () => clearInterval(id)
  }, [ready])

  // Jump to final status when ready
  useEffect(() => {
    if (ready) {
      setStatusIndex(STATUS_SEQUENCE.length - 1)
    }
  }, [ready])

  // Unmount after fade-out completes (400ms transition in CSS)
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => setMounted(false), 450)
    return () => clearTimeout(id)
  }, [ready])

  if (!mounted) return null

  return (
    <div className={`bootloader${ready ? ' bootloader--hidden' : ''}`} aria-hidden="true">
      <DaemonMark size={48} className="bootloader__logo" />

      <div className="bootloader__ring-wrap">
        <div className="bootloader__ring" />
      </div>

      <div className="bootloader__text" aria-label="DAEMON">
        {LETTERS.map((letter, i) => (
          <span key={i} className="bootloader__letter">
            {letter}
          </span>
        ))}
      </div>

      <div className="bootloader__status">
        {status ?? STATUS_SEQUENCE[statusIndex]}
      </div>

      <div className="bootloader__progress-track">
        <div className="bootloader__progress-fill" />
      </div>
    </div>
  )
}

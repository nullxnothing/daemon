import { useState, type ReactNode, useCallback } from 'react'
import './CategoryGroup.css'

interface CategoryGroupProps {
  categoryId: string
  label: string
  count: number
  storageKey: string
  defaultOpen?: boolean
  children: ReactNode
}

function readStoredOpen(storageKey: string, categoryId: string, defaultOpen: boolean): boolean {
  try {
    const raw = localStorage.getItem(`daemon:cat:${storageKey}:${categoryId}`)
    if (raw === null) return defaultOpen
    return raw === '1'
  } catch {
    return defaultOpen
  }
}

function writeStoredOpen(storageKey: string, categoryId: string, isOpen: boolean) {
  try {
    localStorage.setItem(`daemon:cat:${storageKey}:${categoryId}`, isOpen ? '1' : '0')
  } catch {}
}

export function CategoryGroup({
  categoryId,
  label,
  count,
  storageKey,
  defaultOpen = true,
  children,
}: CategoryGroupProps) {
  const [isOpen, setIsOpen] = useState(() => readStoredOpen(storageKey, categoryId, defaultOpen))

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev
      writeStoredOpen(storageKey, categoryId, next)
      return next
    })
  }, [storageKey, categoryId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  return (
    <div className="category-group">
      <div
        className="category-group-header"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <svg
          className={`category-group-arrow ${isOpen ? 'open' : ''}`}
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          aria-hidden="true"
        >
          <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="category-group-label">{label}</span>
        <span className="category-group-count">{count}</span>
      </div>
      <div className={`category-group-body ${isOpen ? 'open' : ''}`}>
        {children}
      </div>
    </div>
  )
}

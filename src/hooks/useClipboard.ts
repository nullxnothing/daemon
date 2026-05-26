import { useCallback, useEffect, useRef, useState } from 'react'

interface UseClipboardOptions {
  /** How long the "copied" flag stays true, in ms. */
  resetMs?: number
}

interface UseClipboardResult {
  /** True for `resetMs` after a successful copy. Drives "Copied" UI. */
  copied: boolean
  /** The most recently copied key (when copy is called with an id), else null. */
  copiedKey: string | null
  /** Copy text. Optional `key` lets a list track which row was copied. */
  copy: (text: string, key?: string) => Promise<boolean>
}

/**
 * Clipboard with transient confirmation state. Replaces the ad-hoc
 * `const [copied, setCopied] = useState(false)` + setTimeout pattern that was
 * duplicated across ~10 panels. Falls back to execCommand when the async API
 * is unavailable (older Electron webview contexts).
 */
export function useClipboard({ resetMs = 1600 }: UseClipboardOptions = {}): UseClipboardResult {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
  }, [])

  const copy = useCallback(async (text: string, key?: string): Promise<boolean> => {
    const ok = await writeClipboard(text)
    if (!ok) return false

    setCopied(true)
    setCopiedKey(key ?? null)
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      setCopied(false)
      setCopiedKey(null)
    }, resetMs)
    return true
  }, [resetMs])

  return { copied, copiedKey, copy }
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to legacy path
  }

  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

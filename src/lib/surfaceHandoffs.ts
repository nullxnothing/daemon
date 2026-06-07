export const BLOCK_SCANNER_HANDOFF_KEY = 'daemon:block-scanner-handoff'
export const BLOCK_SCANNER_HANDOFF_EVENT = 'daemon:block-scanner-inspect'
export const REPLAY_HANDOFF_KEY = 'daemon:replay-handoff'
export const REPLAY_HANDOFF_EVENT = 'daemon:replay-open'
export const METERFLOW_RECEIPT_HANDOFF_KEY = 'daemon:meterflow-receipt-handoff'
export const METERFLOW_RECEIPT_EVENT = 'daemon:meterflow-open-receipt'

export interface BlockScannerHandoff {
  value: string
  cluster?: string
}

export interface ReplayHandoff {
  signature?: string
  address?: string
  programId?: string
}

export function consumeSurfaceHandoff<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    window.localStorage.removeItem(key)
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function queueSurfaceHandoff<T>(key: string, eventName: string, detail: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(detail))
  } catch {
    // Event delivery still covers already-mounted panels.
  }
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent<T>(eventName, { detail }))
  }, 0)
}

import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'

export type ToastKind = 'info' | 'success' | 'error' | 'warning'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  context?: string
  createdAt: number
  ttlMs: number
  action?: ToastAction
}

export interface ActivityEntry {
  id: string
  kind: ToastKind
  message: string
  context: string | null
  createdAt: number
}

interface NotificationsState {
  toasts: Toast[]
  activity: ActivityEntry[]
  pushToast: (input: { kind: ToastKind; message: string; context?: string; ttlMs?: number; action?: ToastAction }) => string
  pushError: (err: unknown, context?: string) => string
  pushSuccess: (message: string, context?: string) => string
  pushInfo: (message: string, context?: string) => string
  dismiss: (id: string) => void
  clearAll: () => void
  loadActivity: () => Promise<void>
  clearActivity: () => Promise<void>
}

const DEFAULT_TTL: Record<ToastKind, number> = {
  info: 3500,
  success: 3500,
  warning: 6000,
  error: 8000,
}

function persistEntry(entry: ActivityEntry): void {
  // Fire-and-forget; never block UI on logging.
  // Guarded so unit tests (no preload) don't crash.
  if (typeof window === 'undefined') return
  daemon.activity.append({
    id: entry.id,
    kind: entry.kind,
    message: entry.message,
    context: entry.context,
    createdAt: entry.createdAt,
  }).catch(() => { /* non-fatal */ })
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  toasts: [],
  activity: [],

  pushToast: ({ kind, message, context, ttlMs, action }) => {
    const id = crypto.randomUUID()
    const createdAt = Date.now()
    const toast: Toast = {
      id,
      kind,
      message,
      context,
      createdAt,
      ttlMs: ttlMs ?? DEFAULT_TTL[kind],
      action,
    }
    const entry: ActivityEntry = { id, kind, message, context: context ?? null, createdAt }

    set((state) => ({
      toasts: [...state.toasts, toast],
      activity: [entry, ...state.activity].slice(0, 500),
    }))

    persistEntry(entry)

    if (toast.ttlMs > 0 && typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(() => get().dismiss(id), toast.ttlMs)
    }

    return id
  },

  pushError: (err, context) => {
    const message = err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : 'An unexpected error occurred'
    return get().pushToast({ kind: 'error', message, context })
  },

  pushSuccess: (message, context) => get().pushToast({ kind: 'success', message, context }),
  pushInfo: (message, context) => get().pushToast({ kind: 'info', message, context }),

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearAll: () => set({ toasts: [] }),

  loadActivity: async () => {
    const res = await daemon.activity.list(500)
    if (res.ok && res.data) set({ activity: res.data })
  },

  clearActivity: async () => {
    const res = await daemon.activity.clear()
    if (res.ok) set({ activity: [] })
  },
}))

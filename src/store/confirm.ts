import { create } from 'zustand'

export interface ConfirmRequest {
  id: string
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /** Require typing this string to enable the confirm button */
  typedConfirmation?: string
  resolve: (ok: boolean) => void
}

interface ConfirmState {
  current: ConfirmRequest | null
  request: (input: Omit<ConfirmRequest, 'id' | 'resolve'>) => Promise<boolean>
  resolve: (ok: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,

  request: (input) => {
    return new Promise<boolean>((resolve) => {
      // If a previous prompt is open, auto-cancel it before queueing the new one
      const existing = get().current
      if (existing) existing.resolve(false)

      set({
        current: {
          id: crypto.randomUUID(),
          title: input.title,
          body: input.body,
          confirmLabel: input.confirmLabel,
          cancelLabel: input.cancelLabel,
          danger: input.danger,
          typedConfirmation: input.typedConfirmation,
          resolve,
        },
      })
    })
  },

  resolve: (ok) => {
    const current = get().current
    if (!current) return
    current.resolve(ok)
    set({ current: null })
  },
}))

/**
 * Promise-based confirm dialog. Usage:
 *   const ok = await confirm({ title: 'Delete agent?', danger: true })
 *   if (!ok) return
 */
export function confirm(input: Omit<ConfirmRequest, 'id' | 'resolve'>): Promise<boolean> {
  return useConfirmStore.getState().request(input)
}

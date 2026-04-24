import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'

interface SolanaActivityState {
  entries: SolanaActivityEntry[]
  loading: boolean
  error: string | null
  loadRecent: (walletId?: string | null, limit?: number) => Promise<void>
  clear: () => Promise<void>
}

export const useSolanaActivityStore = create<SolanaActivityState>((set) => ({
  entries: [],
  loading: false,
  error: null,

  loadRecent: async (walletId, limit = 50) => {
    set({ loading: true, error: null })
    try {
      const res = await daemon.activity.listSolana(walletId ?? null, limit)
      if (res.ok && res.data) {
        set({ entries: res.data, loading: false, error: null })
        return
      }
      set({ loading: false, error: res.error ?? 'Failed to load Solana activity' })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load Solana activity',
      })
    }
  },

  clear: async () => {
    const res = await daemon.activity.clearSolana()
    if (res.ok) set({ entries: [], error: null })
  },
}))

import { create } from 'zustand'
import type { WalletListEntry } from '../../electron/shared/types'
import type { SolanaRuntimeStatusSummary } from '../../electron/shared/solanaRuntime'
import type { WalletInfrastructureSettings } from '../../electron/services/SettingsService'

interface WalletDataState {
  wallets: WalletListEntry[]
  infrastructure: WalletInfrastructureSettings | null
  runtimeStatus: SolanaRuntimeStatusSummary | null
  secureKeys: {
    HELIUS_API_KEY: boolean
    JUPITER_API_KEY: boolean
  }
  keypairCache: Record<string, boolean>
  balanceCache: Record<string, number>
  lastFetch: number
  loading: boolean
  
  // Actions
  fetch: (force?: boolean) => Promise<void>
  refreshKeypairs: (walletIds?: string[]) => Promise<void>
  refreshBalance: (walletId: string) => Promise<void>
  updateInfrastructure: (settings: WalletInfrastructureSettings) => Promise<void>
  invalidate: () => void
}

const CACHE_TTL = 5000 // 5 seconds

export const useWalletDataStore = create<WalletDataState>((set, get) => ({
  wallets: [],
  infrastructure: null,
  runtimeStatus: null,
  secureKeys: { HELIUS_API_KEY: false, JUPITER_API_KEY: false },
  keypairCache: {},
  balanceCache: {},
  lastFetch: 0,
  loading: false,

  fetch: async (force = false) => {
    const state = get()
    const now = Date.now()
    
    // Return cached data if fresh
    if (!force && now - state.lastFetch < CACHE_TTL && state.wallets.length > 0) {
      return
    }

    set({ loading: true })

    try {
      const [walletRes, infraRes, runtimeRes, heliusRes, jupiterRes] = await Promise.all([
        window.daemon.wallet.list(),
        window.daemon.settings.getWalletInfrastructureSettings(),
        window.daemon.settings.getSolanaRuntimeStatus(),
        window.daemon.wallet.hasHeliusKey(),
        window.daemon.wallet.hasJupiterKey(),
      ])

      set({
        wallets: walletRes.ok && walletRes.data ? walletRes.data : [],
        infrastructure: infraRes.ok && infraRes.data ? infraRes.data : null,
        runtimeStatus: runtimeRes.ok && runtimeRes.data ? runtimeRes.data : null,
        secureKeys: {
          HELIUS_API_KEY: Boolean(heliusRes.ok && heliusRes.data),
          JUPITER_API_KEY: Boolean(jupiterRes.ok && jupiterRes.data),
        },
        lastFetch: now,
        loading: false,
      })

      // Auto-refresh keypairs for all wallets
      const walletIds = (walletRes.ok && walletRes.data ? walletRes.data : []).map((w: WalletListEntry) => w.id)
      if (walletIds.length > 0) {
        void get().refreshKeypairs(walletIds)
      }
    } catch {
      set({ loading: false })
    }
  },

  refreshKeypairs: async (walletIds) => {
    const ids = walletIds ?? get().wallets.map((w) => w.id)
    if (ids.length === 0) return

    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const res = await window.daemon.wallet.hasKeypair(id)
          return [id, Boolean(res.ok && res.data)] as const
        })
      )
      
      set((state) => ({
        keypairCache: { ...state.keypairCache, ...Object.fromEntries(results) },
      }))
    } catch {
      // Silent fail - keypair status is non-critical
    }
  },

  refreshBalance: async (walletId) => {
    try {
      const res = await window.daemon.wallet.balance(walletId)
      if (res.ok && res.data?.sol != null) {
        set((state) => ({
          balanceCache: { ...state.balanceCache, [walletId]: res.data!.sol },
        }))
      }
    } catch {
      // Silent fail
    }
  },

  updateInfrastructure: async (settings) => {
    try {
      const res = await window.daemon.settings.setWalletInfrastructureSettings(settings)
      if (res.ok) {
        set({ infrastructure: settings })
      }
    } catch {
      // Silent fail
    }
  },

  invalidate: () => {
    set({ lastFetch: 0 })
  },
}))

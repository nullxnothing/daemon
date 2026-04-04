import { create } from 'zustand'

// Track active polling subscribers (e.g. wallet panel, titlebar widget)
let pollInterval: ReturnType<typeof setInterval> | null = null
let subscriberCount = 0

// Reset module-level state on HMR so poll timers don't stack across hot reloads
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (pollInterval) clearInterval(pollInterval)
    pollInterval = null
    subscriberCount = 0
  })
}

const FAST_POLL_MS = 15_000   // when wallet panel is visible
const SLOW_POLL_MS = 120_000  // background refresh (titlebar widget, etc.)

function restartPoll(intervalMs: number) {
  if (pollInterval) clearInterval(pollInterval)
  pollInterval = setInterval(() => {
    void useWalletStore.getState().refresh()
  }, intervalMs)
}

function stopPoll() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

interface AgentWallet {
  id: string
  name: string
  address: string
  agent_id: string
  wallet_type: string
}

interface WalletTransaction {
  id: string
  type: string
  signature: string | null
  from_address: string
  to_address: string
  amount: number
  mint: string | null
  status: string
  created_at: number
}

type WalletActiveView = 'overview' | 'send' | 'swap' | 'receive' | 'vault'

interface WalletStoreState {
  dashboard: WalletDashboard | null
  showMarketTape: boolean
  showTitlebarWallet: boolean
  loading: boolean
  error: string | null
  agentWallets: AgentWallet[] | null
  transactions: WalletTransaction[] | null
  activeView: WalletActiveView
  setActiveView: (view: WalletActiveView) => void
  refresh: (projectId?: string | null) => Promise<void>
  setShowMarketTape: (enabled: boolean) => Promise<boolean>
  setShowTitlebarWallet: (enabled: boolean) => Promise<boolean>
  loadAgentWallets: () => Promise<void>
  loadTransactions: (walletId: string) => Promise<void>
  /** Call when a fast-polling consumer mounts (wallet panel). Returns cleanup fn. */
  subscribeFastPoll: () => () => void
  /** Start slow background polling (call once from app init). Returns cleanup fn. */
  startBackgroundPoll: () => () => void
}

export const useWalletStore = create<WalletStoreState>((set) => ({
  dashboard: null,
  showMarketTape: true,
  showTitlebarWallet: true,
  loading: false,
  error: null,
  agentWallets: null,
  transactions: null,
  activeView: 'overview',
  setActiveView: (view) => set({ activeView: view }),

  refresh: async (projectId) => {
    set({ loading: true, error: null })

    try {
      const [settingsRes, walletRes] = await Promise.all([
        window.daemon.settings.getUi(),
        window.daemon.wallet.dashboard(projectId ?? null),
      ])

      if (settingsRes.ok && settingsRes.data) {
        set({
          showMarketTape: settingsRes.data.showMarketTape,
          showTitlebarWallet: settingsRes.data.showTitlebarWallet,
        })
      }

      if (walletRes.ok && walletRes.data) {
        set({ dashboard: walletRes.data, loading: false, error: null })
        return
      }

      set({
        loading: false,
        error: walletRes.error ?? 'Failed to load wallet dashboard',
      })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load wallet dashboard',
      })
    }
  },

  setShowMarketTape: async (enabled) => {
    const res = await window.daemon.settings.setShowMarketTape(enabled)
    if (res.ok) {
      set({ showMarketTape: enabled })
      return true
    }
    return false
  },

  setShowTitlebarWallet: async (enabled) => {
    const res = await window.daemon.settings.setShowTitlebarWallet(enabled)
    if (res.ok) {
      set({ showTitlebarWallet: enabled })
      return true
    }
    return false
  },

  loadAgentWallets: async () => {
    try {
      const res = await window.daemon.wallet.agentWallets()
      if (res.ok && res.data) {
        set({ agentWallets: res.data })
      }
    } catch {
      // silently fail — agent wallets are supplementary
    }
  },

  loadTransactions: async (walletId: string) => {
    try {
      const res = await window.daemon.wallet.transactionHistory(walletId)
      if (res.ok && res.data) {
        set({ transactions: res.data })
      }
    } catch {
      set({ transactions: null })
    }
  },

  subscribeFastPoll: () => {
    subscriberCount++
    if (subscriberCount === 1) {
      // Switch from slow to fast polling
      restartPoll(FAST_POLL_MS)
    }
    return () => {
      subscriberCount = Math.max(0, subscriberCount - 1)
      if (subscriberCount === 0) {
        // Downgrade back to slow background poll
        restartPoll(SLOW_POLL_MS)
      }
    }
  },

  startBackgroundPoll: () => {
    if (!pollInterval) {
      restartPoll(SLOW_POLL_MS)
    }
    return () => stopPoll()
  },
}))

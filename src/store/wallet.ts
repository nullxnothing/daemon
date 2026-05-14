import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'

// Track active polling subscribers (e.g. wallet panel, titlebar widget)
let pollInterval: ReturnType<typeof setInterval> | null = null
let subscriberCount = 0
let backgroundPollingEnabled = false
let refreshInFlight: Promise<void> | null = null

// Reset module-level state on HMR so poll timers don't stack across hot reloads
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (pollInterval) clearInterval(pollInterval)
    pollInterval = null
    subscriberCount = 0
    backgroundPollingEnabled = false
    refreshInFlight = null
  })
}

const FAST_POLL_MS = 15_000   // when wallet panel is visible
const SLOW_POLL_MS = 120_000  // background refresh (titlebar widget, etc.)
const LOW_POWER_FAST_POLL_MS = 60_000

function restartPoll() {
  if (pollInterval) clearInterval(pollInterval)
  pollInterval = null

  if (subscriberCount === 0 && !backgroundPollingEnabled) return
  const lowPowerMode = useWalletStore.getState().lowPowerMode
  if (lowPowerMode && subscriberCount === 0) return

  const intervalMs = subscriberCount > 0
    ? (lowPowerMode ? LOW_POWER_FAST_POLL_MS : FAST_POLL_MS)
    : SLOW_POLL_MS

  pollInterval = setInterval(() => {
    void useWalletStore.getState().refresh()
  }, intervalMs)
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

type WalletActiveView = 'overview' | 'holdings' | 'move' | 'manage' | 'history' | 'swap' | 'receive' | 'vault'
type WalletTab = 'wallet' | 'agents'

interface PreferredSwapRoute {
  inputMint: string
  outputMint: string
}

interface WalletStoreState {
  dashboard: WalletDashboard | null
  lastRefreshAt: number
  lastRefreshProjectId: string | null
  showMarketTape: boolean
  showTitlebarWallet: boolean
  lowPowerMode: boolean
  loading: boolean
  error: string | null
  agentWallets: AgentWallet[] | null
  transactions: WalletTransaction[] | null
  activeView: WalletActiveView
  activeTab: WalletTab
  preferredSwap: PreferredSwapRoute | null
  setActiveView: (view: WalletActiveView) => void
  setActiveTab: (tab: WalletTab) => void
  setPreferredSwap: (route: PreferredSwapRoute | null) => void
  loadUiSettings: () => Promise<void>
  refresh: (projectId?: string | null) => Promise<void>
  setShowMarketTape: (enabled: boolean) => Promise<boolean>
  setShowTitlebarWallet: (enabled: boolean) => Promise<boolean>
  setLowPowerMode: (enabled: boolean) => Promise<boolean>
  loadAgentWallets: () => Promise<void>
  loadTransactions: (walletId: string) => Promise<void>
  /** Call when a fast-polling consumer mounts (wallet panel). Returns cleanup fn. */
  subscribeFastPoll: () => () => void
  /** Start slow background polling (call once from app init). Returns cleanup fn. */
  startBackgroundPoll: () => () => void
}

export const useWalletStore = create<WalletStoreState>((set) => ({
  dashboard: null,
  lastRefreshAt: 0,
  lastRefreshProjectId: null,
  showMarketTape: true,
  showTitlebarWallet: true,
  lowPowerMode: false,
  loading: false,
  error: null,
  agentWallets: null,
  transactions: null,
  activeView: 'overview',
  activeTab: 'wallet',
  preferredSwap: null,
  setActiveView: (view) => set({ activeView: view }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setPreferredSwap: (route) => set({ preferredSwap: route }),

  loadUiSettings: async () => {
    try {
      const res = await daemon.settings.getUi()
      if (res.ok && res.data) {
        set({
          showMarketTape: res.data.showMarketTape,
          showTitlebarWallet: res.data.showTitlebarWallet,
          lowPowerMode: Boolean(res.data.lowPowerMode),
        })
      }
    } catch {
      // Keep defaults when settings are unavailable during early boot.
    }
  },

  refresh: async (projectId) => {
    if (refreshInFlight) return refreshInFlight

    const requestedProjectId = projectId ?? null
    refreshInFlight = (async () => {
      set({ loading: true, error: null })

      try {
        const walletRes = await daemon.wallet.dashboard(requestedProjectId)

        if (walletRes.ok && walletRes.data) {
          set({
            dashboard: walletRes.data,
            lastRefreshAt: Date.now(),
            lastRefreshProjectId: requestedProjectId,
            loading: false,
            error: null,
          })
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
      } finally {
        refreshInFlight = null
      }
    })()

    return refreshInFlight
  },

  setShowMarketTape: async (enabled) => {
    const res = await daemon.settings.setShowMarketTape(enabled)
    if (res.ok) {
      set({ showMarketTape: enabled })
      return true
    }
    return false
  },

  setShowTitlebarWallet: async (enabled) => {
    const res = await daemon.settings.setShowTitlebarWallet(enabled)
    if (res.ok) {
      set({ showTitlebarWallet: enabled })
      return true
    }
    return false
  },

  setLowPowerMode: async (enabled) => {
    const res = await daemon.settings.setLowPowerMode(enabled)
    if (res.ok) {
      set({ lowPowerMode: enabled })
      restartPoll()
      return true
    }
    return false
  },

  loadAgentWallets: async () => {
    try {
      const res = await daemon.wallet.agentWallets()
      if (res.ok && res.data) {
        set({ agentWallets: res.data })
      }
    } catch {
      // silently fail — agent wallets are supplementary
    }
  },

  loadTransactions: async (walletId: string) => {
    try {
      const res = await daemon.wallet.transactionHistory(walletId)
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
      restartPoll()
    }
    return () => {
      subscriberCount = Math.max(0, subscriberCount - 1)
      if (subscriberCount === 0) {
        // Downgrade back to slow background poll
        restartPoll()
      }
    }
  },

  startBackgroundPoll: () => {
    backgroundPollingEnabled = true
    restartPoll()
    return () => {
      backgroundPollingEnabled = false
      restartPoll()
    }
  },
}))

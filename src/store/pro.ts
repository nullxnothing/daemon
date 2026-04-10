import { create } from 'zustand'

interface ProStoreState {
  subscription: ProSubscriptionState
  price: ProPriceInfo | null
  arenaSubmissions: ArenaSubmission[]
  quota: { quota: number; used: number; remaining: number } | null
  subscribing: boolean
  loadingArena: boolean
  loadingQuota: boolean
  syncingSkills: boolean
  syncingMcp: boolean
  error: string | null
  refreshStatus: (walletAddress?: string | null) => Promise<void>
  fetchPrice: () => Promise<void>
  subscribe: (walletId: string) => Promise<boolean>
  claimHolderAccess: (walletId: string) => Promise<boolean>
  signOut: () => Promise<void>
  loadArena: () => Promise<void>
  submitToArena: (input: ArenaSubmissionInput) => Promise<string | null>
  voteArena: (submissionId: string) => Promise<boolean>
  loadQuota: () => Promise<void>
  syncSkills: () => Promise<{ installed: string[]; skipped: string[] } | null>
  pushMcp: () => Promise<number | null>
  pullMcp: () => Promise<number | null>
  clearError: () => void
}

const EMPTY_SUBSCRIPTION: ProSubscriptionState = {
  active: false,
  walletId: null,
  walletAddress: null,
  expiresAt: null,
  features: [],
  tier: null,
  accessSource: null,
  holderStatus: {
    enabled: false,
    eligible: false,
    mint: null,
    minAmount: null,
    currentAmount: null,
    symbol: 'DAEMON',
  },
  priceUsdc: null,
  durationDays: null,
}

export const useProStore = create<ProStoreState>((set, get) => ({
  subscription: EMPTY_SUBSCRIPTION,
  price: null,
  arenaSubmissions: [],
  quota: null,
  subscribing: false,
  loadingArena: false,
  loadingQuota: false,
  syncingSkills: false,
  syncingMcp: false,
  error: null,

  refreshStatus: async (walletAddress) => {
    try {
      const result = walletAddress
        ? await window.daemon.pro.refreshStatus(walletAddress)
        : await window.daemon.pro.status()
      if (result.ok && result.data) {
        set({ subscription: result.data })
      } else {
        set({ error: result.error ?? 'Failed to refresh Pro status' })
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to refresh Pro status' })
    }
  },

  fetchPrice: async () => {
    try {
      const result = await window.daemon.pro.fetchPrice()
      if (result.ok && result.data) set({ price: result.data })
      else set({ error: result.error ?? 'Failed to fetch Pro price' })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch Pro price' })
    }
  },

  subscribe: async (walletId) => {
    set({ subscribing: true, error: null })
    try {
      const result = await window.daemon.pro.subscribe(walletId)
      if (result.ok && result.data) {
        set({
          subscription: result.data.state,
          price: result.data.price,
          subscribing: false,
        })
        return true
      }
      set({ error: result.error ?? 'Subscribe failed', subscribing: false })
      return false
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Subscribe failed',
        subscribing: false,
      })
      return false
    }
  },

  claimHolderAccess: async (walletId) => {
    set({ subscribing: true, error: null })
    try {
      const result = await window.daemon.pro.claimHolderAccess(walletId)
      if (result.ok && result.data) {
        set({ subscription: result.data.state, subscribing: false })
        return true
      }
      set({ error: result.error ?? 'Holder claim failed', subscribing: false })
      return false
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Holder claim failed',
        subscribing: false,
      })
      return false
    }
  },

  signOut: async () => {
    const result = await window.daemon.pro.signOut()
    if (result.ok) {
      set({ subscription: EMPTY_SUBSCRIPTION, arenaSubmissions: [], quota: null })
    } else {
      set({ error: result.error ?? 'Sign out failed' })
    }
  },

  loadArena: async () => {
    if (!get().subscription.active) return
    set({ loadingArena: true, error: null })
    try {
      const result = await window.daemon.pro.arenaList()
      if (result.ok && result.data) {
        set({ arenaSubmissions: result.data, loadingArena: false })
      } else {
        set({ error: result.error ?? 'Failed to load Arena', loadingArena: false })
      }
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load Arena',
        loadingArena: false,
      })
    }
  },

  submitToArena: async (input) => {
    set({ error: null })
    try {
      const result = await window.daemon.pro.arenaSubmit(input)
      if (result.ok && result.data) {
        await get().loadArena()
        return result.data.id
      }
      set({ error: result.error ?? 'Submission failed' })
      return null
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Submission failed' })
      return null
    }
  },

  voteArena: async (submissionId) => {
    try {
      const result = await window.daemon.pro.arenaVote(submissionId)
      if (result.ok) {
        set((state) => ({
          arenaSubmissions: state.arenaSubmissions.map((submission) =>
            submission.id === submissionId ? { ...submission, votes: submission.votes + 1 } : submission,
          ),
        }))
        return true
      }
      set({ error: result.error ?? 'Vote failed' })
      return false
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Vote failed' })
      return false
    }
  },

  loadQuota: async () => {
    if (!get().subscription.active) return
    set({ loadingQuota: true })
    try {
      const result = await window.daemon.pro.quota()
      if (result.ok && result.data) {
        set({ quota: result.data, loadingQuota: false })
      } else {
        set({ loadingQuota: false })
      }
    } catch {
      set({ loadingQuota: false })
    }
  },

  syncSkills: async () => {
    set({ syncingSkills: true, error: null })
    try {
      const result = await window.daemon.pro.skillsSync()
      set({ syncingSkills: false })
      if (result.ok && result.data) return result.data
      set({ error: result.error ?? 'Skill sync failed' })
      return null
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Skill sync failed',
        syncingSkills: false,
      })
      return null
    }
  },

  pushMcp: async () => {
    set({ syncingMcp: true, error: null })
    try {
      const result = await window.daemon.pro.mcpPush()
      set({ syncingMcp: false })
      if (result.ok && result.data) return result.data.count
      set({ error: result.error ?? 'MCP push failed' })
      return null
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'MCP push failed',
        syncingMcp: false,
      })
      return null
    }
  },

  pullMcp: async () => {
    set({ syncingMcp: true, error: null })
    try {
      const result = await window.daemon.pro.mcpPull()
      set({ syncingMcp: false })
      if (result.ok && result.data) return result.data.count
      set({ error: result.error ?? 'MCP pull failed' })
      return null
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'MCP pull failed',
        syncingMcp: false,
      })
      return null
    }
  },

  clearError: () => set({ error: null }),
}))

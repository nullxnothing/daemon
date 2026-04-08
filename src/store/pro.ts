import { create } from 'zustand'

/**
 * Daemon Pro state store.
 *
 * Holds:
 *   - subscription state (active, expiresAt, features, tier)
 *   - price info fetched from the server (displayed in the subscribe dialog)
 *   - arena submissions list (refreshed on panel open + manual refresh)
 *   - quota (current month's priority-api usage)
 *
 * Loading flags are kept per-operation so the UI can show spinners without
 * toggling everything at once (e.g. voting shouldn't flicker the arena list).
 */

interface PriceInfo {
  priceUsdc: number
  durationDays: number
  network: string
  payTo: string
}

interface SubscriptionState {
  active: boolean
  walletId: string | null
  walletAddress: string | null
  expiresAt: number | null
  features: Array<'arena' | 'pro-skills' | 'mcp-sync' | 'priority-api'>
  tier: 'pro' | null
}

interface ArenaSubmission {
  id: string
  title: string
  author: { handle: string; wallet: string }
  description: string
  category: 'tool' | 'agent' | 'skill' | 'mcp' | 'grind-recipe'
  themeWeek: string | null
  submittedAt: number
  status: 'submitted' | 'featured' | 'winner' | 'shipped'
  votes: number
  githubUrl?: string
}

interface Quota {
  quota: number
  used: number
  remaining: number
}

interface ProStoreState {
  subscription: SubscriptionState
  price: PriceInfo | null
  arenaSubmissions: ArenaSubmission[]
  quota: Quota | null

  subscribing: boolean
  loadingArena: boolean
  loadingQuota: boolean
  syncingSkills: boolean
  syncingMcp: boolean
  error: string | null

  refreshStatus: () => Promise<void>
  fetchPrice: () => Promise<void>
  subscribe: (walletId: string) => Promise<boolean>
  signOut: () => Promise<void>
  loadArena: () => Promise<void>
  submitToArena: (input: { title: string; description: string; category: string; githubUrl: string }) => Promise<string | null>
  voteArena: (submissionId: string) => Promise<boolean>
  loadQuota: () => Promise<void>
  syncSkills: () => Promise<{ installed: string[]; skipped: string[] } | null>
  pushMcp: () => Promise<number | null>
  pullMcp: () => Promise<number | null>
  clearError: () => void
}

const EMPTY_SUBSCRIPTION: SubscriptionState = {
  active: false,
  walletId: null,
  walletAddress: null,
  expiresAt: null,
  features: [],
  tier: null,
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

  refreshStatus: async () => {
    try {
      const res = await window.daemon.pro.status()
      if (res.ok && res.data) {
        set({
          subscription: {
            active: res.data.active,
            walletId: res.data.walletId,
            walletAddress: res.data.walletAddress,
            expiresAt: res.data.expiresAt,
            features: res.data.features,
            tier: res.data.tier,
          },
        })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to read Pro status' })
    }
  },

  fetchPrice: async () => {
    try {
      const res = await window.daemon.pro.fetchPrice()
      if (res.ok && res.data) {
        set({ price: res.data })
      } else {
        set({ error: res.error ?? 'Failed to fetch price' })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch price' })
    }
  },

  subscribe: async (walletId) => {
    set({ subscribing: true, error: null })
    try {
      const res = await window.daemon.pro.subscribe(walletId)
      if (res.ok && res.data) {
        set({
          subscription: {
            active: res.data.state.active,
            walletId: res.data.state.walletId,
            walletAddress: res.data.state.walletAddress,
            expiresAt: res.data.state.expiresAt,
            features: res.data.state.features,
            tier: res.data.state.tier,
          },
          price: res.data.price,
          subscribing: false,
        })
        return true
      }
      set({ error: res.error ?? 'Subscribe failed', subscribing: false })
      return false
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Subscribe failed',
        subscribing: false,
      })
      return false
    }
  },

  signOut: async () => {
    try {
      await window.daemon.pro.signOut()
      set({
        subscription: EMPTY_SUBSCRIPTION,
        arenaSubmissions: [],
        quota: null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Sign out failed' })
    }
  },

  loadArena: async () => {
    if (!get().subscription.active) return
    set({ loadingArena: true, error: null })
    try {
      const res = await window.daemon.pro.arenaList()
      if (res.ok && res.data) {
        set({ arenaSubmissions: res.data, loadingArena: false })
      } else {
        set({ error: res.error ?? 'Failed to load arena', loadingArena: false })
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load arena',
        loadingArena: false,
      })
    }
  },

  submitToArena: async (input) => {
    set({ error: null })
    try {
      const res = await window.daemon.pro.arenaSubmit(input)
      if (res.ok && res.data) {
        // Refresh the list so the new submission appears immediately
        await get().loadArena()
        return res.data.id
      }
      set({ error: res.error ?? 'Submission failed' })
      return null
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Submission failed' })
      return null
    }
  },

  voteArena: async (submissionId) => {
    try {
      const res = await window.daemon.pro.arenaVote(submissionId)
      if (res.ok) {
        // Optimistically bump the vote count in the local list
        set((s) => ({
          arenaSubmissions: s.arenaSubmissions.map((sub) =>
            sub.id === submissionId ? { ...sub, votes: sub.votes + 1 } : sub,
          ),
        }))
        return true
      }
      set({ error: res.error ?? 'Vote failed' })
      return false
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Vote failed' })
      return false
    }
  },

  loadQuota: async () => {
    if (!get().subscription.active) return
    set({ loadingQuota: true })
    try {
      const res = await window.daemon.pro.quota()
      if (res.ok && res.data) {
        set({ quota: res.data, loadingQuota: false })
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
      const res = await window.daemon.pro.skillsSync()
      set({ syncingSkills: false })
      if (res.ok && res.data) return res.data
      set({ error: res.error ?? 'Skill sync failed' })
      return null
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Skill sync failed',
        syncingSkills: false,
      })
      return null
    }
  },

  pushMcp: async () => {
    set({ syncingMcp: true, error: null })
    try {
      const res = await window.daemon.pro.mcpPush()
      set({ syncingMcp: false })
      if (res.ok && res.data) return res.data.count
      set({ error: res.error ?? 'MCP push failed' })
      return null
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'MCP push failed',
        syncingMcp: false,
      })
      return null
    }
  },

  pullMcp: async () => {
    set({ syncingMcp: true, error: null })
    try {
      const res = await window.daemon.pro.mcpPull()
      set({ syncingMcp: false })
      if (res.ok && res.data) return res.data.count
      set({ error: res.error ?? 'MCP pull failed' })
      return null
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'MCP pull failed',
        syncingMcp: false,
      })
      return null
    }
  },

  clearError: () => set({ error: null }),
}))

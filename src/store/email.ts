import { create } from 'zustand'
import type { EmailAccount, EmailMessage, ExtractionResult } from '../types/daemon.d'

export type FilterMode = 'all' | 'unread' | 'important' | 'newsletters'
export type ViewMode = 'inbox' | 'compose' | 'message'
export type AISidebarMode = 'summary' | 'extraction' | 'cleanup' | null

interface EmailStore {
  accounts: EmailAccount[]
  activeAccountId: string | 'all'
  messages: EmailMessage[]
  selectedMessageId: string | null
  extractions: Record<string, ExtractionResult>
  summaries: Record<string, string>
  loading: boolean
  error: string | null
  showSettings: boolean
  showAddAccount: boolean
  companionMessageId: string | null
  unreadCounts: Record<string, number>
  unreadTotal: number

  // New state
  filterMode: FilterMode
  viewMode: ViewMode
  selectMode: boolean
  selectedIds: Set<string>
  aiSidebar: AISidebarMode
  aiSidebarData: string | null
  aiSidebarLoading: boolean

  loadAccounts: () => Promise<void>
  setActiveAccount: (id: string | 'all') => void
  loadMessages: (accountId?: string, query?: string) => Promise<void>
  selectMessage: (id: string | null) => void
  extractCode: (messageId: string, accountId: string) => Promise<void>
  summarize: (messageId: string, accountId: string) => Promise<void>
  syncAccount: (accountId: string) => Promise<void>
  pollUnreadCounts: () => Promise<void>
  setShowSettings: (show: boolean) => void
  setShowAddAccount: (show: boolean) => void
  openCompanion: (messageId: string) => void
  closeCompanion: () => void

  // New actions
  setFilterMode: (mode: FilterMode) => void
  setViewMode: (mode: ViewMode) => void
  toggleSelectMode: () => void
  toggleSelected: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
  setAISidebar: (mode: AISidebarMode, data?: string | null) => void
  closeAISidebar: () => void
  readMessage: (messageId: string, accountId: string) => Promise<void>
  sendEmail: (accountId: string, to: string, subject: string, body: string) => Promise<{ ok: boolean; error?: string }>
  markMessageRead: (messageId: string, accountId: string) => Promise<void>
  markAllRead: () => Promise<number>
}

export const useEmailStore = create<EmailStore>((set, get) => ({
  accounts: [],
  activeAccountId: 'all',
  messages: [],
  selectedMessageId: null,
  extractions: {},
  summaries: {},
  loading: false,
  error: null,
  showSettings: false,
  showAddAccount: false,
  companionMessageId: null,
  unreadCounts: {},
  unreadTotal: 0,

  filterMode: 'all',
  viewMode: 'inbox',
  selectMode: false,
  selectedIds: new Set(),
  aiSidebar: null,
  aiSidebarData: null,
  aiSidebarLoading: false,

  loadAccounts: async () => {
    try {
      const res = await window.daemon.email.accounts()
      if (res.ok && res.data) {
        set({ accounts: res.data })
      } else {
        set({ error: res.error ?? 'Failed to load accounts' })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load accounts' })
    }
  },

  setActiveAccount: (id) => {
    set({ activeAccountId: id, selectedMessageId: null, viewMode: 'inbox' })
    get().loadMessages(id === 'all' ? undefined : id)
  },

  loadMessages: async (accountId, query) => {
    set({ loading: true, error: null })
    try {
      const targetId = accountId ?? (get().activeAccountId === 'all' ? 'all' : get().activeAccountId)
      const res = await window.daemon.email.messages(targetId, query)
      if (res.ok && res.data) {
        set({ messages: res.data, loading: false })
      } else {
        set({ error: res.error ?? 'Failed to load messages', loading: false })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to load messages', loading: false })
    }
  },

  selectMessage: (id) => {
    if (id) {
      set({ selectedMessageId: id, viewMode: 'message' })
      // Auto-fetch full body
      const msg = get().messages.find((m) => m.id === id)
      if (msg) get().readMessage(id, msg.accountId)
    } else {
      set({ selectedMessageId: null, viewMode: 'inbox', aiSidebar: null, aiSidebarData: null })
    }
  },

  readMessage: async (messageId, accountId) => {
    try {
      const res = await window.daemon.email.read(accountId, messageId)
      if (res.ok && res.data) {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, body: res.data!.body, isRead: true } : m
          ),
        }))
        // Mark as read on the provider (best-effort, don't block UI)
        window.daemon.email.markRead(accountId, [messageId]).catch(() => {})
      }
    } catch {
      // Silent — body fetch is best-effort
    }
  },

  extractCode: async (messageId, accountId) => {
    try {
      const res = await window.daemon.email.extract(accountId, messageId)
      if (res.ok && res.data) {
        set((s) => ({
          extractions: { ...s.extractions, [messageId]: res.data! },
        }))
      } else {
        set({ error: res.error ?? 'Extraction failed' })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Extraction failed' })
    }
  },

  summarize: async (messageId, accountId) => {
    try {
      const res = await window.daemon.email.summarize(accountId, messageId)
      if (res.ok && res.data) {
        set((s) => ({
          summaries: { ...s.summaries, [messageId]: res.data!.summary },
        }))
      } else {
        set({ error: res.error ?? 'Summarization failed' })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Summarization failed' })
    }
  },

  syncAccount: async (accountId) => {
    try {
      await window.daemon.email.sync(accountId)
      await get().loadAccounts()
      await get().loadMessages()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Sync failed' })
    }
  },

  pollUnreadCounts: async () => {
    // Skip polling when no accounts are configured — otherwise this fires a
    // no-op IPC call once per minute, forever (and the email IPC module may
    // not even be loaded if the user disabled it).
    if (get().accounts.length === 0) return
    try {
      const res = await window.daemon.email.unreadCounts()
      if (res.ok && res.data) {
        const counts = res.data
        const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
        set({ unreadCounts: counts, unreadTotal: total })
      }
    } catch {
      // Silently ignore poll failures
    }
  },

  setShowSettings: (show) => set({ showSettings: show }),
  setShowAddAccount: (show) => set({ showAddAccount: show }),
  openCompanion: (messageId) => set({ companionMessageId: messageId }),
  closeCompanion: () => set({ companionMessageId: null }),

  setFilterMode: (mode) => set({ filterMode: mode }),
  setViewMode: (mode) => set({ viewMode: mode, selectedMessageId: mode === 'inbox' ? null : get().selectedMessageId }),
  toggleSelectMode: () => set((s) => ({ selectMode: !s.selectMode, selectedIds: new Set() })),
  toggleSelected: (id) => set((s) => {
    const next = new Set(s.selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { selectedIds: next }
  }),
  selectAll: () => set((s) => ({ selectedIds: new Set(s.messages.map((m) => m.id)) })),
  clearSelection: () => set({ selectedIds: new Set() }),
  setAISidebar: (mode, data = null) => set({ aiSidebar: mode, aiSidebarData: data }),
  closeAISidebar: () => set({ aiSidebar: null, aiSidebarData: null, aiSidebarLoading: false }),

  sendEmail: async (accountId, to, subject, body) => {
    try {
      const res = await window.daemon.email.send(accountId, to, subject, body)
      if (res.ok) {
        return { ok: true }
      }
      return { ok: false, error: res.error ?? 'Send failed' }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Send failed' }
    }
  },

  markMessageRead: async (messageId, accountId) => {
    try {
      await window.daemon.email.markRead(accountId, [messageId])
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, isRead: true } : m
        ),
      }))
    } catch {
      // Best-effort
    }
  },

  markAllRead: async () => {
    try {
      const activeId = get().activeAccountId
      const targetId = activeId === 'all' ? undefined : activeId
      const res = await window.daemon.email.markAllRead(targetId)
      if (res.ok && res.data) {
        set((s) => ({
          messages: s.messages.map((m) => ({ ...m, isRead: true })),
          unreadTotal: 0,
          unreadCounts: Object.fromEntries(
            Object.entries(s.unreadCounts).map(([k]) => [k, 0])
          ),
        }))
        return res.data.count
      }
      return 0
    } catch {
      return 0
    }
  },
}))

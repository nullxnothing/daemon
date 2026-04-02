import { create } from 'zustand'

interface ImageRecord {
  id: string
  filename: string
  filepath: string
  prompt: string | null
  model: string | null
  project_id: string | null
  tags: string
  source: string
  created_at: number
}

interface ImageFilter {
  projectId?: string
  source?: string
  model?: string
  limit?: number
  offset?: number
}

const MODEL_PRICING: Record<string, number> = {
  fast: 0.02,
  standard: 0.04,
  ultra: 0.06,
}

interface ImageStore {
  images: ImageRecord[]
  loading: boolean
  generating: boolean
  error: string | null
  selectedId: string | null
  filter: ImageFilter
  hasApiKey: boolean
  watcherRunning: boolean
  sessionCount: number
  sessionCost: number

  loadImages: (filter?: ImageFilter) => Promise<void>
  generate: (input: {
    prompt: string
    model: string
    aspectRatio: string
    projectId?: string
    tags?: string[]
  }) => Promise<void>
  deleteImage: (id: string) => Promise<void>
  select: (id: string | null) => void
  setFilter: (filter: Partial<ImageFilter>) => void
  checkApiKey: () => Promise<void>
  toggleWatcher: () => Promise<void>
  checkWatcher: () => Promise<void>
}

export const useImageStore = create<ImageStore>((set, get) => ({
  images: [],
  loading: false,
  generating: false,
  error: null,
  selectedId: null,
  filter: { limit: 50, offset: 0 },
  hasApiKey: false,
  watcherRunning: false,
  sessionCount: 0,
  sessionCost: 0,

  loadImages: async (filter) => {
    const active = filter ?? get().filter
    set({ loading: true, error: null })
    try {
      const res = await window.daemon.images.list(active)
      if (res.ok && res.data) {
        set({ images: res.data, loading: false })
      } else {
        set({ loading: false, error: res.error ?? 'Failed to load images' })
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load images' })
    }
  },

  generate: async (input) => {
    set({ generating: true, error: null })
    try {
      const res = await window.daemon.images.generate(input)
      if (res.ok && res.data) {
        const cost = MODEL_PRICING[input.model] ?? 0.04
        set((s) => ({
          generating: false,
          sessionCount: s.sessionCount + 1,
          sessionCost: s.sessionCost + cost,
        }))
        await get().loadImages()
      } else {
        set({ generating: false, error: res.error ?? 'Generation failed' })
      }
    } catch (err) {
      set({ generating: false, error: err instanceof Error ? err.message : 'Generation failed' })
    }
  },

  deleteImage: async (id) => {
    try {
      const res = await window.daemon.images.delete(id)
      if (res.ok) {
        set((s) => ({
          images: s.images.filter((img) => img.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        }))
      } else {
        set({ error: res.error ?? 'Delete failed' })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Delete failed' })
    }
  },

  select: (id) => set({ selectedId: id }),

  setFilter: (partial) => {
    const merged = { ...get().filter, ...partial }
    set({ filter: merged })
    get().loadImages(merged)
  },

  checkApiKey: async () => {
    try {
      const res = await window.daemon.images.hasApiKey()
      if (res.ok) {
        set({ hasApiKey: !!res.data })
      }
    } catch {
      set({ hasApiKey: false })
    }
  },

  toggleWatcher: async () => {
    try {
      const running = get().watcherRunning
      if (running) {
        await window.daemon.images.stopWatcher()
        set({ watcherRunning: false })
      } else {
        await window.daemon.images.startWatcher()
        set({ watcherRunning: true })
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Watcher toggle failed' })
    }
  },

  checkWatcher: async () => {
    try {
      const res = await window.daemon.images.watcherStatus()
      if (res.ok) {
        set({ watcherRunning: !!res.data })
      }
    } catch {
      set({ watcherRunning: false })
    }
  },
}))

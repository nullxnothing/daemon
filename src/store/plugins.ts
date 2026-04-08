import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'
import type { PluginRow } from '../types/daemon.d'

interface PluginState {
  plugins: PluginRow[]
  loaded: boolean
  activePluginId: string | null

  load: () => Promise<void>
  toggle: (id: string, enabled: boolean) => Promise<void>
  reorder: (orderedIds: string[]) => Promise<void>
  setActivePlugin: (id: string | null) => void
  updateConfig: (id: string, config: Record<string, unknown>) => Promise<void>
}

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  loaded: false,
  activePluginId: null,

  load: async () => {
    const res = await daemon.plugins.list()
    if (res.ok && res.data) set({ plugins: res.data, loaded: true })
  },

  toggle: async (id, enabled) => {
    const res = await daemon.plugins.setEnabled(id, enabled)
    if (res.ok) {
      set((s) => ({
        plugins: s.plugins.map((p) =>
          p.id === id ? { ...p, enabled: enabled ? 1 : 0 } : p
        ),
      }))
      if (!enabled && get().activePluginId === id) {
        set({ activePluginId: null })
      }
    }
  },

  reorder: async (orderedIds) => {
    const res = await daemon.plugins.reorder(orderedIds)
    if (res.ok) {
      set((s) => ({
        plugins: orderedIds.map((id, i) => {
          const p = s.plugins.find((pl) => pl.id === id)!
          return { ...p, sort_order: i }
        }),
      }))
    }
  },

  setActivePlugin: (id) => set({ activePluginId: id }),

  updateConfig: async (id, config) => {
    const json = JSON.stringify(config)
    const res = await daemon.plugins.setConfig(id, json)
    if (res.ok) {
      set((s) => ({
        plugins: s.plugins.map((p) =>
          p.id === id ? { ...p, config: json } : p
        ),
      }))
    }
  },
}))

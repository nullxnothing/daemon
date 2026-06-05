import { create } from 'zustand'
import { daemon } from '../lib/daemonBridge'
import {
  CAPABILITY_PACKS,
  CAPABILITY_PACKS_BY_ID,
  defaultEnabledPacks,
  isCorePack,
} from '../constants/capabilityPacks'
import type { PackId } from '../constants/capabilityPacks'
import { useWorkspaceProfileStore } from './workspaceProfile'
import { usePluginStore } from './plugins'

interface CapabilityPacksState {
  enabledPacks: Record<PackId, boolean>
  loaded: boolean

  load: () => Promise<void>
  isPackEnabled: (id: PackId) => boolean
  setPackEnabled: (id: PackId, enabled: boolean) => Promise<void>
}

export const useCapabilityPacksStore = create<CapabilityPacksState>((set, get) => ({
  enabledPacks: defaultEnabledPacks(),
  loaded: false,

  load: async () => {
    try {
      const res = await daemon.settings.getEnabledPacks()
      if (res.ok && res.data) {
        // Merge over defaults so newly added packs default to enabled and core
        // packs stay on regardless of stored state.
        const merged = { ...defaultEnabledPacks(), ...res.data } as Record<PackId, boolean>
        for (const pack of CAPABILITY_PACKS) {
          if (pack.status === 'core') merged[pack.id] = true
        }
        set({ enabledPacks: merged, loaded: true })
      } else {
        set({ loaded: true })
      }
    } catch {
      set({ loaded: true })
    }
  },

  isPackEnabled: (id) => {
    if (isCorePack(id)) return true
    return get().enabledPacks[id] !== false
  },

  setPackEnabled: async (id, enabled) => {
    const pack = CAPABILITY_PACKS_BY_ID[id]
    if (!pack || pack.status === 'core') return

    const next = { ...get().enabledPacks, [id]: enabled }
    set({ enabledPacks: next })

    // Persist enabled-pack state.
    await daemon.settings.setEnabledPacks(next).catch(() => {})

    // Flip visibility of every member tool through the existing workspace-profile
    // store (handles guard update + closing open hidden tabs + persistence).
    const profile = useWorkspaceProfileStore.getState()
    for (const toolId of pack.toolIds) {
      await profile.setToolVisible(toolId, enabled).catch(() => {})
    }

    // Toggle member plugins on/off.
    const plugins = usePluginStore.getState()
    for (const pluginId of pack.pluginIds) {
      await plugins.toggle(pluginId, enabled).catch(() => {})
    }

    // Notify the main process so it can start/stop gated IPC domains live.
    // (No-op until the packs IPC bridge ships; guarded so PR1 stays standalone.)
    const packsBridge = (daemon as { packs?: { setEnabled?: (id: string, enabled: boolean) => Promise<unknown> } }).packs
    if (packsBridge?.setEnabled) {
      await packsBridge.setEnabled(id, enabled).catch(() => {})
    }
  },
}))

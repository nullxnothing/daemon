import { create } from 'zustand'
import type { WorkspaceProfileName, WorkspaceProfile } from '../../electron/shared/types'
import { getDefaultVisibility, PROFILE_PRESETS } from '../constants/workspaceProfiles'
import { BUILTIN_TOOL_IDS } from '../constants/toolIds'
import { isToolDisableable } from '../constants/toolRegistry'
import { useUIStore } from './ui'
import { useNotificationsStore } from './notifications'
import { daemon } from '../lib/daemonBridge'

interface WorkspaceProfileState {
  profileName: WorkspaceProfileName
  toolVisibility: Record<string, boolean>
  loaded: boolean

  load: () => Promise<void>
  setProfile: (name: WorkspaceProfileName) => Promise<void>
  setToolVisible: (toolId: string, visible: boolean) => Promise<void>
  isToolVisible: (toolId: string) => boolean
}

export const useWorkspaceProfileStore = create<WorkspaceProfileState>((set, get) => ({
  profileName: 'custom',
  toolVisibility: {},
  loaded: false,

  load: async () => {
    try {
      const res = await daemon.settings.getWorkspaceProfile()
      if (res.ok && res.data) {
        set({
          profileName: res.data.name,
          toolVisibility: res.data.toolVisibility,
          loaded: true,
        })
      } else {
        // No profile saved yet — default to custom (all visible)
        set({
          profileName: 'custom',
          toolVisibility: getDefaultVisibility('custom', BUILTIN_TOOL_IDS),
          loaded: true,
        })
      }
    } catch {
      set({ loaded: true })
    }
  },

  setProfile: async (name) => {
    const visibility = getDefaultVisibility(name, BUILTIN_TOOL_IDS)
    set({ profileName: name, toolVisibility: visibility })
    const profile: WorkspaceProfile = { name, toolVisibility: visibility }
    await daemon.settings.setWorkspaceProfile(profile).catch(() => {})

    // Hide pinned tools that are no longer visible in the new profile.
    // We don't delete them — pinnedTools persists, but the sidebar will
    // filter via isToolVisible. Surface a toast so the user notices.
    const pinned = useUIStore.getState().pinnedTools
    const hidden = pinned.filter((id) => id !== 'settings' && visibility[id] === false)
    if (hidden.length > 0) {
      useNotificationsStore.getState().pushToast({
        kind: 'info',
        message: `${hidden.length} pinned tool${hidden.length === 1 ? '' : 's'} hidden in this profile`,
        context: 'Workspace profile',
        ttlMs: 7000,
      })
    }
  },

  setToolVisible: async (toolId, visible) => {
    const { toolVisibility, profileName } = get()
    if (!isToolDisableable(toolId)) return
    const updated = { ...toolVisibility, [toolId]: visible }
    set({ toolVisibility: updated, profileName: 'custom' })
    const profile: WorkspaceProfile = { name: 'custom', toolVisibility: updated }
    await daemon.settings.setWorkspaceProfile(profile).catch(() => {})
  },

  isToolVisible: (toolId) => {
    if (!isToolDisableable(toolId)) return true
    const { toolVisibility, loaded } = get()
    if (!loaded) return true
    // Unknown tools default to visible
    if (!(toolId in toolVisibility)) return true
    return toolVisibility[toolId] ?? true
  },
}))

// Derived selector for use in components
export function selectToolVisible(toolId: string) {
  return (state: WorkspaceProfileState) => state.isToolVisible(toolId)
}

// Re-export profile presets for convenience
export { PROFILE_PRESETS }

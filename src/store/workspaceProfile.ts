import { create } from 'zustand'
import type { WorkspaceProfileName, WorkspaceProfile } from '../../electron/shared/types'
import { getDefaultVisibility, PROFILE_PRESETS } from '../constants/workspaceProfiles'
import { BUILTIN_TOOL_IDS } from '../constants/toolIds'

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
      const res = await window.daemon.settings.getWorkspaceProfile()
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
    await window.daemon.settings.setWorkspaceProfile(profile).catch(() => {})
  },

  setToolVisible: async (toolId, visible) => {
    const { toolVisibility, profileName } = get()
    // Settings is always visible — cannot be hidden
    if (toolId === 'settings') return
    const updated = { ...toolVisibility, [toolId]: visible }
    set({ toolVisibility: updated, profileName: 'custom' })
    const profile: WorkspaceProfile = { name: 'custom', toolVisibility: updated }
    await window.daemon.settings.setWorkspaceProfile(profile).catch(() => {})
  },

  isToolVisible: (toolId) => {
    if (toolId === 'settings') return true
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

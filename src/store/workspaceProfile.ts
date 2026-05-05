import { create } from 'zustand'
import type { WorkspaceProfileName, WorkspaceProfile } from '../../electron/shared/types'
import { getDefaultVisibility, PROFILE_PRESETS } from '../constants/workspaceProfiles'
import { BUILTIN_TOOL_IDS } from '../constants/toolIds'
import { isToolDisableable } from '../constants/toolRegistry'
import { useUIStore } from './ui'
import { useNotificationsStore } from './notifications'
import { daemon } from '../lib/daemonBridge'
import { setToolVisibilityGuard } from '../lib/toolVisibilityGuard'

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
        const toolVisibility = normalizeToolVisibility(res.data.name, res.data.toolVisibility)
        set({
          profileName: res.data.name,
          toolVisibility,
          loaded: true,
        })
        setToolVisibilityGuard(toolVisibility)
      } else {
        const toolVisibility = getDefaultVisibility('web', BUILTIN_TOOL_IDS)
        // No profile saved yet — default to the focused web profile.
        set({
          profileName: 'web',
          toolVisibility,
          loaded: true,
        })
        setToolVisibilityGuard(toolVisibility)
      }
    } catch {
      const toolVisibility = getDefaultVisibility('web', BUILTIN_TOOL_IDS)
      set({ profileName: 'web', toolVisibility, loaded: true })
      setToolVisibilityGuard(toolVisibility)
    }
  },

  setProfile: async (name) => {
    const visibility = getDefaultVisibility(name, BUILTIN_TOOL_IDS)
    set({ profileName: name, toolVisibility: visibility })
    setToolVisibilityGuard(visibility)
    const profile: WorkspaceProfile = { name, toolVisibility: visibility }
    await daemon.settings.setWorkspaceProfile(profile).catch(() => {})

    // Hide pinned tools that are no longer visible in the new profile.
    // We don't delete them — pinnedTools persists, but the sidebar will
    // filter via isToolVisible. Surface a toast so the user notices.
    const pinned = useUIStore.getState().pinnedTools
    const hidden = pinned.filter((id) => id !== 'settings' && visibility[id] === false)
    closeHiddenWorkspaceTools(visibility)
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
    setToolVisibilityGuard(updated)
    if (!visible) closeHiddenWorkspaceTools(updated)
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

useWorkspaceProfileStore.subscribe((state) => {
  setToolVisibilityGuard(state.toolVisibility, state.loaded)
})

function normalizeToolVisibility(
  profileName: WorkspaceProfileName,
  savedVisibility: Record<string, boolean>,
): Record<string, boolean> {
  return {
    ...getDefaultVisibility(profileName, BUILTIN_TOOL_IDS),
    ...savedVisibility,
  }
}

function closeHiddenWorkspaceTools(toolVisibility: Record<string, boolean>): void {
  const ui = useUIStore.getState()
  for (const toolId of ui.workspaceToolTabs) {
    if (toolVisibility[toolId] === false) ui.closeWorkspaceTool(toolId)
  }
  if (toolVisibility.browser === false) ui.closeBrowserTab()
  if (toolVisibility.dashboard === false) ui.closeDashboardTab()
}

// Derived selector for use in components
export function selectToolVisible(toolId: string) {
  return (state: WorkspaceProfileState) => state.isToolVisible(toolId)
}

// Re-export profile presets for convenience
export { PROFILE_PRESETS }

import { create } from 'zustand'

/**
 * Tiny imperative-action bus for app-level commands that live in App.tsx
 * local state (file palette, agent launcher, terminal toggle) but need to
 * be triggered from deeply-nested components without synthetic keyboard events.
 *
 * App.tsx subscribes to these requestId values; each new id resets the trigger.
 * Components call openFilePalette() / openAgentLauncher() / focusTerminal() —
 * no shortcut coupling, no fragile dispatchEvent calls.
 */
interface AppActionsState {
  filePaletteRequestId: number
  agentLauncherRequestId: number
  terminalFocusRequestId: number

  openFilePalette: () => void
  openAgentLauncher: () => void
  focusTerminal: () => void
}

export const useAppActions = create<AppActionsState>((set) => ({
  filePaletteRequestId: 0,
  agentLauncherRequestId: 0,
  terminalFocusRequestId: 0,

  openFilePalette: () => set((s) => ({ filePaletteRequestId: s.filePaletteRequestId + 1 })),
  openAgentLauncher: () => set((s) => ({ agentLauncherRequestId: s.agentLauncherRequestId + 1 })),
  focusTerminal: () => set((s) => ({ terminalFocusRequestId: s.terminalFocusRequestId + 1 })),
}))

import type { AriaContextSnapshot } from '../../electron/shared/types'
import { useUIStore } from '../store/ui'

/** Which context chips ARIA includes by default (mockup checkbox-chips). */
let chips: AriaContextSnapshot['chips'] = {
  activeFile: true,
  projectTree: true,
  gitDiff: false,
  terminalLogs: false,
  walletContext: false,
}

export function setAriaChips(next: Partial<AriaContextSnapshot['chips']>): void {
  chips = { ...chips, ...next }
}

export function getAriaChips(): AriaContextSnapshot['chips'] {
  return chips
}

/** Build the per-turn snapshot of app state passed to the operator loop. */
export function buildAriaSnapshot(): AriaContextSnapshot {
  const s = useUIStore.getState()
  const activeProjectId = s.activeProjectId
  const openFilePath = activeProjectId ? (s.activeFilePathByProject[activeProjectId] ?? null) : null
  return {
    activeProjectId,
    activeProjectPath: s.activeProjectPath,
    currentPanelId: s.activeWorkspaceToolId,
    openFilePath,
    chips,
  }
}

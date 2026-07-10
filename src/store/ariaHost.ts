/**
 * Host port for the ARIA store. The store itself is shell-agnostic; whatever
 * shell mounts it (the full IDE, DAEMON Lite) installs a host that supplies
 * project context and applies renderer-side effects. The default null-host
 * serves shells with no workspace: no project, effects are no-ops.
 *
 * Runtime imports are deliberately zero — this module must never drag IDE
 * stores into a bundle that only wants the chat surface.
 */
import type { AriaContextSnapshot, AriaUiEffect } from '../../electron/shared/types'

export type AriaHostProviderId = 'claude' | 'codex'

export interface AriaHost {
  activeProjectId(): string | null
  /** Per-turn context snapshot passed to the operator loop. */
  buildSnapshot(): AriaContextSnapshot
  /** Fire-and-forget renderer effect requested by a tool. */
  applyUiEffect(effect: AriaUiEffect): void
  /** Two-phase effect whose result feeds the tool_result. */
  runUiEffectWithData(effect: AriaUiEffect): Promise<unknown>
  /**
   * Launch an interactive provider-login terminal. Optional: shells without
   * terminals (Lite) omit it and the store surfaces a notice instead.
   * Resolves with the notice to show; throws with a user-facing message.
   */
  openProviderLoginTerminal?: (provider: AriaHostProviderId) => Promise<string>
}

const nullHost: AriaHost = {
  activeProjectId: () => null,
  buildSnapshot: () => ({
    activeProjectId: null,
    activeProjectPath: null,
    currentPanelId: null,
    openFilePath: null,
    chips: {
      activeFile: false,
      projectTree: false,
      gitDiff: false,
      terminalLogs: false,
      walletContext: false,
      projectMemory: true,
    },
  }),
  applyUiEffect: () => {},
  runUiEffectWithData: async () => ({ ok: true }),
}

let host: AriaHost = nullHost

export function setAriaHost(next: AriaHost): void {
  host = next
}

export function getAriaHost(): AriaHost {
  return host
}

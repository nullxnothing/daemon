/**
 * Frame protocol for the ARIA standalone CLI - the typed contract between the
 * backend (`AriaTerminalBackendService`, `--aria-server`) and the launcher
 * (`scripts/aria.mjs`). Frames are newline-delimited JSON on stdio.
 *
 * The launcher is plain JS and can't import these types, but the backend uses
 * them so every `emit()` is type-checked against one source. New CLI behavior
 * (a command, a banner, a structured list) is added here first, then surfaced
 * over a frame rather than re-implemented on both sides.
 */
import type {
  AriaSession,
  AriaToolEvent,
  AriaToolRiskTier,
  DaemonAiModelLane,
} from '../../../shared/types'
import type { AriaThemeColor } from './ansi-theme'

/** A command the launcher should know about (drives /help, autocomplete, footer). */
export interface AriaCommandManifestEntry {
  /** Slash name without the leading slash, e.g. "sessions". */
  name: string
  synopsis: string
  /** Argument hint shown in help, e.g. "<id>" or "auto|fast|...". */
  args?: string
  /** Risk tier for color coding; commands themselves are operator-local (read). */
  risk: AriaToolRiskTier
  /** Optional key hint shown in the footer, e.g. "shift+tab". */
  keybinding?: string
}

/** One ARIA tool, projected for the /tools listing. */
export interface AriaToolManifestEntry {
  name: string
  kind: string
  risk: AriaToolRiskTier
  description: string
}

/** A single rendered banner line with the theme token it should be painted in. */
export interface AriaBannerLine {
  text: string
  color: AriaThemeColor
}

/** Emitted once at startup before `ready`: the launcher's view of capabilities. */
export interface AriaManifestFrame {
  type: 'manifest'
  commands: AriaCommandManifestEntry[]
  /** Theme token names the launcher may reference (parity check at runtime). */
  themeTokens: AriaThemeColor[]
}

/** Compact key/value metadata shown under the wordmark. */
export interface AriaBannerMeta {
  project: string
  network: string
  wallet: string
  session: string
  engine: string
  mode: string
}

/** Emitted once at startup before `ready`: the boot panel, computed from state. */
export interface AriaBannerFrame {
  type: 'banner'
  /** ANSI Shadow wordmark rows; the launcher paints them with a gradient. */
  wordmark: string[]
  meta: AriaBannerMeta
  version: string
  cluster: string
  session: string
}

/** Frames the backend sends to the launcher (stdout). */
export type AriaServerFrame =
  | AriaManifestFrame
  | AriaBannerFrame
  | { type: 'ready' }
  | { type: 'state'; session: AriaSession; projectPath: string | null; network: string; wallet: string | null; modelLane: DaemonAiModelLane; mode: string }
  | { type: 'busy'; busy: boolean }
  | { type: 'user'; text: string }
  | { type: 'response'; text: string; toolCalls: unknown[] }
  | { type: 'event'; event: AriaToolEvent }
  | { type: 'approval'; id: string; request: unknown }
  | { type: 'patchDecision'; id: string; proposal: unknown }
  | { type: 'sessions'; sessions: AriaSession[] }
  | { type: 'tools'; tools: AriaToolManifestEntry[] }
  | { type: 'status'; status: unknown }
  | { type: 'memories'; memories: Array<{ kind: string; title: string; value: string }> }
  | { type: 'help' }
  | { type: 'log'; level: 'info' | 'warn'; message: string }
  | { type: 'error'; message: string }
  | { type: 'exit' }

/** Frames the launcher sends to the backend (stdin). */
export type AriaClientFrame =
  | { type: 'input'; text: string }
  | { type: 'approval'; id: string; approved: boolean }
  | { type: 'patchDecision'; id: string; action: string }
  | { type: 'exit' }

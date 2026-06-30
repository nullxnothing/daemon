/**
 * ARIA boot panel - built backend-side from real runtime state and shipped to
 * the launcher as a `banner` frame. Only the backend has the version/cluster/
 * session state, so it is computed here; the launcher paints the wordmark with a
 * magenta->cyan gradient and renders the meta below it.
 */
import type { AriaBannerFrame } from './frames'

/** State the panel reads - supplied by the backend at startup. */
export interface AriaBannerState {
  version: string
  cluster: string
  rpcProvider: string
  wallet: string | null
  projectPath: string | null
  session: string
  modelLane: string
  mode: string
}

/**
 * ARIA wordmark in the "ANSI Shadow" figlet style - bold filled block letters
 * with a box-drawing drop shadow. Six rows, all equal width. Glyphs are limited
 * to the Windows-terminal-safe block + box-drawing set.
 */
const WORDMARK: string[] = [
  ' █████╗ ██████╗ ██╗ █████╗ ',
  '██╔══██╗██╔══██╗██║██╔══██╗',
  '███████║██████╔╝██║███████║',
  '██╔══██║██╔══██╗██║██╔══██║',
  '██║  ██║██║  ██║██║██║  ██║',
  '╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝',
]

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 3))}...`
}

function shortSession(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

/** Build the boot-panel frame from real runtime state. */
export function buildBanner(state: AriaBannerState): AriaBannerFrame {
  return {
    type: 'banner',
    wordmark: WORDMARK,
    meta: {
      project: truncate(state.projectPath ?? '(none)', 64),
      network: `${state.cluster} (${state.rpcProvider})`,
      wallet: state.wallet ?? '(none)',
      session: shortSession(state.session),
      engine: state.modelLane,
      mode: state.mode,
    },
    version: state.version,
    cluster: state.cluster,
    session: state.session,
  }
}

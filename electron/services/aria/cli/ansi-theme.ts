/**
 * Canonical ANSI theme for the ARIA standalone CLI - the single source of truth
 * for terminal styling. Both the compiled backend (this module) and the plain-JS
 * launcher (`scripts/aria-shared/ansi-theme.mjs`) consume these tokens; the
 * launcher mirror is a literal copy that `AriaCliThemeSync.test.ts` asserts is in
 * sync. Never inline raw `\x1b[` escapes anywhere else - add a token here.
 *
 * Tokens map to the GUI design system semantics (see styles/tokens.css) so the
 * CLI and GUI read as the same product. Status is shown via colored dots only,
 * never emoji (CLAUDE.md hard rule).
 */

/** Semantic 24-bit color tokens. Hex strings; kept identical to the GUI palette. */
export const ARIA_THEME_COLORS = {
  green: '#3ECF8E',
  greenDark: '#1A6B47',
  blue: '#60A5FA',
  amber: '#F0B429',
  red: '#EF5350',
  magenta: '#C084FC',
  cyan: '#22D3EE',
  void: '#0A0A0A',
  surface: '#171919',
  border: '#262928',
  text: '#F0F0F0',
  secondary: '#A0A0A0',
  muted: '#6E706F',
  disabled: '#4A4C4B',
} as const

export type AriaThemeColor = keyof typeof ARIA_THEME_COLORS

/**
 * Risk-tier → color token. Mirrors the ARIA tool risk gating and the GUI
 * ToolCallRow kind colors (read=blue, write=amber, sensitive=red).
 */
export const ARIA_RISK_COLOR = {
  read: 'blue',
  write: 'amber',
  sensitive: 'red',
} as const satisfies Record<string, AriaThemeColor>

/** Tool-kind → color token (read=blue, edit=amber, run=green). */
export const ARIA_KIND_COLOR = {
  read: 'blue',
  edit: 'amber',
  run: 'green',
} as const satisfies Record<string, AriaThemeColor>

/** Status dot glyph - a single Windows-safe filled circle. No emoji. */
export const ARIA_DOT = '●'

/** Convert a hex token to a 24-bit ANSI SGR foreground sequence. */
function toForeground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `\x1b[38;2;${r};${g};${b}m`
}

const RESET = '\x1b[0m'

/** True when color should be stripped - honors NO_COLOR and non-TTY output. */
export function isColorDisabled(env = process.env, isTty = process.stdout.isTTY): boolean {
  if (env.NO_COLOR) return true
  return !isTty
}

/** Wrap text in a color token's escape sequence, or return it raw when disabled. */
export function paint(token: AriaThemeColor, text: string, disabled = isColorDisabled()): string {
  if (disabled) return text
  return `${toForeground(ARIA_THEME_COLORS[token])}${text}${RESET}`
}

/** A colored status dot for a given semantic token. */
export function dot(token: AriaThemeColor, disabled = isColorDisabled()): string {
  return paint(token, ARIA_DOT, disabled)
}

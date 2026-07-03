/**
 * Launcher-side mirror of electron/services/aria/cli/ansi-theme.ts. The compiled
 * backend can't be imported by the plain-JS launcher (single Electron bundle), so
 * the theme tokens are duplicated here and asserted identical by
 * test/services/AriaCliThemeSync.test.ts - do not edit one without the other.
 */

/** Semantic 24-bit color tokens. Hex strings; identical to the GUI palette. */
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
}

/** Risk-tier → color token (read=blue, write=amber, sensitive=red). */
export const ARIA_RISK_COLOR = {
  read: 'blue',
  write: 'amber',
  sensitive: 'red',
}

/** Tool-kind → color token (read=blue, edit=amber, run=green). */
export const ARIA_KIND_COLOR = {
  read: 'blue',
  edit: 'amber',
  run: 'green',
}

/** Status dot glyph - a single Windows-safe filled circle. No emoji. */
export const ARIA_DOT = '●'

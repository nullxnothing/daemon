/**
 * Launcher-side render helpers for scripts/aria.mjs. Ink takes hex colors on the
 * `color` prop directly, so these resolve theme tokens to hex (or undefined when
 * color is disabled) and provide width math the banner/composer share.
 */
import { ARIA_THEME_COLORS, ARIA_RISK_COLOR, ARIA_KIND_COLOR } from './ansi-theme.mjs'

/** True when color should be stripped - honors NO_COLOR and non-TTY output. */
export function isColorDisabled(env = process.env, isTty = process.stdout.isTTY) {
  if (env.NO_COLOR) return true
  return !isTty
}

/** Resolve a theme token to its hex value, or undefined when color is disabled. */
export function themeColor(token, disabled = isColorDisabled()) {
  if (disabled) return undefined
  return ARIA_THEME_COLORS[token]
}

/** Hex color for a risk tier (read/write/sensitive). */
export function riskColor(risk, disabled = isColorDisabled()) {
  return themeColor(ARIA_RISK_COLOR[risk] ?? 'muted', disabled)
}

/** Hex color for a tool kind (read/edit/run). */
export function kindColor(kind, disabled = isColorDisabled()) {
  return themeColor(ARIA_KIND_COLOR[kind] ?? 'muted', disabled)
}

/** Truncate to width with a trailing ellipsis. */
export function fit(value, width) {
  if (value.length <= width) return value
  return `${value.slice(0, Math.max(0, width - 1))}...`
}

/** Left-pad to center within width (no right pad, terminal-friendly). */
export function center(value, width) {
  const pad = Math.max(0, Math.floor((width - value.length) / 2))
  return `${' '.repeat(pad)}${value}`
}

function channels(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function toHex(n) {
  return Math.round(n).toString(16).padStart(2, '0')
}

/**
 * Linearly interpolate `steps` hex colors between two endpoints (inclusive).
 * Returns an array of `#rrggbb`. With steps <= 1, returns just the start color.
 */
export function gradient(fromHex, toHex2, steps) {
  if (steps <= 1) return [fromHex]
  const [r1, g1, b1] = channels(fromHex)
  const [r2, g2, b2] = channels(toHex2)
  const out = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    out.push(`#${toHex(r1 + (r2 - r1) * t)}${toHex(g1 + (g2 - g1) * t)}${toHex(b1 + (b2 - b1) * t)}`)
  }
  return out
}

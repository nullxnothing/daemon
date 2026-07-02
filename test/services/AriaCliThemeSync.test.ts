/**
 * Guards the ARIA CLI theme's two-runtime split: the canonical TS module
 * (electron/services/aria/cli/ansi-theme.ts) and the launcher mirror
 * (scripts/aria-shared/ansi-theme.mjs) must define identical tokens. The
 * launcher can't import the compiled backend bundle, so this test is what keeps
 * the duplicate from drifting.
 */
import { describe, it, expect } from 'vitest'
import {
  ARIA_THEME_COLORS as TS_COLORS,
  ARIA_RISK_COLOR as TS_RISK,
  ARIA_KIND_COLOR as TS_KIND,
  ARIA_DOT as TS_DOT,
} from '../../electron/services/aria/cli/ansi-theme'
// @ts-expect-error - plain JS launcher module, no type declarations.
import {
  ARIA_THEME_COLORS as MJS_COLORS,
  ARIA_RISK_COLOR as MJS_RISK,
  ARIA_KIND_COLOR as MJS_KIND,
  ARIA_DOT as MJS_DOT,
} from '../../scripts/aria-shared/ansi-theme.mjs'

describe('ARIA CLI theme parity (ts ↔ mjs)', () => {
  it('color tokens are identical', () => {
    expect(MJS_COLORS).toEqual(TS_COLORS)
  })

  it('risk-tier color map is identical', () => {
    expect(MJS_RISK).toEqual(TS_RISK)
  })

  it('tool-kind color map is identical', () => {
    expect(MJS_KIND).toEqual(TS_KIND)
  })

  it('status dot glyph is identical', () => {
    expect(MJS_DOT).toBe(TS_DOT)
  })
})

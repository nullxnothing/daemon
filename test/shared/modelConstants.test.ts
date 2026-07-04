import { describe, it, expect } from 'vitest'
import { MODEL_MAP } from '../../packages/shared/src/constants'
import { resolveModelName } from '../../packages/shared/src/validation'

// Guards the shared model shorthand maps against reintroducing retired
// date-suffixed Sonnet/Opus IDs (the current aliases are dateless; only the
// Haiku 4.5 snapshot legitimately carries a date).
describe('shared model constants', () => {
  it('maps shorthands to the current model aliases', () => {
    expect(MODEL_MAP).toEqual({
      haiku: 'claude-haiku-4-5-20251001',
      sonnet: 'claude-sonnet-4-6',
      opus: 'claude-opus-4-8',
    })
  })

  it('sonnet/opus aliases carry no date suffix', () => {
    expect(MODEL_MAP.sonnet).not.toMatch(/-20\d{6}$/)
    expect(MODEL_MAP.opus).not.toMatch(/-20\d{6}$/)
  })

  it('resolveModelName agrees with MODEL_MAP for every shorthand', () => {
    for (const [shorthand, id] of Object.entries(MODEL_MAP)) {
      expect(resolveModelName(shorthand)).toBe(id)
    }
  })

  it('resolveModelName passes explicit model IDs through unchanged', () => {
    expect(resolveModelName('claude-opus-4-5')).toBe('claude-opus-4-5')
    expect(resolveModelName('claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
  })
})

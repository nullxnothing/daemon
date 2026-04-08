import { describe, expect, it } from 'vitest'
import { getEmbeddedProviderArgs, getEmbeddedProviderStartupCommand } from '../../electron/shared/providerLaunch'

describe('providerLaunch', () => {
  it('launches Claude in continue mode for embedded terminals', () => {
    expect(getEmbeddedProviderArgs('claude')).toEqual(['-c'])
    expect(getEmbeddedProviderStartupCommand('claude')).toBe('claude -c')
  })

  it('launches Codex without alt-screen for embedded terminals', () => {
    expect(getEmbeddedProviderArgs('codex')).toEqual(['--no-alt-screen'])
    expect(getEmbeddedProviderStartupCommand('codex')).toBe('codex --no-alt-screen')
  })
})

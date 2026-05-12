import { describe, expect, it } from 'vitest'
import { getEmbeddedProviderArgs, getEmbeddedProviderStartupCommand } from '../../electron/shared/providerLaunch'

describe('providerLaunch', () => {
  it('launches Claude in fresh mode for embedded terminals', () => {
    expect(getEmbeddedProviderArgs('claude')).toEqual([])
    expect(getEmbeddedProviderStartupCommand('claude')).toBe('claude')
  })

  it('launches Codex with its default TUI for embedded terminals', () => {
    expect(getEmbeddedProviderArgs('codex')).toEqual([])
    expect(getEmbeddedProviderStartupCommand('codex')).toBe('codex')
  })
})

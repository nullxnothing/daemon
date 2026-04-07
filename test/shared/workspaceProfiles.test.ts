import { describe, it, expect } from 'vitest'
import { getDefaultVisibility, PROFILE_PRESETS } from '../../src/constants/workspaceProfiles'
import { BUILTIN_TOOL_IDS } from '../../src/constants/toolIds'

describe('getDefaultVisibility — web profile', () => {
  const vis = getDefaultVisibility('web', BUILTIN_TOOL_IDS)

  it('shows git', () => expect(vis['git']).toBe(true))
  it('shows env', () => expect(vis['env']).toBe(true))
  it('shows ports', () => expect(vis['ports']).toBe(true))
  it('shows processes', () => expect(vis['processes']).toBe(true))
  it('shows settings', () => expect(vis['settings']).toBe(true))
  it('shows email', () => expect(vis['email']).toBe(true))
  it('shows deploy', () => expect(vis['deploy']).toBe(true))
  it('shows image-editor', () => expect(vis['image-editor']).toBe(true))
  it('shows docs', () => expect(vis['docs']).toBe(true))
  it('shows plugins', () => expect(vis['plugins']).toBe(true))
  it('shows recovery', () => expect(vis['recovery']).toBe(true))

  it('hides wallet', () => expect(vis['wallet']).toBe(false))
  it('hides solana-toolbox', () => expect(vis['solana-toolbox']).toBe(false))
  it('hides block-scanner', () => expect(vis['block-scanner']).toBe(false))
  it('hides dashboard', () => expect(vis['dashboard']).toBe(false))
  it('hides hackathon', () => expect(vis['hackathon']).toBe(false))
})

describe('getDefaultVisibility — solana profile', () => {
  const vis = getDefaultVisibility('solana', BUILTIN_TOOL_IDS)

  it('shows wallet', () => expect(vis['wallet']).toBe(true))
  it('shows solana-toolbox', () => expect(vis['solana-toolbox']).toBe(true))
  it('shows block-scanner', () => expect(vis['block-scanner']).toBe(true))
  it('shows dashboard', () => expect(vis['dashboard']).toBe(true))
  it('shows hackathon', () => expect(vis['hackathon']).toBe(true))
  it('shows all web tools', () => {
    expect(vis['git']).toBe(true)
    expect(vis['env']).toBe(true)
    expect(vis['settings']).toBe(true)
    expect(vis['docs']).toBe(true)
  })
})

describe('getDefaultVisibility — custom profile', () => {
  const vis = getDefaultVisibility('custom', BUILTIN_TOOL_IDS)

  it('shows every tool in BUILTIN_TOOL_IDS', () => {
    for (const id of BUILTIN_TOOL_IDS) {
      expect(vis[id]).toBe(true)
    }
  })

  it('has an entry for every builtin tool id', () => {
    expect(Object.keys(vis)).toHaveLength(BUILTIN_TOOL_IDS.length)
  })
})

describe('getDefaultVisibility — settings tool', () => {
  it('is always visible in web profile', () => {
    expect(getDefaultVisibility('web', BUILTIN_TOOL_IDS)['settings']).toBe(true)
  })

  it('is always visible in solana profile', () => {
    expect(getDefaultVisibility('solana', BUILTIN_TOOL_IDS)['settings']).toBe(true)
  })

  it('is always visible in custom profile', () => {
    expect(getDefaultVisibility('custom', BUILTIN_TOOL_IDS)['settings']).toBe(true)
  })
})

describe('getDefaultVisibility — custom tool ids', () => {
  it('correctly filters a custom tool id list with web profile', () => {
    const customIds = ['git', 'wallet', 'settings']
    const vis = getDefaultVisibility('web', customIds)
    expect(vis['git']).toBe(true)
    expect(vis['wallet']).toBe(false)
    expect(vis['settings']).toBe(true)
  })

  it('returns all true for any tool list with custom profile', () => {
    const customIds = ['tool-a', 'tool-b', 'tool-c']
    const vis = getDefaultVisibility('custom', customIds)
    expect(vis['tool-a']).toBe(true)
    expect(vis['tool-b']).toBe(true)
    expect(vis['tool-c']).toBe(true)
  })

  it('returns empty object for empty tool id list', () => {
    const vis = getDefaultVisibility('web', [])
    expect(Object.keys(vis)).toHaveLength(0)
  })
})

describe('PROFILE_PRESETS', () => {
  it('web preset includes standard web tools', () => {
    expect(PROFILE_PRESETS.web).toContain('git')
    expect(PROFILE_PRESETS.web).toContain('settings')
    expect(PROFILE_PRESETS.web).toContain('docs')
  })

  it('web preset excludes solana-specific tools', () => {
    expect(PROFILE_PRESETS.web).not.toContain('wallet')
    expect(PROFILE_PRESETS.web).not.toContain('dashboard')
  })

  it('solana preset includes all web tools plus solana-specific tools', () => {
    expect(PROFILE_PRESETS.solana).toContain('wallet')
    expect(PROFILE_PRESETS.solana).toContain('dashboard')
    expect(PROFILE_PRESETS.solana).toContain('git')
  })

  it('custom preset is an empty array (all tools visible)', () => {
    expect(PROFILE_PRESETS.custom).toEqual([])
  })
})

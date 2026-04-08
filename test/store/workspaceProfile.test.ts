import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.stubGlobal('window', {
  daemon: {
    settings: {
      getWorkspaceProfile: vi.fn().mockResolvedValue({ ok: false }),
      setWorkspaceProfile: vi.fn().mockResolvedValue({ ok: true }),
    },
  },
})

import { useWorkspaceProfileStore } from '../../src/store/workspaceProfile'
import { getDefaultVisibility } from '../../src/constants/workspaceProfiles'
import { BUILTIN_TOOL_IDS } from '../../src/constants/toolIds'

function resetStore() {
  useWorkspaceProfileStore.setState({
    profileName: 'custom',
    toolVisibility: {},
    loaded: false,
  })
}

describe('getDefaultVisibility — web profile', () => {
  it('shows web tools', () => {
    const vis = getDefaultVisibility('web', BUILTIN_TOOL_IDS)
    expect(vis['git']).toBe(true)
    expect(vis['env']).toBe(true)
    expect(vis['settings']).toBe(true)
    expect(vis['docs']).toBe(true)
  })

  it('hides solana-specific tools', () => {
    const vis = getDefaultVisibility('web', BUILTIN_TOOL_IDS)
    expect(vis['wallet']).toBe(false)
    expect(vis['solana-toolbox']).toBe(false)
    expect(vis['dashboard']).toBe(false)
  })
})

describe('getDefaultVisibility — solana profile', () => {
  it('shows solana drawer tools', () => {
    const vis = getDefaultVisibility('solana', BUILTIN_TOOL_IDS)
    expect(vis['wallet']).toBe(true)
    expect(vis['solana-toolbox']).toBe(true)
    expect(vis['dashboard']).toBe(true)
  })

  it('shows all web tools as well', () => {
    const vis = getDefaultVisibility('solana', BUILTIN_TOOL_IDS)
    expect(vis['git']).toBe(true)
    expect(vis['settings']).toBe(true)
    expect(vis['docs']).toBe(true)
  })
})

describe('getDefaultVisibility — custom profile', () => {
  it('shows all tools (empty allowedTools means all visible)', () => {
    const vis = getDefaultVisibility('custom', BUILTIN_TOOL_IDS)
    for (const id of BUILTIN_TOOL_IDS) {
      expect(vis[id]).toBe(true)
    }
  })
})

describe('useWorkspaceProfileStore — isToolVisible', () => {
  beforeEach(resetStore)

  it('returns true for settings tool regardless of visibility map', () => {
    useWorkspaceProfileStore.setState({
      profileName: 'web',
      toolVisibility: { settings: false },
      loaded: true,
    })
    expect(useWorkspaceProfileStore.getState().isToolVisible('settings')).toBe(true)
  })

  it('returns true for unknown tool ids (safe default)', () => {
    useWorkspaceProfileStore.setState({
      profileName: 'web',
      toolVisibility: {},
      loaded: true,
    })
    expect(useWorkspaceProfileStore.getState().isToolVisible('unknown-tool')).toBe(true)
  })

  it('returns true when store is not yet loaded', () => {
    useWorkspaceProfileStore.setState({ loaded: false, toolVisibility: { git: false } })
    expect(useWorkspaceProfileStore.getState().isToolVisible('git')).toBe(true)
  })

  it('respects false visibility when loaded', () => {
    useWorkspaceProfileStore.setState({
      profileName: 'web',
      toolVisibility: { wallet: false },
      loaded: true,
    })
    expect(useWorkspaceProfileStore.getState().isToolVisible('wallet')).toBe(false)
  })

  it('respects true visibility when loaded', () => {
    useWorkspaceProfileStore.setState({
      profileName: 'solana',
      toolVisibility: { wallet: true },
      loaded: true,
    })
    expect(useWorkspaceProfileStore.getState().isToolVisible('wallet')).toBe(true)
  })
})

describe('useWorkspaceProfileStore — setToolVisible', () => {
  beforeEach(resetStore)

  it('updates toolVisibility for a given tool', async () => {
    useWorkspaceProfileStore.setState({
      profileName: 'solana',
      toolVisibility: { git: true, wallet: true },
      loaded: true,
    })
    await useWorkspaceProfileStore.getState().setToolVisible('wallet', false)
    expect(useWorkspaceProfileStore.getState().toolVisibility['wallet']).toBe(false)
  })

  it('switches profileName to custom when tool is updated', async () => {
    useWorkspaceProfileStore.setState({
      profileName: 'web',
      toolVisibility: { git: true },
      loaded: true,
    })
    await useWorkspaceProfileStore.getState().setToolVisible('git', false)
    expect(useWorkspaceProfileStore.getState().profileName).toBe('custom')
  })

  it('does not update settings tool (always visible guard)', async () => {
    useWorkspaceProfileStore.setState({
      profileName: 'web',
      toolVisibility: { settings: true },
      loaded: true,
    })
    await useWorkspaceProfileStore.getState().setToolVisible('settings', false)
    // settings should not be in toolVisibility as changed (the function returns early)
    expect(useWorkspaceProfileStore.getState().toolVisibility['settings']).toBe(true)
  })

  it('calls window.daemon.settings.setWorkspaceProfile', async () => {
    const spy = vi.mocked(window.daemon.settings.setWorkspaceProfile)
    spy.mockClear()
    useWorkspaceProfileStore.setState({ profileName: 'web', toolVisibility: { git: true }, loaded: true })
    await useWorkspaceProfileStore.getState().setToolVisible('git', false)
    expect(spy).toHaveBeenCalled()
  })
})

describe('useWorkspaceProfileStore — setProfile', () => {
  beforeEach(resetStore)

  it('sets profileName and visibility from preset', async () => {
    await useWorkspaceProfileStore.getState().setProfile('web')
    const state = useWorkspaceProfileStore.getState()
    expect(state.profileName).toBe('web')
    // web profile hides wallet
    expect(state.toolVisibility['wallet']).toBe(false)
    expect(state.toolVisibility['git']).toBe(true)
  })

  it('sets all tools visible for custom profile', async () => {
    await useWorkspaceProfileStore.getState().setProfile('custom')
    const state = useWorkspaceProfileStore.getState()
    expect(state.profileName).toBe('custom')
    for (const id of BUILTIN_TOOL_IDS) {
      expect(state.toolVisibility[id]).toBe(true)
    }
  })
})

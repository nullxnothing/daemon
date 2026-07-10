import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAriaHost, setAriaHost, type AriaHost } from '../../src/store/ariaHost'

function makeHost(overrides: Partial<AriaHost> = {}): AriaHost {
  return {
    activeProjectId: () => 'proj-1',
    buildSnapshot: () => ({
      activeProjectId: 'proj-1',
      activeProjectPath: 'C:/x',
      currentPanelId: 'ide',
      openFilePath: null,
      chips: { activeFile: true, projectTree: true, gitDiff: false, terminalLogs: false, walletContext: false, projectMemory: true },
    }),
    applyUiEffect: vi.fn(),
    runUiEffectWithData: vi.fn(async () => ({ ok: true })),
    ...overrides,
  }
}

describe('ariaHost port', () => {
  beforeEach(() => {
    // Restore the null default by installing a fresh module state per test is
    // not possible (module singleton) — install an explicit host instead.
  })

  it('null default host reports no project and a memory-on snapshot', async () => {
    // Fresh import state in the suite run starts with the null host, but other
    // tests may have installed one. Reset via a null-equivalent host.
    setAriaHost({
      activeProjectId: () => null,
      buildSnapshot: () => ({
        activeProjectId: null,
        activeProjectPath: null,
        currentPanelId: null,
        openFilePath: null,
        chips: { activeFile: false, projectTree: false, gitDiff: false, terminalLogs: false, walletContext: false, projectMemory: true },
      }),
      applyUiEffect: () => {},
      runUiEffectWithData: async () => ({ ok: true }),
    })
    const host = getAriaHost()
    expect(host.activeProjectId()).toBeNull()
    const snapshot = host.buildSnapshot()
    expect(snapshot.activeProjectId).toBeNull()
    expect(snapshot.chips.projectMemory).toBe(true)
    expect(host.openProviderLoginTerminal).toBeUndefined()
    await expect(host.runUiEffectWithData({ type: 'open_tool', toolId: 'x' })).resolves.toEqual({ ok: true })
  })

  it('setAriaHost installs the shell host used by consumers', () => {
    const host = makeHost()
    setAriaHost(host)
    expect(getAriaHost()).toBe(host)
    expect(getAriaHost().activeProjectId()).toBe('proj-1')
  })

  it('optional provider-login capability is preserved through the port', async () => {
    const login = vi.fn(async () => 'Opened claude login terminal.')
    setAriaHost(makeHost({ openProviderLoginTerminal: login }))
    const notice = await getAriaHost().openProviderLoginTerminal?.('claude')
    expect(login).toHaveBeenCalledWith('claude')
    expect(notice).toContain('login terminal')
  })
})

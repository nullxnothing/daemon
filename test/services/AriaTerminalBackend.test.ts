/**
 * Locks in the ARIA CLI's single-source behavior: the command registry that
 * drives dispatch + the `manifest` frame, and the banner builder that produces
 * the `banner` frame. These are the pure pieces of the --aria-server backend;
 * exercising them keeps a future command addition from silently re-duplicating.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  COMMAND_REGISTRY,
  getCommand,
  commandManifest,
  type AriaCommandActions,
} from '../../electron/services/aria/cli/commandRegistry'
import { buildBanner } from '../../electron/services/aria/cli/aria-boot-banner'
import { paint, dot, isColorDisabled } from '../../electron/services/aria/cli/ansi-theme'

function stubActions(): AriaCommandActions {
  return {
    exit: vi.fn(),
    listSessions: vi.fn(),
    resumeSession: vi.fn(() => true),
    newSession: vi.fn(),
    clearSession: vi.fn(),
    setModelLane: vi.fn(() => true),
    setMode: vi.fn(() => true),
    setPlan: vi.fn(),
    showHelp: vi.fn(),
    listTools: vi.fn(),
    showStatus: vi.fn(),
    listMemories: vi.fn(),
  }
}

describe('command registry', () => {
  it('exposes the new operator commands', () => {
    const names = COMMAND_REGISTRY.map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['tools', 'status', 'memory', 'help', 'exit']))
  })

  it('manifest drops the handler but keeps metadata', () => {
    const manifest = commandManifest()
    expect(manifest.length).toBe(COMMAND_REGISTRY.length)
    for (const entry of manifest) {
      expect(entry).not.toHaveProperty('handler')
      expect(typeof entry.name).toBe('string')
      expect(typeof entry.synopsis).toBe('string')
      expect(entry.risk).toBe('read')
    }
  })

  it('/exit stops the loop', () => {
    const actions = stubActions()
    const outcome = getCommand('exit')!.handler({ arg: '', emit: vi.fn(), actions })
    expect(actions.exit).toHaveBeenCalledOnce()
    expect(outcome?.continue).toBe(false)
  })

  it('/tools, /status, /memory call their actions', () => {
    const actions = stubActions()
    const run = (name: string) => getCommand(name)!.handler({ arg: '', emit: vi.fn(), actions })
    run('tools'); run('status'); run('memory')
    expect(actions.listTools).toHaveBeenCalledOnce()
    expect(actions.showStatus).toHaveBeenCalledOnce()
    expect(actions.listMemories).toHaveBeenCalledOnce()
  })

  it('/resume with no arg warns and does not resume', () => {
    const actions = stubActions()
    const emit = vi.fn()
    getCommand('resume')!.handler({ arg: '', emit, actions })
    expect(actions.resumeSession).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith('log', expect.objectContaining({ level: 'warn' }))
  })

  it('/model rejects an invalid lane via the action contract', () => {
    const actions = stubActions()
    actions.setModelLane = vi.fn(() => false)
    const emit = vi.fn()
    getCommand('model')!.handler({ arg: 'bogus', emit, actions })
    expect(emit).toHaveBeenCalledWith('log', expect.objectContaining({ level: 'warn' }))
  })

  it('unknown command name resolves to undefined', () => {
    expect(getCommand('nope')).toBeUndefined()
  })
})

describe('boot banner', () => {
  const state = {
    version: '4.6.1',
    cluster: 'devnet',
    rpcProvider: 'helius',
    wallet: 'main',
    projectPath: 'C:/Users/offic/Projects/DAEMON',
    session: 'sess-123',
    modelLane: 'auto',
    mode: 'coding',
  }

  it('returns a boot-panel frame with real state echoed', () => {
    const banner = buildBanner(state)
    expect(banner.type).toBe('banner')
    expect(banner.version).toBe('4.6.1')
    expect(banner.cluster).toBe('devnet')
    expect(banner.session).toBe('sess-123')
    expect(banner.meta.mode).toBe('coding')
  })

  it('ships a 6-row ANSI Shadow wordmark with non-empty equal-width rows', () => {
    const banner = buildBanner(state)
    expect(banner.wordmark.length).toBe(6)
    for (const row of banner.wordmark) expect(row.trim().length).toBeGreaterThan(0)
    const widths = new Set(banner.wordmark.map((r) => [...r].length))
    expect(widths.size).toBe(1)
  })

  it('packs network/wallet/project into structured meta and shortens the session', () => {
    const banner = buildBanner(state)
    expect(banner.meta.network).toBe('devnet (helius)')
    expect(banner.meta.wallet).toBe('main')
    expect(banner.meta.project).toBe('C:/Users/offic/Projects/DAEMON')
    expect(banner.meta.session).toBe('sess-123'.slice(0, 8))
  })

  it('truncates an over-long project path', () => {
    const long = 'C:/' + 'x'.repeat(200)
    const banner = buildBanner({ ...state, projectPath: long })
    expect(banner.meta.project.length).toBeLessThanOrEqual(64)
    expect(banner.meta.project.endsWith('...')).toBe(true)
  })
})

describe('theme builders', () => {
  it('paint wraps in an SGR sequence when color is enabled', () => {
    expect(paint('green', 'hi', false)).toContain('\x1b[38;2;')
    expect(paint('green', 'hi', false)).toContain('hi')
    expect(paint('green', 'hi', false).endsWith('\x1b[0m')).toBe(true)
  })

  it('paint returns raw text when color is disabled', () => {
    expect(paint('green', 'hi', true)).toBe('hi')
  })

  it('dot uses the status glyph', () => {
    expect(dot('blue', true)).toBe('●')
  })

  it('isColorDisabled honors NO_COLOR', () => {
    expect(isColorDisabled({ NO_COLOR: '1' } as NodeJS.ProcessEnv, true)).toBe(true)
    expect(isColorDisabled({} as NodeJS.ProcessEnv, true)).toBe(false)
    expect(isColorDisabled({} as NodeJS.ProcessEnv, undefined)).toBe(true) // non-TTY
  })
})

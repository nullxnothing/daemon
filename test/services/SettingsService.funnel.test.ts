import { beforeEach, describe, expect, it, vi } from 'vitest'

// Stateful in-memory app_settings + activity_log so the read-modify-write funnel
// blob behaves like the real DB across calls.
const { store, activityRows, mockPrepare } = vi.hoisted(() => {
  const store = new Map<string, string>()
  const activityRows: unknown[][] = []
  const mockPrepare = vi.fn((sql: string) => {
    if (sql.includes('SELECT value FROM app_settings')) {
      return { get: (key: string) => (store.has(key) ? { value: store.get(key) } : undefined) }
    }
    if (sql.includes('INSERT INTO app_settings')) {
      return { run: (key: string, value: string) => { store.set(key, value) } }
    }
    if (sql.includes('INSERT OR IGNORE INTO activity_log')) {
      return { run: (...args: unknown[]) => { activityRows.push(args) } }
    }
    return { get: vi.fn(), run: vi.fn() }
  })
  return { store, activityRows, mockPrepare }
})

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({ prepare: mockPrepare }),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  storeKey: vi.fn(),
  getKey: vi.fn().mockReturnValue(null),
  deleteKey: vi.fn(),
  listKeys: vi.fn().mockReturnValue([]),
}))

import { getFirstrunFunnel, markFirstrunFunnelStep } from '../../electron/services/SettingsService'

describe('first-run funnel marks', () => {
  beforeEach(() => {
    store.clear()
    activityRows.length = 0
  })

  it('stamps a known step with an epoch timestamp', () => {
    const before = Date.now()
    const result = markFirstrunFunnelStep('app_first_launch')
    expect(result.marked).toBe(true)
    const funnel = getFirstrunFunnel()
    expect(funnel.app_first_launch).toBeGreaterThanOrEqual(before)
  })

  it('first touch wins — a re-mark never overwrites the original timing', () => {
    markFirstrunFunnelStep('wizard_opened')
    const first = getFirstrunFunnel().wizard_opened
    const result = markFirstrunFunnelStep('wizard_opened')
    expect(result.marked).toBe(false)
    expect(getFirstrunFunnel().wizard_opened).toBe(first)
  })

  it('rejects unknown steps', () => {
    expect(() => markFirstrunFunnelStep('made_up_step')).toThrow('Unknown first-run funnel step')
    expect(() => markFirstrunFunnelStep('')).toThrow()
  })

  it('ignores mission-scoped marks until the mission has started', () => {
    // Normal usage: an approval card shows outside any first mission — no log.
    expect(markFirstrunFunnelStep('approval_shown').marked).toBe(false)
    expect(getFirstrunFunnel().approval_shown).toBeUndefined()

    markFirstrunFunnelStep('mission_started')
    expect(markFirstrunFunnelStep('approval_shown').marked).toBe(true)
  })

  it('ignores decision marks until the mission card has been shown', () => {
    markFirstrunFunnelStep('mission_started')
    expect(markFirstrunFunnelStep('approval_rejected').marked).toBe(false)

    markFirstrunFunnelStep('approval_shown')
    expect(markFirstrunFunnelStep('approval_rejected').marked).toBe(true)
  })

  it('records only one decision — approve after reject is a no-op', () => {
    markFirstrunFunnelStep('mission_started')
    markFirstrunFunnelStep('approval_shown')
    markFirstrunFunnelStep('approval_rejected')
    expect(markFirstrunFunnelStep('approval_approved').marked).toBe(false)
    const funnel = getFirstrunFunnel()
    expect(funnel.approval_rejected).toBeDefined()
    expect(funnel.approval_approved).toBeUndefined()
  })

  it('mirrors each recorded mark into the activity log with the first-run context', () => {
    markFirstrunFunnelStep('app_first_launch')
    expect(activityRows).toHaveLength(1)
    const [, kind, message, context] = activityRows[0]
    expect(kind).toBe('info')
    expect(message).toBe('first-run: app_first_launch')
    expect(context).toBe('first-run')
  })

  it('does not mirror suppressed marks', () => {
    markFirstrunFunnelStep('approval_shown') // gated off — no mission yet
    expect(activityRows).toHaveLength(0)
  })

  it('supports the full happy-path sequence with monotonic ordering', () => {
    const sequence = [
      'app_first_launch', 'wizard_opened', 'profile_done', 'claude_auth_ok',
      'project_ready', 'primer_done', 'mission_started', 'approval_shown', 'approval_rejected',
    ] as const
    for (const step of sequence) expect(markFirstrunFunnelStep(step).marked).toBe(true)
    const funnel = getFirstrunFunnel()
    expect(funnel.approval_rejected! - funnel.app_first_launch!).toBeGreaterThanOrEqual(0)
  })
})

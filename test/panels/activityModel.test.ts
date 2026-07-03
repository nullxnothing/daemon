// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import { dedupeEntries, deriveIssueHint } from '../../src/panels/ActivityTimeline/activityModel'
import { resetToolchainActivityLog, shouldLogToolchainActivity } from '../../src/store/solanaToolbox'
import type { ActivityEntry } from '../../src/store/notifications'

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'warning',
    message: 'Runtime toolchain check found missing tools: Surfpool',
    context: 'Runtime',
    createdAt: 1_700_000_000_000,
    sessionId: null,
    sessionStatus: null,
    projectId: null,
    projectName: null,
    sessionSummary: null,
    artifacts: null,
    ...overrides,
  }
}

describe('dedupeEntries', () => {
  it('collapses identical repeated events into one row with a count', () => {
    const entries = [
      entry({ id: 'a', createdAt: 1_700_000_000_000 }),
      entry({ id: 'b', createdAt: 1_700_000_000_100 }),
      entry({ id: 'c', createdAt: 1_700_000_000_200 }),
      entry({ id: 'd', kind: 'info', message: 'Opened Terminal in C:/work/app', context: 'Terminal', createdAt: 1_700_000_000_300 }),
    ]

    const deduped = dedupeEntries(entries)

    expect(deduped).toHaveLength(2)
    const surfpool = deduped.find(({ entry: e }) => e.message.includes('Surfpool'))!
    expect(surfpool.count).toBe(3)
    // Keeps the latest occurrence as the representative row.
    expect(surfpool.entry.id).toBe('c')
    expect(deduped.find(({ entry: e }) => e.message.includes('Terminal'))?.count).toBe(1)
  })

  it('does not collapse events that differ in kind or message', () => {
    const entries = [
      entry({ id: 'a' }),
      entry({ id: 'b', kind: 'error' }),
      entry({ id: 'c', message: 'Runtime toolchain check passed', kind: 'success' }),
    ]

    expect(dedupeEntries(entries)).toHaveLength(3)
  })

  it('keeps distinct info events separate when only an embedded id differs', () => {
    const entries = [
      entry({ id: 'a', kind: 'info', context: 'Runtime', message: 'Deployed program 7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2', createdAt: 1 }),
      entry({ id: 'b', kind: 'info', context: 'Runtime', message: 'Deployed program 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', createdAt: 2 }),
    ]

    expect(dedupeEntries(entries)).toHaveLength(2)
  })

  it('still collapses identical info repeats and number-varying warnings', () => {
    const entries = [
      entry({ id: 'a', kind: 'info', context: 'Terminal', message: 'Opened Terminal in C:/work/app', createdAt: 1 }),
      entry({ id: 'b', kind: 'info', context: 'Terminal', message: 'Opened Terminal in C:/work/app', createdAt: 2 }),
      entry({ id: 'c', message: 'Probe retry 12 failed', createdAt: 3 }),
      entry({ id: 'd', message: 'Probe retry 13 failed', createdAt: 4 }),
    ]

    const deduped = dedupeEntries(entries)

    expect(deduped).toHaveLength(2)
    expect(deduped.find(({ entry: e }) => e.kind === 'info')?.count).toBe(2)
    expect(deduped.find(({ entry: e }) => e.kind === 'warning')?.count).toBe(2)
  })
})

describe('deriveIssueHint', () => {
  it('produces an install hint for the Surfpool missing-toolchain probe', () => {
    const hint = deriveIssueHint('Runtime toolchain check found missing tools: Surfpool')
    expect(hint).toContain('cargo install surfpool')
  })

  it('covers multiple missing tools in one hint', () => {
    const hint = deriveIssueHint('Runtime toolchain check found missing tools: Solana CLI, Anchor, Surfpool')
    expect(hint).toContain('solana.com/docs/intro/installation')
    expect(hint).toContain('avm install latest')
    expect(hint).toContain('cargo install surfpool')
  })

  it('returns null for messages without a known fix', () => {
    expect(deriveIssueHint('Swap failed: slippage exceeded')).toBeNull()
  })
})

describe('shouldLogToolchainActivity', () => {
  beforeEach(() => resetToolchainActivityLog())

  it('logs the first probe result, suppresses identical repeats, logs transitions', () => {
    const missing = 'Runtime toolchain check found missing tools: Surfpool'
    const passed = 'Runtime toolchain check passed'

    expect(shouldLogToolchainActivity('C:/work/app', missing)).toBe(true)
    expect(shouldLogToolchainActivity('C:/work/app', missing)).toBe(false)
    expect(shouldLogToolchainActivity('C:/work/app', missing)).toBe(false)
    // Transition (user installed the tool) is signal — log it.
    expect(shouldLogToolchainActivity('C:/work/app', passed)).toBe(true)
    expect(shouldLogToolchainActivity('C:/work/app', passed)).toBe(false)
    // Regression back to missing logs again.
    expect(shouldLogToolchainActivity('C:/work/app', missing)).toBe(true)
  })

  it('tracks results per project', () => {
    const missing = 'Runtime toolchain check found missing tools: Surfpool'
    expect(shouldLogToolchainActivity('C:/work/a', missing)).toBe(true)
    expect(shouldLogToolchainActivity('C:/work/b', missing)).toBe(true)
    expect(shouldLogToolchainActivity('C:/work/a', missing)).toBe(false)
  })
})

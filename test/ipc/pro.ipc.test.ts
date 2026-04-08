import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

/**
 * IPC integration tests for Daemon Pro handlers.
 *
 * Tests the handler wiring + validation layer, not the actual ProService
 * network calls (those are tested separately at the service level).
 */

const { handlers, proServiceSpies } = vi.hoisted(() => {
  type HandlerFn = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  const registry = new Map<string, HandlerFn>()
  const fakeEvent = {} as IpcMainInvokeEvent
  return {
    handlers: {
      register(channel: string, fn: HandlerFn) { registry.set(channel, fn) },
      async invoke(channel: string, ...args: unknown[]) {
        const fn = registry.get(channel)
        if (!fn) throw new Error(`No handler for '${channel}'`)
        return (await fn(fakeEvent, ...args)) as { ok: boolean; data?: unknown; error?: string }
      },
      clear() { registry.clear() },
    },
    proServiceSpies: {
      getLocalSubscriptionState: vi.fn(),
      refreshStatusFromServer: vi.fn(),
      fetchPrice: vi.fn(),
      subscribe: vi.fn(),
      signOut: vi.fn(),
      pushLocalClaudeConfig: vi.fn(),
      pullMcpConfigToLocal: vi.fn(),
      listArenaSubmissions: vi.fn(),
      submitToArena: vi.fn(),
      voteArenaSubmission: vi.fn(),
      fetchProSkillsManifest: vi.fn(),
      syncAllProSkills: vi.fn(),
      downloadProSkill: vi.fn(),
      getPriorityApiQuota: vi.fn(),
    },
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.register(channel, fn as never),
  },
}))

vi.mock('../../electron/services/ProService', () => proServiceSpies)

import { registerProHandlers } from '../../electron/ipc/pro'

beforeEach(() => {
  handlers.clear()
  Object.values(proServiceSpies).forEach((s) => s.mockReset())
  registerProHandlers()
})

describe('pro:status', () => {
  it('returns the local subscription state', async () => {
    proServiceSpies.getLocalSubscriptionState.mockReturnValue({
      active: true,
      walletId: 'w1',
      walletAddress: 'Sub1111',
      expiresAt: Date.now() + 86_400_000,
      features: ['arena', 'pro-skills', 'mcp-sync', 'priority-api'],
      tier: 'pro',
      priceUsdc: null,
      durationDays: null,
    })
    const res = await handlers.invoke('pro:status')
    expect(res.ok).toBe(true)
    expect((res.data as { active: boolean }).active).toBe(true)
  })

  it('returns inactive state when no local state exists', async () => {
    proServiceSpies.getLocalSubscriptionState.mockReturnValue({
      active: false,
      walletId: null,
      walletAddress: null,
      expiresAt: null,
      features: [],
      tier: null,
      priceUsdc: null,
      durationDays: null,
    })
    const res = await handlers.invoke('pro:status')
    expect(res.ok).toBe(true)
    expect((res.data as { active: boolean }).active).toBe(false)
  })
})

describe('pro:refresh-status', () => {
  it('calls ProService with the wallet address', async () => {
    proServiceSpies.refreshStatusFromServer.mockResolvedValue({
      active: true, walletId: null, walletAddress: 'X', expiresAt: Date.now() + 1000,
      features: ['arena'], tier: 'pro', priceUsdc: null, durationDays: null,
    })
    const res = await handlers.invoke('pro:refresh-status', 'TestWallet111')
    expect(res.ok).toBe(true)
    expect(proServiceSpies.refreshStatusFromServer).toHaveBeenCalledWith('TestWallet111')
  })

  it('rejects missing wallet address', async () => {
    const res = await handlers.invoke('pro:refresh-status', '')
    expect(res).toEqual({ ok: false, error: 'walletAddress required' })
    expect(proServiceSpies.refreshStatusFromServer).not.toHaveBeenCalled()
  })

  it('rejects non-string wallet address', async () => {
    const res = await handlers.invoke('pro:refresh-status', 42)
    expect(res.ok).toBe(false)
    expect(proServiceSpies.refreshStatusFromServer).not.toHaveBeenCalled()
  })
})

describe('pro:fetch-price', () => {
  it('returns the price info', async () => {
    proServiceSpies.fetchPrice.mockResolvedValue({
      priceUsdc: 5,
      durationDays: 30,
      network: 'solana:mainnet',
      payTo: 'Fee1111',
    })
    const res = await handlers.invoke('pro:fetch-price')
    expect(res).toEqual({
      ok: true,
      data: { priceUsdc: 5, durationDays: 30, network: 'solana:mainnet', payTo: 'Fee1111' },
    })
  })

  it('surfaces fetch errors', async () => {
    proServiceSpies.fetchPrice.mockRejectedValue(new Error('network down'))
    const res = await handlers.invoke('pro:fetch-price')
    expect(res).toEqual({ ok: false, error: 'network down' })
  })
})

describe('pro:subscribe', () => {
  it('drives the subscribe flow for a given wallet', async () => {
    proServiceSpies.subscribe.mockResolvedValue({
      state: {
        active: true,
        walletId: 'w1',
        walletAddress: 'A',
        expiresAt: Date.now() + 30 * 86_400_000,
        features: ['arena', 'pro-skills', 'mcp-sync', 'priority-api'],
        tier: 'pro',
        priceUsdc: null,
        durationDays: null,
      },
      price: { priceUsdc: 5, durationDays: 30, network: 'solana:mainnet', payTo: 'Fee1111' },
    })
    const res = await handlers.invoke('pro:subscribe', 'w1')
    expect(res.ok).toBe(true)
    expect(proServiceSpies.subscribe).toHaveBeenCalledWith('w1')
  })

  it('rejects missing walletId', async () => {
    const res = await handlers.invoke('pro:subscribe', '')
    expect(res).toEqual({ ok: false, error: 'walletId required' })
    expect(proServiceSpies.subscribe).not.toHaveBeenCalled()
  })

  it('forwards subscribe errors as { ok: false, error }', async () => {
    proServiceSpies.subscribe.mockRejectedValue(new Error('Payment nonce already consumed'))
    const res = await handlers.invoke('pro:subscribe', 'w1')
    expect(res).toEqual({ ok: false, error: 'Payment nonce already consumed' })
  })
})

describe('pro:sign-out', () => {
  it('calls signOut', async () => {
    const res = await handlers.invoke('pro:sign-out')
    expect(res.ok).toBe(true)
    expect(proServiceSpies.signOut).toHaveBeenCalled()
  })
})

describe('pro:mcp-push + pro:mcp-pull', () => {
  it('pushes and returns count', async () => {
    proServiceSpies.pushLocalClaudeConfig.mockResolvedValue(5)
    const res = await handlers.invoke('pro:mcp-push')
    expect(res).toEqual({ ok: true, data: { count: 5 } })
  })

  it('pulls and returns count', async () => {
    proServiceSpies.pullMcpConfigToLocal.mockResolvedValue(3)
    const res = await handlers.invoke('pro:mcp-pull')
    expect(res).toEqual({ ok: true, data: { count: 3 } })
  })

  it('surfaces pull errors (e.g. 401 not subscribed)', async () => {
    proServiceSpies.pullMcpConfigToLocal.mockRejectedValue(new Error('Not subscribed to Daemon Pro'))
    const res = await handlers.invoke('pro:mcp-pull')
    expect(res).toEqual({ ok: false, error: 'Not subscribed to Daemon Pro' })
  })
})

describe('pro:arena-list', () => {
  it('returns submissions list', async () => {
    proServiceSpies.listArenaSubmissions.mockResolvedValue([
      { id: 's1', title: 'Tool 1', author: { handle: 'a', wallet: 'w' }, description: '', category: 'tool', themeWeek: null, submittedAt: 0, status: 'submitted', votes: 0 },
    ])
    const res = await handlers.invoke('pro:arena-list')
    expect(res.ok).toBe(true)
    expect(Array.isArray(res.data)).toBe(true)
    expect((res.data as unknown[]).length).toBe(1)
  })
})

describe('pro:arena-submit', () => {
  it('validates input is an object', async () => {
    const res = await handlers.invoke('pro:arena-submit', 'not-an-object')
    expect(res).toEqual({ ok: false, error: 'Invalid submission input' })
    expect(proServiceSpies.submitToArena).not.toHaveBeenCalled()
  })

  it('forwards valid submissions', async () => {
    proServiceSpies.submitToArena.mockResolvedValue({ id: 'new-id' })
    const res = await handlers.invoke('pro:arena-submit', {
      title: 'Test Tool',
      description: 'A test submission',
      category: 'tool',
      githubUrl: 'https://github.com/test/test',
    })
    expect(res).toEqual({ ok: true, data: { id: 'new-id' } })
    expect(proServiceSpies.submitToArena).toHaveBeenCalledWith({
      title: 'Test Tool',
      description: 'A test submission',
      category: 'tool',
      githubUrl: 'https://github.com/test/test',
    })
  })

  it('forwards validation errors from the server', async () => {
    proServiceSpies.submitToArena.mockRejectedValue(new Error('githubUrl must be a valid https://github.com/… URL'))
    const res = await handlers.invoke('pro:arena-submit', {
      title: 'x', description: 'y', category: 'tool', githubUrl: 'https://gitlab.com/bad',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/github/i)
  })
})

describe('pro:arena-vote', () => {
  it('calls voteArenaSubmission with the id', async () => {
    proServiceSpies.voteArenaSubmission.mockResolvedValue(undefined)
    const res = await handlers.invoke('pro:arena-vote', 'sub-1')
    expect(res.ok).toBe(true)
    expect(proServiceSpies.voteArenaSubmission).toHaveBeenCalledWith('sub-1')
  })

  it('rejects missing submission id', async () => {
    const res = await handlers.invoke('pro:arena-vote', '')
    expect(res).toEqual({ ok: false, error: 'submissionId required' })
    expect(proServiceSpies.voteArenaSubmission).not.toHaveBeenCalled()
  })

  it('surfaces double-vote error from server', async () => {
    proServiceSpies.voteArenaSubmission.mockRejectedValue(new Error('Already voted on this submission'))
    const res = await handlers.invoke('pro:arena-vote', 'sub-1')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/already voted/i)
  })
})

describe('pro:skills-manifest + pro:skills-sync + pro:skills-download', () => {
  it('returns manifest', async () => {
    proServiceSpies.fetchProSkillsManifest.mockResolvedValue({
      version: 1,
      skills: [
        { id: 'anchor-auditor', name: 'anchor-auditor', version: '0.1.0', description: '', downloadUrl: '', sha256: 'abc', size: 100, updatedAt: 0 },
      ],
    })
    const res = await handlers.invoke('pro:skills-manifest')
    expect(res.ok).toBe(true)
    expect((res.data as { version: number }).version).toBe(1)
  })

  it('syncs and returns installed/skipped lists', async () => {
    proServiceSpies.syncAllProSkills.mockResolvedValue({
      installed: ['anchor-auditor', 'meme-launcher'],
      skipped: ['onchain-researcher'],
    })
    const res = await handlers.invoke('pro:skills-sync')
    expect(res.ok).toBe(true)
    expect(res.data).toEqual({
      installed: ['anchor-auditor', 'meme-launcher'],
      skipped: ['onchain-researcher'],
    })
  })

  it('downloads a specific skill', async () => {
    proServiceSpies.downloadProSkill.mockResolvedValue({ fileCount: 2, path: '/tmp/x' })
    const res = await handlers.invoke('pro:skills-download', 'anchor-auditor')
    expect(res.ok).toBe(true)
    expect(proServiceSpies.downloadProSkill).toHaveBeenCalledWith('anchor-auditor')
  })

  it('rejects missing skill id on download', async () => {
    const res = await handlers.invoke('pro:skills-download', '')
    expect(res).toEqual({ ok: false, error: 'skillId required' })
    expect(proServiceSpies.downloadProSkill).not.toHaveBeenCalled()
  })
})

describe('pro:quota', () => {
  it('returns quota usage', async () => {
    proServiceSpies.getPriorityApiQuota.mockResolvedValue({ quota: 500, used: 10, remaining: 490 })
    const res = await handlers.invoke('pro:quota')
    expect(res).toEqual({ ok: true, data: { quota: 500, used: 10, remaining: 490 } })
  })
})

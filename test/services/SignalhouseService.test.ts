import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Signalhouse from '../../electron/services/SignalhouseService'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('SignalhouseService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports health from the API payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, service: 'signalhouse-api', time: '2026-06-02T00:00:00Z' })))
    const health = await Signalhouse.getHealth()
    expect(health).toEqual({ ok: true, service: 'signalhouse-api', time: '2026-06-02T00:00:00Z' })
  })

  it('targets the configured base URL', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchSpy)
    await Signalhouse.getHealth()
    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toContain('/health')
    // default base unless DAEMON_SIGNALHOUSE_API_URL overrides it at module load
    expect(calledUrl).toMatch(/^https?:\/\//)
  })

  it('returns an empty leaderboard when items is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ items: [], nextCursor: null })))
    const rows = await Signalhouse.getLeaderboard({ window: '7d', sort: 'proof_of_edge' })
    expect(rows).toEqual([])
  })

  it('normalizes leaderboard rows and coerces numeric strings', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      items: [
        {
          id: 'strat-1',
          name: 'Alpha',
          status: 'active',
          market: 'SOL-PERP',
          riskLevel: 'medium',
          proofOfEdge: 87,
          proofOfEdgeVerificationStatus: 'verified',
          realizedPnlUsd: '12450',
          drawdownBps: 320,
          followerCount: 5,
        },
      ],
    })))
    const rows = await Signalhouse.getLeaderboard()
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Alpha')
    expect(rows[0].proofOfEdge).toBe(87)
    expect(rows[0].realizedPnlUsd).toBe(12450)
    expect(rows[0].proofOfEdgeVerificationStatus).toBe('verified')
  })

  it('clamps the feed limit to the API max', async () => {
    const fetchSpy = vi.fn(async () => jsonResponse({ items: [] }))
    vi.stubGlobal('fetch', fetchSpy)
    await Signalhouse.getVerdicts(500)
    expect(fetchSpy.mock.calls[0][0]).toContain('limit=50')
  })

  it('maps verdicts including the approved boolean', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      items: [
        { id: 'v1', market: 'SOL-PERP', side: 'long', sizeUsd: 2100, approved: true, verdict: 'approved', at: '2026-06-02T00:00:00Z' },
        { id: 'v2', market: 'SOL-PERP', side: 'short', sizeUsd: 850, approved: false, verdict: 'rejected_oracle_stale', at: '2026-06-02T00:01:00Z' },
      ],
    })))
    const verdicts = await Signalhouse.getVerdicts()
    expect(verdicts).toHaveLength(2)
    expect(verdicts[0].approved).toBe(true)
    expect(verdicts[1].verdict).toBe('rejected_oracle_stale')
    expect(verdicts[1].approved).toBe(false)
  })

  it('returns null for a missing strategy (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    const detail = await Signalhouse.getStrategy('does-not-exist')
    expect(detail).toBeNull()
  })

  it('validates the strategy id before fetching', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(Signalhouse.getStrategy('')).rejects.toThrow('Strategy id is required')
    await expect(Signalhouse.getStrategyHistory('   ')).rejects.toThrow('Strategy id is required')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws a descriptive error on a 5xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    await expect(Signalhouse.getLeaderboard()).rejects.toThrow(/Signalhouse request failed \(500\)/)
  })

  it('maps strategy detail with positions and allowed markets', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      id: 'strat-1',
      name: 'Alpha',
      description: 'momentum',
      allowedMarkets: ['SOL-PERP', 'BTC-PERP'],
      maxLeverage: 3,
      proofOfEdge: 80,
      positions: [{ id: 'p1', market: 'SOL-PERP', side: 'long', sizeUsd: 12000, unrealizedPnlUsd: 178.5 }],
    })))
    const detail = await Signalhouse.getStrategy('strat-1')
    expect(detail?.name).toBe('Alpha')
    expect(detail?.allowedMarkets).toEqual(['SOL-PERP', 'BTC-PERP'])
    expect(detail?.maxLeverage).toBe(3)
    expect(detail?.positions).toHaveLength(1)
    expect(detail?.positions[0].unrealizedPnlUsd).toBe(178.5)
  })
})

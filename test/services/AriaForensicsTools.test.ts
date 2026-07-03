import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { scanMock, expandMock } = vi.hoisted(() => ({ scanMock: vi.fn(), expandMock: vi.fn() }))
vi.mock('../../electron/services/RicoMapsService', () => ({
  scan: scanMock,
  expandNode: expandMock,
}))

import { forensicsTools } from '../../electron/services/aria/tools/forensics'

const ctx = { sessionId: 's', snapshot: {} as never, runUiEffect: vi.fn() }
const tool = (name: string) => forensicsTools.find((t) => t.name === name)!
const MINT = 'So11111111111111111111111111111111111111112'

function scanResult(stats: Record<string, unknown> = {}, security: unknown = null) {
  return {
    mode: 'token',
    data: { nodes: [{ id: 'a' }], links: [] },
    stats,
    tokenSecurity: security,
    tokenMetadata: { name: 'Test', symbol: 'TST' },
  }
}

beforeEach(() => { scanMock.mockReset(); expandMock.mockReset() })
afterEach(() => vi.restoreAllMocks())

describe('forensic_scan_token', () => {
  it('rejects an invalid mint without calling the engine', async () => {
    const res = await tool('forensic_scan_token').handler({ mint: 'nope' }, ctx)
    expect(res.ok).toBe(false)
    expect(scanMock).not.toHaveBeenCalled()
  })

  it('summarizes flags and drops the graph payload', async () => {
    scanMock.mockResolvedValue(scanResult(
      { cabalConnectionsFound: 3, snipersDetected: 2, bundleClustersDetected: 1, suspiciousWallets: ['x'] },
      { riskLevel: 'high', riskFactors: ['mint authority'], hasMintAuthority: true, hasFreezeAuthority: false, isMutable: true },
    ))
    const res = await tool('forensic_scan_token').handler({ mint: MINT }, ctx)
    expect(res.ok).toBe(true)
    expect(res.summary).toMatch(/3 cabal connection/)
    expect(res.summary).toMatch(/2 sniper/)
    expect(res.summary).toMatch(/high token-security risk/)
    const data = res.data as Record<string, unknown>
    expect(data.cabalConnections).toBe(3)
    expect(data).not.toHaveProperty('data') // full graph not forwarded
    expect(scanMock).toHaveBeenCalledWith({ address: MINT, mode: 'token', topHolders: undefined })
  })

  it('reports a clean verdict when nothing is flagged', async () => {
    scanMock.mockResolvedValue(scanResult({ cabalConnectionsFound: 0, totalHolders: 50 }))
    const res = await tool('forensic_scan_token').handler({ mint: MINT }, ctx)
    expect(res.summary).toMatch(/No coordinated-actor flags/)
  })
})

describe('forensic_trace_wallet', () => {
  it('scans in wallet mode', async () => {
    scanMock.mockResolvedValue(scanResult({ cabalConnectionsFound: 0 }))
    await tool('forensic_trace_wallet').handler({ wallet: MINT }, ctx)
    expect(scanMock).toHaveBeenCalledWith({ address: MINT, mode: 'wallet', maxDepth: undefined })
  })
})

describe('forensic_expand_wallet', () => {
  it('returns newNodes/newLinks from the engine', async () => {
    expandMock.mockResolvedValue({ newNodes: [{ id: 'a' }, { id: 'b' }], newLinks: [{ source: 'a', target: 'b' }] })
    const res = await tool('forensic_expand_wallet').handler({ wallet: MINT, mode: 'funded' }, ctx)
    expect(res.summary).toMatch(/2 connected wallet/)
    expect(expandMock).toHaveBeenCalledWith({ wallet: MINT, mode: 'funded', existingNodes: [] })
  })
})

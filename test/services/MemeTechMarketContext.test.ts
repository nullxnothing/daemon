import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/services/SecureKeyService', () => ({ getKey: vi.fn(() => null) }))
import { clearMemeMarketCache, readMemeMarketContext, readTokenRiskPreflight } from '../../electron/services/meme-studio/MarketContextService'

const MINT = 'Tqj8yFmagrg7oorpQkVGYR52r96RFTamvWfth9bpump'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('Meme Tech market context', () => {
  beforeEach(() => {
    process.env.BIRDEYE_API_KEY = 'test-only-key'
    clearMemeMarketCache()
  })

  afterEach(() => {
    delete process.env.BIRDEYE_API_KEY
    vi.unstubAllGlobals()
  })

  it('normalizes both providers, timestamps evidence, and reports divergence', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('token_overview')) return response({ data: { symbol: 'KINS', price: 1, liquidity: 100_000, mc: 2_000_000, v24hUSD: 500_000, holder: 1000 } })
      if (url.includes('trade-data')) return response({ data: { volume_1h_usd: 50_000, trade_1h: 900, unique_wallet_1h: 300, price_change_1h_percent: 12 } })
      return response([{ priceUsd: '1.2', liquidity: { usd: 40_000 }, volume: { h1: 45_000 }, txns: { h1: { buys: 10, sells: 5 } }, baseToken: { symbol: 'KINS' } }])
    }))

    const result = await readMemeMarketContext(MINT)

    expect(result.symbol).toBe('KINS')
    expect(result.sources.map((source) => source.provider)).toEqual(['birdeye', 'dexscreener'])
    expect(result.divergences).toHaveLength(2)
    expect(JSON.stringify(result)).not.toContain('test-only-key')
  })

  it('keeps DEX observations available when Birdeye fails and marks them degraded', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('birdeye')) return response({}, 429)
      return response([{ priceUsd: '0.5', liquidity: { usd: 25_000 }, baseToken: { symbol: 'DEX' } }])
    }))

    const result = await readMemeMarketContext(MINT)

    expect(result.degraded).toBe(true)
    expect(result.sources).toEqual([expect.objectContaining({ provider: 'dexscreener' })])
    expect(result.priceUsd).toBe(0.5)
  })

  it('separates authority and concentration risk from attention', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ data: {
      mintAuthority: 'Authority11111111111111111111111111111111',
      freezeAuthority: null,
      transferFeeEnable: false,
      nonTransferable: false,
      top10HolderPercent: 0.41,
    } })))

    const result = await readTokenRiskPreflight(MINT)

    expect(result.risk).toBe('high')
    expect(result.attentionIsNotTrust).toBe(true)
    expect(result.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Mint authority', status: 'danger' }),
      expect.objectContaining({ label: 'Top 10 holders', status: 'danger' }),
    ]))
  })

  it('normalizes textual booleans and percentage holder units', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ data: {
      mintAuthority: 'false', freezeAuthority: '0', transferFeeEnable: 'disabled', nonTransferable: false, top10HolderPercent: 41,
    } })))

    const result = await readTokenRiskPreflight(MINT)

    expect(result.facts.find((fact) => fact.label === 'Mint authority')).toMatchObject({ value: 'Disabled', status: 'good' })
    expect(result.facts.find((fact) => fact.label === 'Top 10 holders')).toMatchObject({ value: '41.0%', status: 'danger' })
  })

  it('rejects non-Solana addresses before any network request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(readMemeMarketContext('not-a-mint')).rejects.toThrow('valid Solana mint')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

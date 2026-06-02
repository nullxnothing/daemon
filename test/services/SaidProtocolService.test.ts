import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as SaidProtocolService from '../../electron/services/SaidProtocolService'

const VALID_WALLET = 'So11111111111111111111111111111111111111112'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('SaidProtocolService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects invalid wallet addresses before making a request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(SaidProtocolService.getTrustScore('not-a-wallet')).rejects.toThrow('Invalid Solana wallet address')
    await expect(SaidProtocolService.getIdentity('short')).rejects.toThrow('Invalid Solana wallet address')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('derives the numeric score from the agent trustScore object', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      wallet: VALID_WALLET,
      trustScore: { score: 87.6, economic: 3, badges: ['verified', 'staked'] },
      isVerified: true,
      reputationScore: 42,
    })))

    const trust = await SaidProtocolService.getTrustScore(VALID_WALLET)
    expect(trust).toEqual({ score: 88, verified: true, staked: true, reputation: 42 })
  })

  it('infers stake from a positive economic component when no staked badge is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      wallet: VALID_WALLET,
      trustScore: { score: 40, economic: 2, badges: ['verified'] },
      isVerified: true,
    })))
    const trust = await SaidProtocolService.getTrustScore(VALID_WALLET)
    expect(trust.staked).toBe(true)
  })

  it('returns a zero score for an unregistered wallet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    const trust = await SaidProtocolService.getTrustScore(VALID_WALLET)
    expect(trust).toEqual({ score: 0, verified: false, staked: false, reputation: null })
  })

  it('clamps trust score into the 0-100 range', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ wallet: VALID_WALLET, trustScore: { score: 250 }, isVerified: false })))
    const trust = await SaidProtocolService.getTrustScore(VALID_WALLET)
    expect(trust.score).toBe(100)
    expect(trust.verified).toBe(false)
  })

  it('returns an unregistered identity on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    const identity = await SaidProtocolService.getIdentity(VALID_WALLET)
    expect(identity.registered).toBe(false)
    expect(identity.wallet).toBe(VALID_WALLET)
    expect(identity.isVerified).toBe(false)
    expect(identity.serviceTypes).toEqual([])
  })

  it('maps a full agent payload into a normalized identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      wallet: VALID_WALLET,
      pda: 'PdA1111111111111111111111111111111111111111',
      owner: 'Own1111111111111111111111111111111111111111',
      name: 'DAEMON Agent',
      description: 'ships code',
      isVerified: true,
      image: 'https://img',
      twitter: 'daemon',
      website: 'https://daemonide.tech',
      serviceTypes: ['dev'],
      skills: ['anchor'],
      reputationScore: 12,
      feedbackCount: 3,
      trustScore: 91,
      passportMint: 'Mint111111111111111111111111111111111111111',
    })))

    const identity = await SaidProtocolService.getIdentity(VALID_WALLET)
    expect(identity.registered).toBe(true)
    expect(identity.name).toBe('DAEMON Agent')
    expect(identity.isVerified).toBe(true)
    expect(identity.trustScore).toBe(91)
    expect(identity.feedbackCount).toBe(3)
    expect(identity.skills).toEqual(['anchor'])
  })

  it('throws a descriptive error on a 5xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    await expect(SaidProtocolService.getTrustScore(VALID_WALLET)).rejects.toThrow(/SAID request failed \(500\)/)
  })

  it('exposes docs-sourced program ids for both clusters', () => {
    expect(SaidProtocolService.SAID_PROGRAM_ID.mainnet).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    expect(SaidProtocolService.SAID_PROGRAM_ID.devnet).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  })
})

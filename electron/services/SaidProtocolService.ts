import { PublicKey } from '@solana/web3.js'
import type { SaidIdentity, SaidTrustScore } from '../shared/types'

// SAID Protocol — on-chain identity, verification, and trust for AI agents on Solana.
// DAEMON only consumes the public read API here. Registration/verification/staking sign
// transactions and must be added behind SignerGuardService + a transaction preview.
const SAID_API_BASE = process.env.DAEMON_SAID_API_URL || 'https://api.saidprotocol.com'
const REQUEST_TIMEOUT_MS = 10_000

// Program IDs are docs-sourced. Verify on a Solana explorer before wiring any signing flow.
export const SAID_PROGRAM_ID = {
  mainnet: '5dpw6KEQPn248pnkkaYyWfHwu2nfb3LUMbTucb6LaA8G',
  devnet: 'ESPreFucjVwtDmZbhtL3JLJ9VxCethNEYtosMQhkcurv',
} as const

function isValidWallet(address: string): boolean {
  try {
    new PublicKey(address)
    return address.length >= 32 && address.length <= 44
  } catch {
    return false
  }
}

async function fetchJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const url = `${SAID_API_BASE}${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (response.status === 404) return { status: 404, body: null }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`SAID request failed (${response.status}): ${text.slice(0, 180)}`)
    }
    const body = (await response.json()) as T
    return { status: response.status, body }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('SAID request timed out')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// The numeric trust score lives on /api/agents/:wallet under trustScore.score.
// /api/trust/:wallet only returns a coarse tier + registered/verified booleans, and
// /api/agents/:wallet already carries verification, reputation, and the economic
// breakdown — so a single agents read is the source of truth for both calls.
interface RawTrustScore {
  score?: number
  economic?: number
  badges?: string[]
}

interface RawAgent {
  wallet?: string
  pda?: string
  owner?: string
  name?: string
  description?: string
  isVerified?: boolean
  image?: string
  twitter?: string
  website?: string
  serviceTypes?: string[]
  skills?: string[]
  reputationScore?: number
  feedbackCount?: number
  trustScore?: number | RawTrustScore
  passportMint?: string
}

function readScore(value: number | RawTrustScore | undefined): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value.score === 'number') return value.score
  return null
}

function isStaked(trust: number | RawTrustScore | undefined): boolean {
  if (typeof trust !== 'object' || !trust) return false
  if (Array.isArray(trust.badges) && trust.badges.includes('staked')) return true
  return typeof trust.economic === 'number' && trust.economic > 0
}

export async function getTrustScore(wallet: string): Promise<SaidTrustScore> {
  if (!isValidWallet(wallet)) throw new Error('Invalid Solana wallet address')
  const { status, body } = await fetchJson<RawAgent>(`/api/agents/${wallet}`)
  if (status === 404 || !body || !body.wallet) {
    return { score: 0, verified: false, staked: false, reputation: null }
  }
  const score = readScore(body.trustScore) ?? 0
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    verified: Boolean(body.isVerified),
    staked: isStaked(body.trustScore),
    reputation: body.reputationScore ?? null,
  }
}

export async function getIdentity(wallet: string): Promise<SaidIdentity> {
  if (!isValidWallet(wallet)) throw new Error('Invalid Solana wallet address')
  const { status, body } = await fetchJson<RawAgent>(`/api/agents/${wallet}`)
  if (status === 404 || !body || !body.wallet) {
    return {
      wallet,
      pda: null,
      owner: null,
      name: null,
      description: null,
      isVerified: false,
      image: null,
      twitter: null,
      website: null,
      serviceTypes: [],
      skills: [],
      reputationScore: null,
      feedbackCount: null,
      trustScore: null,
      passportMint: null,
      registered: false,
    }
  }
  return {
    wallet: body.wallet,
    pda: body.pda ?? null,
    owner: body.owner ?? null,
    name: body.name ?? null,
    description: body.description ?? null,
    isVerified: Boolean(body.isVerified),
    image: body.image ?? null,
    twitter: body.twitter ?? null,
    website: body.website ?? null,
    serviceTypes: Array.isArray(body.serviceTypes) ? body.serviceTypes : [],
    skills: Array.isArray(body.skills) ? body.skills : [],
    reputationScore: body.reputationScore ?? null,
    feedbackCount: body.feedbackCount ?? null,
    trustScore: readScore(body.trustScore),
    passportMint: body.passportMint ?? null,
    registered: true,
  }
}

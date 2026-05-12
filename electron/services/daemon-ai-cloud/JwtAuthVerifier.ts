import crypto from 'node:crypto'
import { getMonthlyAiCredits, getPlanFeatures, normalizePlan } from '../EntitlementService'
import type { ProAccessSource, ProFeature } from '../../shared/types'
import type { DaemonAiCloudAuthVerifier, DaemonAiCloudEntitlement } from './types'

type JwtHeader = {
  alg?: string
  typ?: string
}

type DaemonAiJwtClaims = {
  sub?: unknown
  wallet?: unknown
  walletAddress?: unknown
  plan?: unknown
  tier?: unknown
  accessSource?: unknown
  source?: unknown
  features?: unknown
  monthlyCredits?: unknown
  usedCredits?: unknown
  exp?: unknown
  nbf?: unknown
}

const VALID_ACCESS_SOURCES = new Set<ProAccessSource>(['payment', 'holder', 'admin', 'trial', 'dev_bypass'])

function decodeBase64UrlJson<T>(value: string): T {
  const json = Buffer.from(value, 'base64url').toString('utf8')
  return JSON.parse(json) as T
}

function signingInput(parts: string[]): string {
  return `${parts[0]}.${parts[1]}`
}

function signatureFor(input: string, secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(input).digest()
}

function assertValidSignature(parts: string[], secret: string) {
  const expected = signatureFor(signingInput(parts), secret)
  const actual = Buffer.from(parts[2], 'base64url')
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('Invalid DAEMON Pro token signature')
  }
}

function normalizeFeatures(plan: DaemonAiCloudEntitlement['plan'], input: unknown): ProFeature[] {
  const features = Array.isArray(input)
    ? input.filter((feature): feature is ProFeature => typeof feature === 'string' && getPlanFeatures('enterprise').includes(feature as ProFeature))
    : []
  const merged = new Set<ProFeature>([...getPlanFeatures(plan), ...features])
  return [...merged]
}

function normalizeAccessSource(input: unknown): ProAccessSource {
  return VALID_ACCESS_SOURCES.has(input as ProAccessSource) ? input as ProAccessSource : 'payment'
}

function positiveNumber(input: unknown, fallback: number): number {
  const value = Number(input)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export function verifyDaemonAiJwt(token: string, secret: string, now = Date.now()): DaemonAiCloudEntitlement {
  if (!secret.trim()) throw new Error('DAEMON AI JWT secret is not configured')
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Malformed DAEMON Pro token')

  const header = decodeBase64UrlJson<JwtHeader>(parts[0])
  if (header.alg !== 'HS256') throw new Error('Unsupported DAEMON Pro token algorithm')
  assertValidSignature(parts, secret)

  const claims = decodeBase64UrlJson<DaemonAiJwtClaims>(parts[1])
  const nowSeconds = Math.floor(now / 1000)
  const exp = Number(claims.exp)
  if (Number.isFinite(exp) && exp <= nowSeconds) throw new Error('DAEMON Pro token has expired')
  const nbf = Number(claims.nbf)
  if (Number.isFinite(nbf) && nbf > nowSeconds) throw new Error('DAEMON Pro token is not active yet')

  const plan = normalizePlan(claims.plan ?? claims.tier)
  if (plan === 'light') throw new Error('DAEMON AI entitlement required')
  const features = normalizeFeatures(plan, claims.features)
  if (!features.includes('daemon-ai')) throw new Error('DAEMON AI entitlement required')

  return {
    userId: typeof claims.sub === 'string' && claims.sub.trim() ? claims.sub.trim() : null,
    walletAddress: typeof claims.walletAddress === 'string'
      ? claims.walletAddress.trim()
      : typeof claims.wallet === 'string'
        ? claims.wallet.trim()
        : null,
    plan,
    accessSource: normalizeAccessSource(claims.accessSource ?? claims.source),
    features,
    monthlyCredits: positiveNumber(claims.monthlyCredits, getMonthlyAiCredits(plan)),
    usedCredits: positiveNumber(claims.usedCredits, 0),
  }
}

export class Hs256DaemonAiJwtAuthVerifier implements DaemonAiCloudAuthVerifier {
  private secret: string

  constructor(secret = process.env.DAEMON_PRO_JWT_SECRET ?? process.env.DAEMON_AI_JWT_SECRET ?? '') {
    if (!secret.trim()) throw new Error('Set DAEMON_PRO_JWT_SECRET or DAEMON_AI_JWT_SECRET before starting DAEMON AI Cloud')
    this.secret = secret
  }

  async verifyBearerToken(token: string): Promise<DaemonAiCloudEntitlement> {
    return verifyDaemonAiJwt(token, this.secret)
  }
}

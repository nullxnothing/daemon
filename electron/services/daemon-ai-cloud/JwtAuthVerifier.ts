import crypto from 'node:crypto'
import { canUseHostedModelLane, getHostedLanesForPlan, getMonthlyAiCredits, getPlanFeatures, normalizePlan } from '../EntitlementService'
import type { DaemonAiModelLane, ProAccessSource, ProFeature } from '../../shared/types'
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
  lane?: unknown
  allowedLanes?: unknown
  monthlyCredits?: unknown
  usedCredits?: unknown
  entitlementExpiresAt?: unknown
  exp?: unknown
  nbf?: unknown
}

const VALID_ACCESS_SOURCES = new Set<ProAccessSource>(['payment', 'holder', 'admin', 'trial', 'dev_bypass'])
const VALID_MODEL_LANES = new Set<DaemonAiModelLane>(['auto', 'fast', 'standard', 'reasoning', 'premium'])

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

function normalizeAllowedLanes(plan: DaemonAiCloudEntitlement['plan'], input: unknown): DaemonAiModelLane[] {
  const planLanes = getHostedLanesForPlan(plan)
  const inputLanes = Array.isArray(input)
    ? input.filter((lane): lane is DaemonAiModelLane =>
      VALID_MODEL_LANES.has(lane as DaemonAiModelLane) &&
      canUseHostedModelLane({ active: true, plan, features: getPlanFeatures(plan) }, lane as DaemonAiModelLane))
    : []

  const lanes = inputLanes.length > 0 ? inputLanes : planLanes
  return [...new Set(lanes)]
}

function normalizeLane(plan: DaemonAiCloudEntitlement['plan'], input: unknown, allowedLanes: DaemonAiModelLane[]): DaemonAiModelLane {
  if (
    typeof input === 'string' &&
    VALID_MODEL_LANES.has(input as DaemonAiModelLane) &&
    allowedLanes.includes(input as DaemonAiModelLane)
  ) {
    return input as DaemonAiModelLane
  }
  if (plan === 'ultra' || plan === 'enterprise') return 'premium'
  if (plan === 'operator' || plan === 'team') return 'reasoning'
  return 'standard'
}

function normalizeString(input: unknown): string | null {
  return typeof input === 'string' && input.trim() ? input.trim() : null
}

export function signDaemonAiJwt(
  entitlement: Omit<DaemonAiCloudEntitlement, 'usedCredits'> & { usedCredits?: number },
  secret: string,
  now = Date.now(),
): string {
  if (!secret.trim()) throw new Error('DAEMON AI JWT secret is not configured')
  const expiresAtMs = entitlement.entitlementExpiresAt ? Date.parse(entitlement.entitlementExpiresAt) : NaN
  const exp = Number.isFinite(expiresAtMs)
    ? Math.floor(expiresAtMs / 1000)
    : Math.floor((now + 30 * 24 * 60 * 60 * 1000) / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const claims = {
    sub: entitlement.userId ?? undefined,
    walletAddress: entitlement.walletAddress ?? undefined,
    plan: entitlement.plan,
    accessSource: entitlement.accessSource,
    features: entitlement.features,
    lane: entitlement.lane,
    allowedLanes: entitlement.allowedLanes,
    monthlyCredits: entitlement.monthlyCredits,
    usedCredits: entitlement.usedCredits ?? 0,
    entitlementExpiresAt: entitlement.entitlementExpiresAt ?? null,
    iat: Math.floor(now / 1000),
    exp,
  }
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url')
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = signatureFor(`${encodedHeader}.${encodedPayload}`, secret).toString('base64url')
  return `${encodedHeader}.${encodedPayload}.${signature}`
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
  const allowedLanes = normalizeAllowedLanes(plan, claims.allowedLanes)
  const lane = normalizeLane(plan, claims.lane, allowedLanes)

  return {
    userId: normalizeString(claims.sub),
    walletAddress: normalizeString(claims.walletAddress) ?? normalizeString(claims.wallet),
    plan,
    accessSource: normalizeAccessSource(claims.accessSource ?? claims.source),
    features,
    lane,
    allowedLanes,
    monthlyCredits: positiveNumber(claims.monthlyCredits, getMonthlyAiCredits(plan)),
    usedCredits: positiveNumber(claims.usedCredits, 0),
    entitlementExpiresAt: normalizeString(claims.entitlementExpiresAt),
  }
}

export class Hs256DaemonAiJwtAuthVerifier implements DaemonAiCloudAuthVerifier {
  private secrets: string[]

  constructor(secret: string | string[] = process.env.DAEMON_PRO_JWT_SECRET ?? process.env.DAEMON_AI_JWT_SECRET ?? '') {
    const secrets = Array.isArray(secret)
      ? secret.map((entry) => entry.trim()).filter(Boolean)
      : secret.split(',').map((entry) => entry.trim()).filter(Boolean)
    if (secrets.length === 0) throw new Error('Set DAEMON_PRO_JWT_SECRET or DAEMON_AI_JWT_SECRET before starting DAEMON AI Cloud')
    this.secrets = secrets
  }

  async verifyBearerToken(token: string): Promise<DaemonAiCloudEntitlement> {
    let lastError: unknown = null
    for (const secret of this.secrets) {
      try {
        return verifyDaemonAiJwt(token, secret)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Invalid DAEMON Pro token')
  }
}

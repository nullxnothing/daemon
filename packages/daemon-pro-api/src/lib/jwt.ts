import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import type { ProFeature, SubscriptionJwtPayload } from '../types.js'

/**
 * JWT issuance and verification for Daemon Pro subscriptions.
 *
 * A successful subscribe flow mints a JWT valid for `DAEMON_PRO_DURATION_DAYS`
 * with the full feature list embedded. The open client stores the JWT in its
 * SecureKeyService (OS keychain) and attaches it as `Authorization: Bearer`
 * to every request against Pro endpoints.
 *
 * Design choice: embed the feature list + quota in the JWT itself rather than
 * looking it up server-side on every request. This makes the Pro API stateless
 * for 99% of reads (only `/v1/subscribe` + quota writes need the DB). Trade-off:
 * feature changes take up to 30 days to propagate, which is fine for MVP.
 */

const DEFAULT_FEATURES: ProFeature[] = ['arena', 'pro-skills', 'mcp-sync', 'priority-api']
const DEFAULT_MONTHLY_QUOTA = 500

export interface IssueJwtParams {
  wallet: string
  features?: ProFeature[]
  quota?: number
  expiresInSeconds?: number
}

export interface IssuedJwt {
  token: string
  jwtId: string
  expiresAt: number // ms since epoch
  features: ProFeature[]
}

export function issueSubscriptionJwt(params: IssueJwtParams): IssuedJwt {
  const features = params.features ?? DEFAULT_FEATURES
  const quota = params.quota ?? DEFAULT_MONTHLY_QUOTA
  const expiresInSeconds = params.expiresInSeconds ?? (config.durationDays * 24 * 60 * 60)

  const now = Math.floor(Date.now() / 1000)
  const exp = now + expiresInSeconds

  // jwtId is a unique identifier we persist alongside the subscription row so
  // we can revoke specific tokens without a blanket secret rotation.
  const jwtId = `${params.wallet}-${now}-${Math.random().toString(36).slice(2, 10)}`

  const payload: SubscriptionJwtPayload = {
    sub: params.wallet,
    iat: now,
    exp,
    quota,
    features,
    tier: 'pro',
  }

  const token = jwt.sign(payload, config.jwtSecret, {
    jwtid: jwtId,
    algorithm: 'HS256',
  })

  return {
    token,
    jwtId,
    expiresAt: exp * 1000,
    features,
  }
}

export interface VerifiedJwt {
  valid: true
  payload: SubscriptionJwtPayload & { jti?: string }
}

export interface InvalidJwt {
  valid: false
  reason: 'expired' | 'malformed' | 'signature' | 'missing'
}

export function verifySubscriptionJwt(token: string | undefined): VerifiedJwt | InvalidJwt {
  if (!token) return { valid: false, reason: 'missing' }
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as SubscriptionJwtPayload & { jti?: string }
    return { valid: true, payload }
  } catch (err) {
    const name = (err as Error).name
    if (name === 'TokenExpiredError') return { valid: false, reason: 'expired' }
    if (name === 'JsonWebTokenError') return { valid: false, reason: 'signature' }
    return { valid: false, reason: 'malformed' }
  }
}

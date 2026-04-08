import type { Request, Response, NextFunction } from 'express'
import { verifySubscriptionJwt } from '../lib/jwt.js'
import { getSubscription } from '../lib/db.js'
import type { ProFeature, SubscriptionJwtPayload } from '../types.js'

/**
 * Gate a route behind a valid Daemon Pro subscription.
 *
 * Checks (in order, fail-fast on first failure):
 *   1. Authorization: Bearer <jwt> header exists
 *   2. JWT signature valid + not expired
 *   3. JWT subject wallet has an active, non-revoked subscription row
 *   4. [optional] JWT's feature list includes all required features
 *
 * On success, attaches the decoded payload to `req.subscription` for the
 * downstream handler to use.
 */

declare module 'express-serve-static-core' {
  interface Request {
    subscription?: SubscriptionJwtPayload
  }
}

export function requireSubscription(requiredFeatures: ProFeature[] = []) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
    const result = verifySubscriptionJwt(token)

    if (!result.valid) {
      res.status(401).json({
        ok: false,
        error: `Subscription ${result.reason}`,
      })
      return
    }

    // Double-check the server-side state. Even with a valid JWT, a revoked
    // subscription should be blocked — this is how refunds / chargebacks /
    // manual revocation take effect without waiting for the JWT to expire.
    const row = getSubscription(result.payload.sub)
    if (!row || row.revoked || row.expires_at < Date.now()) {
      res.status(401).json({
        ok: false,
        error: 'Subscription inactive or revoked',
      })
      return
    }
    if (!result.payload.jti || !row.jwt_id || row.jwt_id !== result.payload.jti) {
      res.status(401).json({
        ok: false,
        error: 'Subscription token superseded',
      })
      return
    }

    for (const required of requiredFeatures) {
      if (!result.payload.features.includes(required)) {
        res.status(403).json({
          ok: false,
          error: `Subscription missing required feature: ${required}`,
        })
        return
      }
    }

    req.subscription = result.payload
    next()
  }
}

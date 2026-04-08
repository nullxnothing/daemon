import { Router, type Request, type Response } from 'express'
import { config } from '../config.js'
import { buildPaymentRequiredBody, verifyPaymentHeader } from '../lib/x402.js'
import { issueSubscriptionJwt } from '../lib/jwt.js'
import { upsertSubscription, getSubscription } from '../lib/db.js'
import type { SubscribeSuccessBody } from '../types.js'

/**
 * POST /v1/subscribe
 *
 * The canonical x402 two-step handshake:
 *
 *   1. Client sends POST /v1/subscribe with no X-Payment header.
 *      Server responds 402 Payment Required with the price, payTo, nonce,
 *      and network. This is the "challenge."
 *
 *   2. Client signs a payment payload for the exact terms and retries
 *      POST /v1/subscribe with `X-Payment: <base64url(payload)>`.
 *      Server verifies, mints a JWT, upserts the subscription row, and
 *      returns the JWT + expiry.
 *
 * The nonce is single-use (enforced by UNIQUE constraint in payment_nonces),
 * so a replayed payment is rejected. The JWT is signed with the server-only
 * DAEMON_PRO_JWT_SECRET, so a fork can't mint valid tokens.
 *
 * GET /v1/subscribe/price is a convenience endpoint that returns the current
 * price without initiating the handshake — used by the client UI to display
 * the price before the user clicks "Subscribe."
 */

export const subscribeRouter = Router()

subscribeRouter.get('/price', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      priceUsdc: config.priceUsdc,
      durationDays: config.durationDays,
      network: config.network,
      payTo: config.payTo,
    },
  })
})

subscribeRouter.post('/', (req: Request, res: Response) => {
  const paymentHeader = req.headers['x-payment']
  const headerValue = Array.isArray(paymentHeader) ? paymentHeader[0] : paymentHeader

  // Step 1: no payment header → 402 challenge
  if (!headerValue) {
    res.status(402).json(buildPaymentRequiredBody('/v1/subscribe'))
    return
  }

  // Step 2: verify the payment
  const verification = verifyPaymentHeader(headerValue)
  if (!verification.ok) {
    res.status(verification.status).json({ ok: false, error: verification.error })
    return
  }

  // Step 3: mint JWT + persist subscription row
  const issued = issueSubscriptionJwt({ wallet: verification.wallet })
  upsertSubscription({
    wallet: verification.wallet,
    expiresAt: issued.expiresAt,
    paymentSignature: verification.signature,
    jwtId: issued.jwtId,
  })

  const body: SubscribeSuccessBody = {
    ok: true,
    jwt: issued.token,
    expiresAt: issued.expiresAt,
    features: issued.features,
    tier: 'pro',
  }
  res.status(200).json(body)
})

/**
 * GET /v1/subscribe/status — check the effective state of a wallet's subscription.
 *
 * Useful for the client to poll on startup without re-verifying the JWT locally.
 * Takes the wallet from the ?wallet= query param (not from a JWT) so it can
 * answer "is this wallet a subscriber?" without the client being one yet.
 *
 * Returns the same shape regardless of subscription state — `active: false`
 * when there's no row or the sub has expired.
 */
subscribeRouter.get('/status', (req: Request, res: Response) => {
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : null
  if (!wallet) {
    res.status(400).json({ ok: false, error: 'wallet query param required' })
    return
  }

  const row = getSubscription(wallet)
  if (!row || row.revoked || row.expires_at < Date.now()) {
    res.json({
      ok: true,
      data: {
        active: false,
        expiresAt: null,
        features: [],
        quotaRemaining: null,
        tier: null,
      },
    })
    return
  }

  res.json({
    ok: true,
    data: {
      active: true,
      expiresAt: row.expires_at,
      features: ['arena', 'pro-skills', 'mcp-sync', 'priority-api'],
      quotaRemaining: null, // populated by /v1/quota when the JWT is attached
      tier: 'pro',
    },
  })
})

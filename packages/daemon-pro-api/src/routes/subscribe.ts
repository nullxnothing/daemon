import crypto from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { config } from '../config.js'
import { verifySubscribePayment, settleSubscribePayment } from '../lib/x402.js'
import { issueSubscriptionJwt } from '../lib/jwt.js'
import { consumeNonce, upsertSubscription, getSubscription } from '../lib/db.js'
import {
  buildHolderClaimMessage,
  getHolderStatus,
  verifyHolderClaimSignature,
} from '../lib/holderAccess.js'
import type { HolderStatus, StatusResponseBody, SubscribeSuccessBody } from '../types.js'

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

function inactiveStatus(holderStatus: HolderStatus): StatusResponseBody {
  return {
    active: false,
    expiresAt: null,
    features: [],
    quotaRemaining: null,
    tier: null,
    accessSource: null,
    holderStatus,
  }
}

subscribeRouter.get('/price', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      priceUsdc: config.priceUsdc,
      durationDays: config.durationDays,
      network: config.network,
      payTo: config.payTo,
      holderMint: config.holderMint,
      holderMinAmount: config.holderMinAmount,
    },
  })
})

subscribeRouter.post('/holder/challenge', async (req: Request, res: Response) => {
  const wallet = typeof req.body?.wallet === 'string' ? req.body.wallet.trim() : ''
  if (!wallet) {
    res.status(400).json({ ok: false, error: 'wallet required' })
    return
  }

  const holderStatus = await getHolderStatus(wallet)
  if (!holderStatus.enabled) {
    res.status(400).json({ ok: false, error: 'Holder access not enabled' })
    return
  }
  if (!holderStatus.eligible) {
    res.status(403).json({ ok: false, error: 'Wallet does not meet holder threshold', holderStatus })
    return
  }

  const nonce = crypto.randomUUID()
  res.json({
    ok: true,
    data: {
      nonce,
      message: buildHolderClaimMessage(wallet, nonce),
      holderStatus,
    },
  })
})

subscribeRouter.post('/holder/claim', async (req: Request, res: Response) => {
  const wallet = typeof req.body?.wallet === 'string' ? req.body.wallet.trim() : ''
  const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce.trim() : ''
  const signature = typeof req.body?.signature === 'string' ? req.body.signature.trim() : ''
  if (!wallet || !nonce || !signature) {
    res.status(400).json({ ok: false, error: 'wallet, nonce, and signature are required' })
    return
  }
  if (!verifyHolderClaimSignature({ wallet, nonce, signature })) {
    res.status(401).json({ ok: false, error: 'Invalid holder claim signature' })
    return
  }
  if (!consumeNonce(`holder:${nonce}`, wallet)) {
    res.status(409).json({ ok: false, error: 'Holder claim nonce already consumed' })
    return
  }

  const holderStatus = await getHolderStatus(wallet)
  if (!holderStatus.eligible) {
    res.status(403).json({ ok: false, error: 'Wallet does not meet holder threshold', holderStatus })
    return
  }

  const issued = issueSubscriptionJwt({
    wallet,
    expiresInSeconds: Math.max(1, Math.floor(config.holderJwtHours * 60 * 60)),
  })

  upsertSubscription({
    wallet,
    expiresAt: issued.expiresAt,
    paymentSignature: null,
    jwtId: issued.jwtId,
    accessSource: 'holder',
  })

  res.status(200).json({
    ok: true,
    jwt: issued.token,
    expiresAt: issued.expiresAt,
    features: issued.features,
    tier: 'pro',
    accessSource: 'holder',
  } satisfies SubscribeSuccessBody)
})

subscribeRouter.post('/', async (req: Request, res: Response) => {
  const verifiedPayment = await verifySubscribePayment(req, res)
  if (!verifiedPayment) {
    return
  }

  const issued = issueSubscriptionJwt({ wallet: verifiedPayment.wallet })
  const body: SubscribeSuccessBody = {
    ok: true,
    jwt: issued.token,
    expiresAt: issued.expiresAt,
    features: issued.features,
    tier: 'pro',
    accessSource: 'payment',
  }

  const settlement = await settleSubscribePayment(req, res, verifiedPayment, body)
  if (!settlement.ok) {
    return
  }

  upsertSubscription({
    wallet: verifiedPayment.wallet,
    expiresAt: issued.expiresAt,
    paymentSignature: settlement.paymentSignature,
    jwtId: issued.jwtId,
    accessSource: 'payment',
  })

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
  void (async () => {
    const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : null
    if (!wallet) {
      res.status(400).json({ ok: false, error: 'wallet query param required' })
      return
    }

    const holderStatus = await getHolderStatus(wallet)
    const row = getSubscription(wallet)
    if (!row || row.revoked || row.expires_at < Date.now()) {
      res.json({ ok: true, data: inactiveStatus(holderStatus) })
      return
    }

    res.json({
      ok: true,
      data: {
        active: true,
        expiresAt: row.expires_at,
        features: ['arena', 'pro-skills', 'mcp-sync', 'priority-api'],
        quotaRemaining: null,
        tier: 'pro',
        accessSource: row.access_source,
        holderStatus,
      } satisfies StatusResponseBody,
    })
  })().catch((error: unknown) => {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Failed to check status' })
  })
})

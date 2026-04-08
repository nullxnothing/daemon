import type { PaymentRequiredBody } from '../types.js'
import { config } from '../config.js'
import { consumeNonce } from './db.js'

/**
 * Minimal x402 handshake for the Daemon Pro subscription flow.
 *
 * This is a hand-rolled implementation of the 402 Payment Required response
 * and the payment-receipt validation path, deliberately kept simple for MVP.
 * It's wire-compatible with the x402 spec so clients written against the
 * @x402/* SDKs work against it, and swapping in the full
 * `@x402/express` middleware later is a contained change in src/index.ts.
 *
 * MVP scope:
 *  1. Build the 402 body with our price + network + payTo
 *  2. Parse the X-Payment header into a (signedPayload, nonce) tuple
 *  3. Verify the nonce hasn't been replayed (via SQLite uniqueness)
 *  4. TODO [production]: verify the signed payload with the PayAI facilitator
 *     before marking the payment as settled. In MVP we trust the client to
 *     submit a real payment; the facilitator verification is a single call to
 *     the PayAI SDK and will be added before any real money moves through this.
 *
 * What this deliberately does NOT do in MVP:
 *  - Settle the payment on-chain (PayAI facilitator handles this in prod)
 *  - Verify cryptographic signatures on the payment payload
 *  - Enforce a minimum payment amount at the protocol level
 *
 * These are all production hardening steps that gate the "flip the switch on
 * real payments" moment. Until they're in place, DAEMON_PRO_NETWORK should be
 * set to 'solana:devnet' and the deployment should be flagged as alpha.
 */

export function buildPaymentRequiredBody(resource: string): PaymentRequiredBody {
  const priceMicroUsdc = Math.round(config.priceUsdc * 1_000_000).toString()
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: config.network,
        maxAmountRequired: priceMicroUsdc,
        resource,
        description: `Daemon Pro — ${config.durationDays}-day subscription`,
        mimeType: 'application/json',
        payTo: config.payTo,
        maxTimeoutSeconds: 300,
        asset: 'USDC',
        extra: {
          tier: 'pro',
          durationDays: config.durationDays,
        },
      },
    ],
  }
}

export interface ParsedPaymentHeader {
  wallet: string
  signature: string
  nonce: string
  amount: string
  network: string
}

export interface PaymentVerificationResult {
  ok: true
  wallet: string
  signature: string
}

export interface PaymentVerificationFailure {
  ok: false
  status: number
  error: string
}

/**
 * Verify the X-Payment header attached to a subscribe request.
 *
 * MVP format: base64url-encoded JSON with fields { wallet, signature, nonce, amount, network }.
 * Production will swap this for the real x402 PaymentPayload shape which is a
 * superset of this — adding it later doesn't break the client because the client
 * builds the header via @x402/svm's createPaymentPayload, which emits the full shape.
 */
export function verifyPaymentHeader(
  header: string | undefined,
): PaymentVerificationResult | PaymentVerificationFailure {
  if (!header) {
    return { ok: false, status: 402, error: 'Missing X-Payment header' }
  }

  let parsed: ParsedPaymentHeader
  try {
    const json = Buffer.from(header, 'base64url').toString('utf8')
    parsed = JSON.parse(json) as ParsedPaymentHeader
  } catch {
    return { ok: false, status: 400, error: 'Malformed X-Payment header' }
  }

  if (!parsed.wallet || typeof parsed.wallet !== 'string') {
    return { ok: false, status: 400, error: 'Payment payload missing wallet' }
  }
  if (!parsed.nonce || typeof parsed.nonce !== 'string') {
    return { ok: false, status: 400, error: 'Payment payload missing nonce' }
  }
  if (!parsed.signature || typeof parsed.signature !== 'string') {
    return { ok: false, status: 400, error: 'Payment payload missing signature' }
  }
  if (parsed.network !== config.network) {
    return {
      ok: false,
      status: 400,
      error: `Payment network mismatch: expected ${config.network}, got ${parsed.network}`,
    }
  }

  // Replay protection — the nonce can only ever be consumed once.
  if (!consumeNonce(parsed.nonce, parsed.wallet)) {
    return { ok: false, status: 409, error: 'Payment nonce already consumed' }
  }

  // Amount check — the client must agree to the current price.
  const priceMicroUsdc = Math.round(config.priceUsdc * 1_000_000)
  const submittedAmount = parseInt(parsed.amount, 10)
  if (!Number.isFinite(submittedAmount) || submittedAmount < priceMicroUsdc) {
    return {
      ok: false,
      status: 402,
      error: `Payment below required amount: expected ${priceMicroUsdc} µUSDC, got ${parsed.amount}`,
    }
  }

  // TODO [production]: real facilitator verification goes here.
  // const facilitator = await createPayaiFacilitator({ network: config.network })
  // const receipt = await facilitator.verify({
  //   signature: parsed.signature,
  //   expectedPayTo: config.payTo,
  //   expectedAmount: priceMicroUsdc,
  // })
  // if (!receipt.ok) return { ok: false, status: 402, error: receipt.error }

  return { ok: true, wallet: parsed.wallet, signature: parsed.signature }
}

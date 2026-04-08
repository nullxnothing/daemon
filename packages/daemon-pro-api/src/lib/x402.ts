import type { Request, Response } from 'express'
import { facilitator } from '@payai/facilitator'
import { ExpressAdapter, type PaymentPayload, type PaymentRequirements } from '@x402/express'
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from '@x402/core/server'
import { decodeTransactionFromPayload, getTokenPayerFromTransaction } from '@x402/svm'
import { ExactSvmScheme } from '@x402/svm/exact/server'
import type { PaymentRequiredBody, SubscribeSuccessBody } from '../types.js'
import { config } from '../config.js'
import { consumeNonce } from './db.js'

/**
 * Real x402 verification/settlement for production, with a narrow legacy test
 * path so the integration suite can still exercise the API without creating
 * live Solana payments.
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

interface ParsedTestPaymentHeader {
  wallet: string
  signature: string
  nonce: string
  amount: string
  network: string
}

interface TestPaymentVerificationResult {
  ok: true
  wallet: string
  signature: string
}

interface TestPaymentVerificationFailure {
  ok: false
  status: number
  error: string
}

type TestPaymentVerification = TestPaymentVerificationResult | TestPaymentVerificationFailure

interface RealVerifiedSubscribePayment {
  wallet: string
  paymentPayload: PaymentPayload
  paymentRequirements: PaymentRequirements
  declaredExtensions?: Record<string, unknown>
}

interface TestVerifiedSubscribePayment {
  wallet: string
  paymentSignature: string
}

export type VerifiedSubscribePayment = RealVerifiedSubscribePayment | TestVerifiedSubscribePayment

let subscribeHttpServerPromise: Promise<x402HTTPResourceServer> | null = null

function applyHeaders(res: Response, headers: Record<string, string>): void {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value)
  }
}

function isRealX402Mode(): boolean {
  // Keep facilitator-backed x402 strict in production, but let local dev use
  // the legacy test header flow until the Electron client emits real SVM x402
  // payment payloads. This preserves production safety without blocking the
  // in-app Pro/Arena workflow during development.
  return config.isProduction
}

function isTestVerifiedPayment(
  verifiedPayment: VerifiedSubscribePayment,
): verifiedPayment is TestVerifiedSubscribePayment {
  return 'paymentSignature' in verifiedPayment
}

function isRealVerifiedPayment(
  verifiedPayment: VerifiedSubscribePayment,
): verifiedPayment is RealVerifiedSubscribePayment {
  return 'paymentPayload' in verifiedPayment
}

function normalizeIncomingPaymentHeader(req: Request): string | undefined {
  const paymentSignatureHeader = req.headers['payment-signature']
  const xPaymentHeader = req.headers['x-payment']
  const normalized = Array.isArray(paymentSignatureHeader)
    ? paymentSignatureHeader[0]
    : paymentSignatureHeader ?? (Array.isArray(xPaymentHeader) ? xPaymentHeader[0] : xPaymentHeader)

  if (normalized && !paymentSignatureHeader) {
    req.headers['payment-signature'] = normalized
  }

  return normalized
}

function getRequestPath(req: Request): string {
  const path = `${req.baseUrl}${req.path}` || req.originalUrl || req.url
  return path === '' ? '/' : path
}

function extractWalletFromPaymentPayload(paymentPayload: PaymentPayload): string {
  const payload = paymentPayload.payload
  if (!payload || typeof payload !== 'object' || !('transaction' in payload)) {
    throw new Error('Verified payment payload missing SVM transaction')
  }

  const transaction = (payload as { transaction?: unknown }).transaction
  if (typeof transaction !== 'string' || transaction.length === 0) {
    throw new Error('Verified payment payload missing SVM transaction')
  }

  const decoded = decodeTransactionFromPayload({ transaction })
  const wallet = getTokenPayerFromTransaction(decoded)
  if (!wallet) {
    throw new Error('Could not derive payer wallet from verified payment transaction')
  }

  return wallet
}

async function getSubscribeHttpServer(): Promise<x402HTTPResourceServer> {
  if (!subscribeHttpServerPromise) {
    subscribeHttpServerPromise = (async () => {
      const server = new x402ResourceServer(new HTTPFacilitatorClient(facilitator))
        .register(config.network, new ExactSvmScheme())

      const httpServer = new x402HTTPResourceServer(server, {
        'POST /v1/subscribe': {
          accepts: [
            {
              scheme: 'exact',
              price: config.priceUsdc,
              network: config.network,
              payTo: config.payTo,
            },
          ],
          description: `Daemon Pro — ${config.durationDays}-day subscription`,
          mimeType: 'application/json',
          unpaidResponseBody: async () => ({
            contentType: 'application/json',
            body: buildPaymentRequiredBody('/v1/subscribe'),
          }),
          settlementFailedResponseBody: async (_request, failure) => ({
            contentType: 'application/json',
            body: { ok: false, error: failure.errorMessage || 'Payment settlement failed' },
          }),
        },
      })

      await httpServer.initialize()
      return httpServer
    })()
  }

  return subscribeHttpServerPromise
}

export async function initializeSubscribePayments(): Promise<void> {
  if (!isRealX402Mode()) return
  await getSubscribeHttpServer()
}

export async function verifySubscribePayment(
  req: Request,
  res: Response,
): Promise<VerifiedSubscribePayment | null> {
  const headerValue = normalizeIncomingPaymentHeader(req)
  if (!isRealX402Mode() && !headerValue) {
    res.status(402).json(buildPaymentRequiredBody('/v1/subscribe'))
    return null
  }

  if (!isRealX402Mode()) {
    const verification = verifyTestPaymentHeader(headerValue)
    if (!verification.ok) {
      res.status(verification.status).json({ ok: false, error: verification.error })
      return null
    }

    return {
      wallet: verification.wallet,
      paymentSignature: verification.signature,
    }
  }

  const httpServer = await getSubscribeHttpServer()
  const context = {
    adapter: new ExpressAdapter(req),
    path: getRequestPath(req),
    method: req.method,
  }
  const result = await httpServer.processHTTPRequest(context)

  if (result.type === 'payment-error') {
    applyHeaders(res, result.response.headers)
    if (result.response.isHtml) {
      res.status(result.response.status).send(result.response.body)
    } else {
      res.status(result.response.status).json(result.response.body ?? {})
    }
    return null
  }

  if (result.type !== 'payment-verified') {
    throw new Error(`Unexpected x402 processing result: ${result.type}`)
  }

  return {
    wallet: extractWalletFromPaymentPayload(result.paymentPayload),
    paymentPayload: result.paymentPayload,
    paymentRequirements: result.paymentRequirements,
    declaredExtensions: result.declaredExtensions,
  }
}

export async function settleSubscribePayment(
  req: Request,
  res: Response,
  verifiedPayment: VerifiedSubscribePayment,
  body: SubscribeSuccessBody,
): Promise<{ ok: true; paymentSignature: string } | { ok: false }> {
  if (!isRealX402Mode()) {
    if (!isTestVerifiedPayment(verifiedPayment)) {
      throw new Error('Expected test payment verification result in test mode')
    }
    return {
      ok: true,
      paymentSignature: verifiedPayment.paymentSignature,
    }
  }

  const httpServer = await getSubscribeHttpServer()
  if (!isRealVerifiedPayment(verifiedPayment)) {
    throw new Error('Expected real x402 verification result outside test mode')
  }
  const responseBody = Buffer.from(JSON.stringify(body), 'utf8')
  const context = {
    request: {
      adapter: new ExpressAdapter(req),
      path: getRequestPath(req),
      method: req.method,
    },
    responseBody,
    responseHeaders: {
      'content-type': 'application/json',
    },
  }

  const settleResult = await httpServer.processSettlement(
    verifiedPayment.paymentPayload,
    verifiedPayment.paymentRequirements,
    verifiedPayment.declaredExtensions,
    context,
  )

  applyHeaders(res, settleResult.headers)

  if (!settleResult.success) {
    const { response } = settleResult
    if (response.isHtml) {
      res.status(response.status).send(response.body)
    } else {
      res.status(response.status).json(response.body ?? {})
    }
    return { ok: false }
  }

  return {
    ok: true,
    paymentSignature: settleResult.transaction,
  }
}

function verifyTestPaymentHeader(header: string | undefined): TestPaymentVerification {
  if (!header) {
    return { ok: false, status: 402, error: 'Missing X-Payment header' }
  }

  let parsed: ParsedTestPaymentHeader
  try {
    const json = Buffer.from(header, 'base64url').toString('utf8')
    parsed = JSON.parse(json) as ParsedTestPaymentHeader
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

  if (!consumeNonce(parsed.nonce, parsed.wallet)) {
    return { ok: false, status: 409, error: 'Payment nonce already consumed' }
  }

  const priceMicroUsdc = Math.round(config.priceUsdc * 1_000_000)
  const submittedAmount = parseInt(parsed.amount, 10)
  if (!Number.isFinite(submittedAmount) || submittedAmount < priceMicroUsdc) {
    return {
      ok: false,
      status: 402,
      error: `Payment below required amount: expected ${priceMicroUsdc} µUSDC, got ${parsed.amount}`,
    }
  }

  return { ok: true, wallet: parsed.wallet, signature: parsed.signature }
}

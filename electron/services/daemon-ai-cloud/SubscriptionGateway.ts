import crypto from 'node:crypto'
import express, { type Request, type Response } from 'express'
import type Database from 'better-sqlite3'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { Connection, PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js'
import {
  getHostedLanesForPlan,
  getMonthlyAiCredits,
  getPlanFeatures,
  normalizePlan,
} from '../EntitlementService'
import { signDaemonAiJwt } from './JwtAuthVerifier'
import type { DaemonAiCloudEntitlement } from './types'
import type { DaemonPlanId, ProAccessSource, ProFeature, ProHolderStatus, ProPriceInfo } from '../../shared/types'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const DEFAULT_NETWORK = 'solana:mainnet'
const DEFAULT_PRO_PAY_TO = 'GNVxk3sn4iJ2iUaqEUskWQ1KNy9Mmcee3WF3AMtRjN7W'
const USDC_DECIMALS = 6
const HOLDER_CHALLENGE_TTL_MS = 5 * 60_000

type PaidPlan = Exclude<DaemonPlanId, 'light'>

interface PriceConfig extends ProPriceInfo {
  plan: PaidPlan
  paymentMint: string
}

interface PaymentPayload {
  wallet?: unknown
  walletAddress?: unknown
  txSignature?: unknown
  signature?: unknown
  amount?: unknown
  network?: unknown
  payTo?: unknown
  mint?: unknown
  plan?: unknown
}

interface VerifiedPayment {
  walletAddress: string
  paymentId: string
  plan: PaidPlan
  paidUsdc: number
}

export interface DaemonProPaymentVerifier {
  verifyPayment(paymentHeader: string, price: PriceConfig): Promise<VerifiedPayment>
}

export interface DaemonProHolderVerifier {
  getHolderBalance(walletAddress: string, holderMint: string): Promise<number>
}

interface SubscriptionGatewayOptions {
  db: Database.Database
  jwtSecret: string
  env?: NodeJS.ProcessEnv
  paymentVerifier?: DaemonProPaymentVerifier
  holderVerifier?: DaemonProHolderVerifier
}

interface SubscriptionRow {
  wallet_address: string
  plan: string
  access_source: ProAccessSource
  payment_id: string | null
  expires_at: number
  features_json: string
  revoked_at: number | null
}

interface HolderChallengeRow {
  wallet_address: string
  nonce: string
  message: string
  expires_at: number
  used_at: number | null
}

type AuditAction =
  | 'payment_subscribe'
  | 'payment_replay'
  | 'holder_challenge'
  | 'holder_claim'
  | 'admin_grant'
  | 'admin_revoke'

function responseError(res: Response, status: number, error: string, code = 'daemon_pro_error') {
  return res.status(status).json({ ok: false, code, error })
}

function optionalString(input: unknown): string | null {
  return typeof input === 'string' && input.trim() ? input.trim() : null
}

function numberFromEnv(input: string | undefined, fallback: number): number {
  const value = Number(input)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function daysToMs(days: number): number {
  return days * 24 * 60 * 60 * 1000
}

function positiveNumber(input: unknown, fallback: number): number {
  const value = Number(input)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function paidPlan(input: unknown): PaidPlan {
  const plan = normalizePlan(input)
  return plan === 'light' ? 'pro' : plan
}

function laneForPlan(plan: DaemonPlanId): DaemonAiCloudEntitlement['lane'] {
  if (plan === 'ultra' || plan === 'enterprise') return 'premium'
  if (plan === 'operator' || plan === 'team') return 'reasoning'
  return 'standard'
}

function parsePaymentPayload(header: string): PaymentPayload {
  try {
    return JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as PaymentPayload
  } catch {
    try {
      return JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as PaymentPayload
    } catch {
      throw new Error('Malformed payment header')
    }
  }
}

function assertPublicKey(value: string, label: string): string {
  try {
    return new PublicKey(value).toBase58()
  } catch {
    throw new Error(`Invalid ${label}`)
  }
}

function rawUsdcAmount(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS))
}

function tokenAmountRaw(input: unknown): bigint {
  if (!input || typeof input !== 'object') return 0n
  const amount = (input as { uiTokenAmount?: { amount?: unknown } }).uiTokenAmount?.amount
  if (typeof amount !== 'string' || !/^\d+$/.test(amount)) return 0n
  return BigInt(amount)
}

function tokenOwnerDelta(tx: ParsedTransactionWithMeta, owner: string, mint: string): bigint {
  const pre = new Map<number, bigint>()
  for (const balance of tx.meta?.preTokenBalances ?? []) {
    if (balance.mint === mint) pre.set(balance.accountIndex, tokenAmountRaw(balance))
  }

  let delta = 0n
  for (const balance of tx.meta?.postTokenBalances ?? []) {
    if (balance.mint !== mint || balance.owner !== owner) continue
    const before = pre.get(balance.accountIndex) ?? 0n
    const after = tokenAmountRaw(balance)
    if (after > before) delta += after - before
  }
  return delta
}

function transactionHasSigner(tx: ParsedTransactionWithMeta, walletAddress: string): boolean {
  return tx.transaction.message.accountKeys.some((key) => key.signer && key.pubkey.toBase58() === walletAddress)
}

function rpcUrl(env: NodeJS.ProcessEnv): string {
  const configured = env.SOLANA_RPC_URL?.trim() || env.HELIUS_RPC_URL?.trim()
  if (configured) return configured
  const heliusKey = env.HELIUS_API_KEY?.trim()
  if (heliusKey) return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`
  return 'https://api.mainnet-beta.solana.com'
}

export class SolanaUsdcPaymentVerifier implements DaemonProPaymentVerifier {
  private connection: Connection

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.connection = new Connection(rpcUrl(env), 'confirmed')
  }

  async verifyPayment(paymentHeader: string, price: PriceConfig): Promise<VerifiedPayment> {
    const payload = parsePaymentPayload(paymentHeader)
    const walletAddress = assertPublicKey(optionalString(payload.walletAddress) ?? optionalString(payload.wallet) ?? '', 'payment wallet')
    const txSignature = optionalString(payload.txSignature) ?? optionalString(payload.signature)
    if (!txSignature) throw new Error('Payment transaction signature is required')

    const network = optionalString(payload.network) ?? price.network
    const payTo = assertPublicKey(optionalString(payload.payTo) ?? price.payTo, 'payment recipient')
    const mint = assertPublicKey(optionalString(payload.mint) ?? price.paymentMint, 'payment mint')
    if (network !== price.network) throw new Error(`Payment network must be ${price.network}`)
    if (payTo !== assertPublicKey(price.payTo, 'configured payment recipient')) throw new Error('Payment recipient mismatch')
    if (mint !== assertPublicKey(price.paymentMint, 'configured payment mint')) throw new Error('Payment mint mismatch')

    const declaredAmount = Number(payload.amount)
    if (Number.isFinite(declaredAmount) && declaredAmount + Number.EPSILON < price.priceUsdc) {
      throw new Error('Payment amount is below the selected plan price')
    }

    const tx = await this.connection.getParsedTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx?.meta || tx.meta.err) throw new Error('Payment transaction was not confirmed successfully')
    if (!transactionHasSigner(tx, walletAddress)) throw new Error('Payment wallet did not sign the transaction')

    const paidRaw = tokenOwnerDelta(tx, payTo, mint)
    const requiredRaw = rawUsdcAmount(price.priceUsdc)
    if (paidRaw < requiredRaw) throw new Error('Payment transaction did not transfer enough USDC')

    return {
      walletAddress,
      paymentId: txSignature,
      plan: price.plan,
      paidUsdc: Number(paidRaw) / 10 ** USDC_DECIMALS,
    }
  }
}

export class SolanaHolderVerifier implements DaemonProHolderVerifier {
  private connection: Connection

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.connection = new Connection(rpcUrl(env), 'confirmed')
  }

  async getHolderBalance(walletAddress: string, holderMint: string): Promise<number> {
    const owner = new PublicKey(walletAddress)
    const mint = new PublicKey(holderMint)
    const accounts = await this.connection.getParsedTokenAccountsByOwner(owner, { mint })
    return accounts.value.reduce((sum, account) => {
      const info = account.account.data.parsed.info
      const amount = Number(info.tokenAmount?.uiAmount ?? 0)
      return Number.isFinite(amount) ? sum + amount : sum
    }, 0)
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daemon_subscriptions (
      wallet_address TEXT PRIMARY KEY,
      plan TEXT NOT NULL,
      access_source TEXT NOT NULL,
      payment_id TEXT UNIQUE,
      expires_at INTEGER NOT NULL,
      features_json TEXT NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_subscriptions_expires
      ON daemon_subscriptions(expires_at, revoked_at);

    CREATE TABLE IF NOT EXISTS daemon_holder_challenges (
      nonce TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      message TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_holder_challenges_wallet
      ON daemon_holder_challenges(wallet_address, expires_at);

    CREATE TABLE IF NOT EXISTS daemon_subscription_audit (
      id TEXT PRIMARY KEY,
      wallet_address TEXT,
      action TEXT NOT NULL,
      actor TEXT,
      plan TEXT,
      access_source TEXT,
      payment_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_daemon_subscription_audit_wallet
      ON daemon_subscription_audit(wallet_address, created_at);
  `)
}

function priceConfig(env: NodeJS.ProcessEnv, inputPlan: unknown): PriceConfig {
  const plan = paidPlan(inputPlan)
  const durationDays = numberFromEnv(env.DAEMON_PRO_DURATION_DAYS, 30)
  const priceUsdc = plan === 'ultra'
    ? numberFromEnv(env.DAEMON_ULTRA_PRICE_USDC, 200)
    : plan === 'operator'
      ? numberFromEnv(env.DAEMON_OPERATOR_PRICE_USDC, 60)
      : plan === 'team'
        ? numberFromEnv(env.DAEMON_TEAM_PRICE_USDC, 49)
        : plan === 'enterprise'
          ? numberFromEnv(env.DAEMON_ENTERPRISE_PRICE_USDC, 999)
          : numberFromEnv(env.DAEMON_PRO_PRICE_USDC, 20)

  return {
    plan,
    priceUsdc,
    durationDays,
    network: env.DAEMON_PRO_PAYMENT_NETWORK?.trim() || DEFAULT_NETWORK,
    payTo: env.DAEMON_PRO_PAY_TO?.trim() || DEFAULT_PRO_PAY_TO,
    paymentMint: env.DAEMON_PRO_PAYMENT_MINT?.trim() || USDC_MINT,
    holderMint: env.DAEMON_HOLDER_MINT?.trim() || undefined,
    holderMinAmount: numberFromEnv(env.DAEMON_HOLDER_MIN_AMOUNT, 1_000_000),
  }
}

function paymentRequiredHeader(price: PriceConfig): string {
  return Buffer.from(JSON.stringify({
    x402Version: 2,
    accepts: [{
      scheme: 'exact',
      price: `$${price.priceUsdc}`,
      network: price.network,
      payTo: price.payTo,
      asset: price.paymentMint,
    }],
    plan: price.plan,
    durationDays: price.durationDays,
    description: `DAEMON ${price.plan} subscription`,
  })).toString('base64url')
}

function holderStatus(price: PriceConfig, currentAmount: number | null = null): ProHolderStatus {
  const enabled = Boolean(price.holderMint && price.holderMinAmount)
  return {
    enabled,
    eligible: enabled && currentAmount !== null && currentAmount >= (price.holderMinAmount ?? 0),
    mint: price.holderMint ?? null,
    minAmount: price.holderMinAmount ?? null,
    currentAmount,
    symbol: 'DAEMON',
  }
}

function entitlementFor(params: {
  walletAddress: string
  plan: PaidPlan
  accessSource: ProAccessSource
  expiresAt: number
}): DaemonAiCloudEntitlement {
  const features = getPlanFeatures(params.plan)
  const allowedLanes = getHostedLanesForPlan(params.plan)
  return {
    userId: params.walletAddress,
    walletAddress: params.walletAddress,
    plan: params.plan,
    accessSource: params.accessSource,
    features,
    lane: laneForPlan(params.plan),
    allowedLanes,
    monthlyCredits: getMonthlyAiCredits(params.plan),
    usedCredits: 0,
    entitlementExpiresAt: new Date(params.expiresAt).toISOString(),
  }
}

function issueJwt(entitlement: DaemonAiCloudEntitlement, secret: string): string {
  return signDaemonAiJwt(entitlement, secret)
}

function parseFeatures(input: string): ProFeature[] {
  const valid = getPlanFeatures('enterprise')
  try {
    const parsed = JSON.parse(input) as unknown[]
    return parsed.filter((feature): feature is ProFeature =>
      typeof feature === 'string' && valid.includes(feature as ProFeature))
  } catch {
    return []
  }
}

function entitlementForSubscription(row: SubscriptionRow): DaemonAiCloudEntitlement {
  const plan = paidPlan(row.plan)
  const base = entitlementFor({
    walletAddress: row.wallet_address,
    plan,
    accessSource: row.access_source,
    expiresAt: row.expires_at,
  })
  return {
    ...base,
    features: [...new Set([...base.features, ...parseFeatures(row.features_json)])],
  }
}

function activeSubscription(db: Database.Database, walletAddress: string, now = Date.now()): SubscriptionRow | null {
  const row = db.prepare(`
    SELECT wallet_address, plan, access_source, payment_id, expires_at, features_json, revoked_at
    FROM daemon_subscriptions
    WHERE wallet_address = ? AND expires_at > ? AND revoked_at IS NULL
  `).get(walletAddress, now) as SubscriptionRow | undefined
  return row ?? null
}

function subscriptionByPayment(db: Database.Database, paymentId: string): SubscriptionRow | null {
  const row = db.prepare(`
    SELECT wallet_address, plan, access_source, payment_id, expires_at, features_json, revoked_at
    FROM daemon_subscriptions
    WHERE payment_id = ?
  `).get(paymentId) as SubscriptionRow | undefined
  return row ?? null
}

function writeSubscription(db: Database.Database, input: {
  walletAddress: string
  plan: PaidPlan
  accessSource: ProAccessSource
  paymentId: string | null
  expiresAt: number
  features: ProFeature[]
}) {
  const now = Date.now()
  db.prepare(`
    INSERT INTO daemon_subscriptions (
      wallet_address, plan, access_source, payment_id, expires_at, features_json, revoked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(wallet_address) DO UPDATE SET
      plan = excluded.plan,
      access_source = excluded.access_source,
      payment_id = excluded.payment_id,
      expires_at = excluded.expires_at,
      features_json = excluded.features_json,
      revoked_at = NULL,
      updated_at = excluded.updated_at
  `).run(
    input.walletAddress,
    input.plan,
    input.accessSource,
    input.paymentId,
    input.expiresAt,
    JSON.stringify(input.features),
    now,
    now,
  )
}

function writeAudit(db: Database.Database, input: {
  walletAddress?: string | null
  action: AuditAction
  actor?: string | null
  plan?: string | null
  accessSource?: ProAccessSource | null
  paymentId?: string | null
  metadata?: Record<string, unknown>
}) {
  db.prepare(`
    INSERT INTO daemon_subscription_audit (
      id, wallet_address, action, actor, plan, access_source, payment_id, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    input.walletAddress ?? null,
    input.action,
    input.actor ?? null,
    input.plan ?? null,
    input.accessSource ?? null,
    input.paymentId ?? null,
    JSON.stringify(input.metadata ?? {}),
    Date.now(),
  )
}

function revokeSubscription(db: Database.Database, walletAddress: string) {
  const now = Date.now()
  db.prepare(`
    UPDATE daemon_subscriptions
    SET revoked_at = ?, updated_at = ?
    WHERE wallet_address = ?
  `).run(now, now, walletAddress)
}

function subscriptionStatus(row: SubscriptionRow | null, price: PriceConfig, currentHolderAmount: number | null = null) {
  if (!row) {
    return {
      active: false,
      expiresAt: null,
      features: [],
      tier: null,
      plan: 'light' as DaemonPlanId,
      accessSource: 'free' as ProAccessSource,
      holderStatus: holderStatus(price, currentHolderAmount),
    }
  }
  const plan = paidPlan(row.plan)
  return {
    active: true,
    expiresAt: row.expires_at,
    features: JSON.parse(row.features_json) as ProFeature[],
    tier: plan,
    plan,
    accessSource: row.access_source,
    holderStatus: holderStatus(price, currentHolderAmount),
  }
}

function adminSecret(env: NodeJS.ProcessEnv): string | null {
  return env.DAEMON_PRO_ADMIN_SECRET?.trim() || env.DAEMON_ADMIN_SECRET?.trim() || null
}

function requireAdmin(req: Request, env: NodeJS.ProcessEnv): string {
  const secret = adminSecret(env)
  if (!secret) throw new Error('Admin API is not configured')
  const header = req.header('x-admin-secret')
    ?? req.header('authorization')?.replace(/^Bearer\s+/i, '')
  if (header !== secret) throw new Error('Invalid admin credentials')
  return 'admin'
}

export function createDaemonSubscriptionGateway(options: SubscriptionGatewayOptions): express.Express {
  const env = options.env ?? process.env
  const db = options.db
  const paymentVerifier = options.paymentVerifier ?? new SolanaUsdcPaymentVerifier(env)
  const holderVerifier = options.holderVerifier ?? new SolanaHolderVerifier(env)
  migrate(db)

  const app = express()
  app.use(express.json({ limit: '1mb' }))

  app.get('/v1/subscribe/price', (req, res) => {
    const price = priceConfig(env, req.query.plan)
    res.json({ ok: true, data: price })
  })

  app.get('/v1/subscribe/status', async (req, res) => {
    const wallet = optionalString(req.query.wallet)
    if (!wallet) return responseError(res, 400, 'wallet is required', 'daemon_pro_bad_request')
    let walletAddress: string
    try {
      walletAddress = assertPublicKey(wallet, 'wallet')
    } catch (error) {
      return responseError(res, 400, error instanceof Error ? error.message : String(error), 'daemon_pro_bad_request')
    }
    const price = priceConfig(env, req.query.plan)
    let currentHolderAmount: number | null = null
    if (price.holderMint) {
      try {
        currentHolderAmount = await holderVerifier.getHolderBalance(walletAddress, price.holderMint)
      } catch {
        currentHolderAmount = null
      }
    }
    res.json({ ok: true, data: subscriptionStatus(activeSubscription(db, walletAddress), price, currentHolderAmount) })
  })

  app.post('/v1/subscribe', async (req: Request, res: Response) => {
    const price = priceConfig(env, req.body?.plan ?? req.query.plan)
    const paymentHeader = req.header('x-payment') ?? req.header('payment-signature')
    if (!paymentHeader) {
      const required = paymentRequiredHeader(price)
      res.setHeader('PAYMENT-REQUIRED', required)
      res.setHeader('X-Payment-Required', required)
      return responseError(res, 402, 'Payment required', 'daemon_pro_payment_required')
    }

    try {
      const payment = await paymentVerifier.verifyPayment(paymentHeader, price)
      const existingPayment = subscriptionByPayment(db, payment.paymentId)
      if (existingPayment && existingPayment.wallet_address !== payment.walletAddress) {
        writeAudit(db, {
          walletAddress: payment.walletAddress,
          action: 'payment_replay',
          plan: payment.plan,
          accessSource: 'payment',
          paymentId: payment.paymentId,
          metadata: { originalWallet: existingPayment.wallet_address },
        })
        return responseError(res, 409, 'Payment has already been used', 'daemon_pro_payment_replayed')
      }
      if (existingPayment) {
        if (existingPayment.revoked_at !== null || existingPayment.expires_at <= Date.now()) {
          return responseError(res, 409, 'Payment has already been used', 'daemon_pro_payment_replayed')
        }
        const entitlement = entitlementForSubscription(existingPayment)
        return res.json({
          ok: true,
          idempotent: true,
          jwt: issueJwt(entitlement, options.jwtSecret),
          expiresAt: existingPayment.expires_at,
          features: entitlement.features,
          tier: entitlement.plan,
          plan: entitlement.plan,
          paymentId: existingPayment.payment_id,
          paidUsdc: payment.paidUsdc,
        })
      }

      const expiresAt = Date.now() + daysToMs(price.durationDays)
      const entitlement = entitlementFor({
        walletAddress: payment.walletAddress,
        plan: payment.plan,
        accessSource: 'payment',
        expiresAt,
      })
      writeSubscription(db, {
        walletAddress: payment.walletAddress,
        plan: payment.plan,
        accessSource: 'payment',
        paymentId: payment.paymentId,
        expiresAt,
        features: entitlement.features,
      })
      writeAudit(db, {
        walletAddress: payment.walletAddress,
        action: 'payment_subscribe',
        plan: payment.plan,
        accessSource: 'payment',
        paymentId: payment.paymentId,
        metadata: { paidUsdc: payment.paidUsdc },
      })

      return res.json({
        ok: true,
        jwt: issueJwt(entitlement, options.jwtSecret),
        expiresAt,
        features: entitlement.features,
        tier: payment.plan,
        plan: payment.plan,
        paymentId: payment.paymentId,
        paidUsdc: payment.paidUsdc,
      })
    } catch (error) {
      return responseError(res, 402, error instanceof Error ? error.message : String(error), 'daemon_pro_payment_invalid')
    }
  })

  app.post('/v1/subscribe/holder/challenge', async (req, res) => {
    const wallet = optionalString(req.body?.wallet)
    if (!wallet) return responseError(res, 400, 'wallet is required', 'daemon_pro_bad_request')
    let walletAddress: string
    try {
      walletAddress = assertPublicKey(wallet, 'wallet')
    } catch (error) {
      return responseError(res, 400, error instanceof Error ? error.message : String(error), 'daemon_pro_bad_request')
    }

    const price = priceConfig(env, 'pro')
    const currentAmount = price.holderMint ? await holderVerifier.getHolderBalance(walletAddress, price.holderMint).catch(() => 0) : 0
    const status = holderStatus(price, currentAmount)
    if (!status.enabled) return responseError(res, 503, 'Holder access is not configured', 'daemon_holder_not_configured')

    const nonce = crypto.randomUUID()
    const message = [
      'DAEMON holder access claim',
      `Wallet: ${walletAddress}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
      'No transaction or token transfer is required.',
    ].join('\n')
    const now = Date.now()
    db.prepare(`
      INSERT INTO daemon_holder_challenges (nonce, wallet_address, message, expires_at, used_at, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `).run(nonce, walletAddress, message, now + HOLDER_CHALLENGE_TTL_MS, now)
    writeAudit(db, {
      walletAddress,
      action: 'holder_challenge',
      accessSource: 'holder',
      metadata: { eligible: status.eligible, currentAmount: status.currentAmount },
    })

    res.json({ ok: true, data: { nonce, message, holderStatus: status } })
  })

  app.post('/v1/subscribe/holder/claim', async (req, res) => {
    const wallet = optionalString(req.body?.wallet)
    const nonce = optionalString(req.body?.nonce)
    const signature = optionalString(req.body?.signature)
    if (!wallet || !nonce || !signature) return responseError(res, 400, 'wallet, nonce, and signature are required', 'daemon_pro_bad_request')

    let walletAddress: string
    try {
      walletAddress = assertPublicKey(wallet, 'wallet')
    } catch (error) {
      return responseError(res, 400, error instanceof Error ? error.message : String(error), 'daemon_pro_bad_request')
    }

    const challenge = db.prepare(`
      SELECT wallet_address, nonce, message, expires_at, used_at
      FROM daemon_holder_challenges
      WHERE nonce = ?
    `).get(nonce) as HolderChallengeRow | undefined
    if (!challenge || challenge.wallet_address !== walletAddress) return responseError(res, 401, 'Invalid holder challenge', 'daemon_holder_invalid_challenge')
    if (challenge.used_at !== null) return responseError(res, 409, 'Holder challenge has already been used', 'daemon_holder_challenge_replayed')
    if (challenge.expires_at <= Date.now()) return responseError(res, 401, 'Holder challenge has expired', 'daemon_holder_challenge_expired')

    let signatureBytes: Uint8Array
    try {
      signatureBytes = bs58.decode(signature)
    } catch {
      return responseError(res, 400, 'Invalid holder signature encoding', 'daemon_pro_bad_request')
    }
    const verified = nacl.sign.detached.verify(
      Buffer.from(challenge.message, 'utf8'),
      signatureBytes,
      new PublicKey(walletAddress).toBytes(),
    )
    if (!verified) return responseError(res, 401, 'Invalid holder signature', 'daemon_holder_invalid_signature')

    const price = priceConfig(env, 'pro')
    if (!price.holderMint || !price.holderMinAmount) return responseError(res, 503, 'Holder access is not configured', 'daemon_holder_not_configured')
    const currentAmount = await holderVerifier.getHolderBalance(walletAddress, price.holderMint)
    if (currentAmount < price.holderMinAmount) return responseError(res, 403, 'Wallet does not meet holder access requirements', 'daemon_holder_insufficient_balance')

    const expiresAt = Date.now() + daysToMs(price.durationDays)
    const entitlement = entitlementFor({
      walletAddress,
      plan: 'pro',
      accessSource: 'holder',
      expiresAt,
    })
    db.transaction(() => {
      db.prepare('UPDATE daemon_holder_challenges SET used_at = ? WHERE nonce = ?').run(Date.now(), nonce)
      writeSubscription(db, {
        walletAddress,
        plan: 'pro',
        accessSource: 'holder',
        paymentId: `holder:${nonce}`,
        expiresAt,
        features: entitlement.features,
      })
      writeAudit(db, {
        walletAddress,
        action: 'holder_claim',
        plan: 'pro',
        accessSource: 'holder',
        paymentId: `holder:${nonce}`,
        metadata: { currentAmount },
      })
    })()

    res.json({
      ok: true,
      data: {
        jwt: issueJwt(entitlement, options.jwtSecret),
        expiresAt,
        features: entitlement.features,
        tier: 'pro',
        plan: 'pro',
      },
    })
  })

  app.post('/v1/admin/subscriptions/grant', (req: Request, res: Response) => {
    let actor: string
    try {
      actor = requireAdmin(req, env)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return responseError(res, message.includes('configured') ? 503 : 401, message, 'daemon_admin_unauthorized')
    }

    const wallet = optionalString(req.body?.walletAddress) ?? optionalString(req.body?.wallet)
    if (!wallet) return responseError(res, 400, 'walletAddress is required', 'daemon_pro_bad_request')

    let walletAddress: string
    try {
      walletAddress = assertPublicKey(wallet, 'wallet')
    } catch (error) {
      return responseError(res, 400, error instanceof Error ? error.message : String(error), 'daemon_pro_bad_request')
    }

    const plan = paidPlan(req.body?.plan)
    const accessSource = req.body?.accessSource === 'trial' ? 'trial' : 'admin'
    const durationDays = positiveNumber(req.body?.durationDays, priceConfig(env, plan).durationDays)
    const expiresAt = Date.now() + daysToMs(durationDays)
    const entitlement = entitlementFor({
      walletAddress,
      plan,
      accessSource,
      expiresAt,
    })
    writeSubscription(db, {
      walletAddress,
      plan,
      accessSource,
      paymentId: null,
      expiresAt,
      features: entitlement.features,
    })
    writeAudit(db, {
      walletAddress,
      action: 'admin_grant',
      actor,
      plan,
      accessSource,
      metadata: { durationDays },
    })

    return res.json({
      ok: true,
      data: {
        jwt: issueJwt(entitlement, options.jwtSecret),
        expiresAt,
        features: entitlement.features,
        tier: plan,
        plan,
        accessSource,
      },
    })
  })

  app.post('/v1/admin/subscriptions/revoke', (req: Request, res: Response) => {
    let actor: string
    try {
      actor = requireAdmin(req, env)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return responseError(res, message.includes('configured') ? 503 : 401, message, 'daemon_admin_unauthorized')
    }

    const wallet = optionalString(req.body?.walletAddress) ?? optionalString(req.body?.wallet)
    if (!wallet) return responseError(res, 400, 'walletAddress is required', 'daemon_pro_bad_request')

    let walletAddress: string
    try {
      walletAddress = assertPublicKey(wallet, 'wallet')
    } catch (error) {
      return responseError(res, 400, error instanceof Error ? error.message : String(error), 'daemon_pro_bad_request')
    }

    revokeSubscription(db, walletAddress)
    writeAudit(db, {
      walletAddress,
      action: 'admin_revoke',
      actor,
      metadata: { reason: optionalString(req.body?.reason) },
    })

    return res.json({ ok: true, data: { revoked: true, walletAddress } })
  })

  return app
}

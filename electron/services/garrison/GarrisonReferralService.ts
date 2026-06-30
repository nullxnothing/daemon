import crypto from 'node:crypto'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { getDb } from '../../db/db'
import {
  executeInstructions,
  getConnectionStrict,
  withKeypair,
} from '../SolanaService'
import { getFeeSettings, MIN_FEE_LAMPORTS } from '../FeeService'
import { tierFor } from './GarrisonStakeService'

// Garrison subsystem A — referral attribution + commission accrual + payout.
//
// A referrer earns a commission on REAL on-chain volume from wallets they referred — the
// same economic category as paying a KOL/affiliate. Two things are NON-NEGOTIABLE even in
// v0 (GARRISON_BACKEND_SPEC.md §12):
//   1. The §4 fee-floor cap, enforced PER fee_event at accrual time, so the protocol always
//      keeps at least FEE_FLOOR_HEADROOM_BPS of its net fee. This is the solvency floor.
//   2. The signed-nonce verified-referee gate. Unverified referees accrue NOTHING. This is
//      the Sybil floor.
// Commission is never a yield on the stake; a stake with zero referred volume earns zero.

// ---- §2.6 constants (compiled ceilings; config may only lower, never raise) ----
export const BASE_REFERRAL_BPS = 1000 // 10% of net protocol fee, base (pre-stake)
export const MAX_REFERRAL_BPS = 3000 // hard ceiling on (base+bonus) share of net fee
export const FEE_FLOOR_HEADROOM_BPS = 5000 // protocol always keeps >= 50% of net fee
export const KOL_RESERVED_BPS = 0 // no KOL carve-out wired in v0
export const MIN_CLAIM_LAMPORTS = 10_000_000 // 0.01 SOL — below this a claim costs more than it pays
export const PER_REFEREE_EPOCH_CAP_LAMPORTS = 5_000_000_000 // anti-wash: one referee's notional cap
const BPS_DENOM = 10_000
const EPOCH_MS = 86_400_000 // day-index epoch bucket

// -------------------------------------------------------------- attribution ---

interface AttributionRow {
  id: string
  referred_wallet: string
  referrer_wallet: string
  verified: number
  status: string
}

/** First-touch, immutable binding. Rejects self-referral and already-bound referees. */
export function bindReferral(
  refCode: string,
  referredWallet: string,
  referrerWallet: string,
  boundVia: 'link' | 'launch' | 'manual' = 'link',
): { attributionId: string; referrerWallet: string; verified: boolean } {
  if (referrerWallet === referredWallet) throw new Error('Cannot refer yourself')
  const db = getDb()
  const existing = db
    .prepare('SELECT id, referrer_wallet, verified FROM garrison_referral_attributions WHERE referred_wallet = ?')
    .get(referredWallet) as { id: string; referrer_wallet: string; verified: number } | undefined
  if (existing) {
    // First-touch wins — a referee can never be re-attributed (anti-hijack).
    return { attributionId: existing.id, referrerWallet: existing.referrer_wallet, verified: existing.verified === 1 }
  }
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO garrison_referral_attributions (id, referred_wallet, referrer_wallet, ref_code, bound_via, verified, status) ' +
      'VALUES (?,?,?,?,?,0,?)',
  ).run(id, referredWallet, referrerWallet, refCode || null, boundVia, 'active')
  return { attributionId: id, referrerWallet, verified: false }
}

/** Prove ownership of the referred wallet via the signed-nonce challenge flow. */
export function verifyReferred(referredWallet: string, nonce: string, signature: string): { verified: true } {
  const db = getDb()
  const challenge = db
    .prepare('SELECT wallet_address, message, expires_at, used_at FROM daemon_holder_challenges WHERE nonce = ?')
    .get(nonce) as { wallet_address: string; message: string; expires_at: number; used_at: number | null } | undefined
  if (!challenge || challenge.wallet_address !== referredWallet) throw new Error('Invalid challenge')
  if (challenge.used_at !== null) throw new Error('Challenge already used')
  if (challenge.expires_at <= Date.now()) throw new Error('Challenge expired')

  const verified = nacl.sign.detached.verify(
    Buffer.from(challenge.message, 'utf8'),
    bs58.decode(signature),
    new PublicKey(referredWallet).toBytes(),
  )
  if (!verified) throw new Error('Invalid signature')

  db.transaction(() => {
    db.prepare('UPDATE daemon_holder_challenges SET used_at = ? WHERE nonce = ?').run(Date.now(), nonce)
    db.prepare('UPDATE garrison_referral_attributions SET verified = 1 WHERE referred_wallet = ?').run(referredWallet)
  })()
  return { verified: true }
}

// ------------------------------------------------------------ §4 commission math ---

/**
 * The floor-safe commission for one metered execution. All shares are bps of the net fee
 * (`feeLamports`), never of notional. Returns base/bonus/total in lamports; the protocol
 * always keeps >= FEE_FLOOR_HEADROOM_BPS of the net fee, even with every knob maxed.
 */
export function commissionForEvent(
  feeLamports: number,
  multiplierBps: number,
): { base: number; bonus: number; total: number } {
  const baseShare = Math.floor((feeLamports * BASE_REFERRAL_BPS) / BPS_DENOM)
  const multipliedShare = Math.floor((baseShare * multiplierBps) / BPS_DENOM)

  // 1. cap the referral line at MAX_REFERRAL_BPS of the net fee
  const referralCap = Math.floor((feeLamports * MAX_REFERRAL_BPS) / BPS_DENOM)
  const referralLine = Math.min(multipliedShare, referralCap)

  // 2. cap the total outbound so the protocol keeps its floor
  const maxOutbound = Math.floor((feeLamports * (BPS_DENOM - FEE_FLOOR_HEADROOM_BPS)) / BPS_DENOM)
  const kol = Math.floor((feeLamports * KOL_RESERVED_BPS) / BPS_DENOM)
  const allowedReferral = Math.max(0, maxOutbound - kol)
  const total = Math.min(referralLine, allowedReferral)
  const base = Math.min(baseShare, total)
  return { base, bonus: total - base, total }
}

// --------------------------------------------------------------- accrual ---

interface FeeEventRow {
  wallet: string
  notional_lamports: number
  fee_lamports: number
  signature: string | null
  created_at: number
}

function epochOf(createdAt: number): number {
  return Math.floor(createdAt / EPOCH_MS)
}

/**
 * Fold new mainnet fee_events into per-(referrer, epoch) commission rows. Idempotent: each
 * referrer row tracks the max fee_events.created_at it has consumed (`high_water_fee_event_at`),
 * so a row is never double-counted. Only VERIFIED, active, non-self referrers accrue. The §4
 * fee-floor cap is applied per event before folding.
 */
export function runAccrual(sinceMs = 0): { rowsConsidered: number; accrued: number } {
  const db = getDb()
  const events = db
    .prepare(
      "SELECT wallet, notional_lamports, fee_lamports, signature, created_at FROM fee_events " +
        "WHERE cluster = 'mainnet-beta' AND created_at > ? ORDER BY created_at ASC",
    )
    .all(sinceMs) as FeeEventRow[]

  let accrued = 0
  for (const ev of events) {
    if (ev.fee_lamports < MIN_FEE_LAMPORTS) continue // skip dust (anti-wash)
    const attr = db
      .prepare(
        'SELECT id, referred_wallet, referrer_wallet, verified, status FROM garrison_referral_attributions WHERE referred_wallet = ?',
      )
      .get(ev.wallet) as AttributionRow | undefined
    if (!attr || attr.verified !== 1 || attr.status !== 'active') continue
    if (attr.referrer_wallet === ev.wallet) continue // self-ref hard skip

    const epoch = epochOf(ev.created_at)
    const existing = db
      .prepare('SELECT * FROM garrison_referral_commissions WHERE referrer_wallet = ? AND epoch = ?')
      .get(attr.referrer_wallet, epoch) as
      | {
          id: string
          attributed_notional_lamports: number
          high_water_fee_event_at: number
        }
      | undefined

    // Replay guard: skip an event already folded into this epoch row.
    if (existing && ev.created_at <= existing.high_water_fee_event_at) continue

    // Per-referee notional cap (anti-wash): clamp the notional credited this epoch.
    const priorNotional = existing?.attributed_notional_lamports ?? 0
    const headroom = Math.max(0, PER_REFEREE_EPOCH_CAP_LAMPORTS - priorNotional)
    if (headroom <= 0) continue
    const creditedNotional = Math.min(ev.notional_lamports, headroom)
    // Scale the fee basis proportionally so the cap also bounds the payout.
    const creditedFee =
      ev.notional_lamports > 0
        ? Math.floor((ev.fee_lamports * creditedNotional) / ev.notional_lamports)
        : ev.fee_lamports

    const { multiplierBps } = tierFor(attr.referrer_wallet)
    const { base, bonus, total } = commissionForEvent(creditedFee, multiplierBps)
    if (total <= 0) continue

    upsertCommission(attr.referrer_wallet, epoch, {
      notional: creditedNotional,
      fee: creditedFee,
      base,
      bonus,
      gross: total,
      tierId: tierFor(attr.referrer_wallet).tier?.id ?? null,
      highWater: ev.created_at,
    })
    accrued++
  }
  return { rowsConsidered: events.length, accrued }
}

function upsertCommission(
  referrerWallet: string,
  epoch: number,
  d: { notional: number; fee: number; base: number; bonus: number; gross: number; tierId: string | null; highWater: number },
): void {
  const db = getDb()
  const now = Date.now()
  const existing = db
    .prepare('SELECT id FROM garrison_referral_commissions WHERE referrer_wallet = ? AND epoch = ?')
    .get(referrerWallet, epoch) as { id: string } | undefined
  if (existing) {
    db.prepare(
      'UPDATE garrison_referral_commissions SET ' +
        'attributed_notional_lamports = attributed_notional_lamports + ?, ' +
        'attributed_fee_lamports = attributed_fee_lamports + ?, ' +
        'base_commission_lamports = base_commission_lamports + ?, ' +
        'bonus_commission_lamports = bonus_commission_lamports + ?, ' +
        'gross_commission_lamports = gross_commission_lamports + ?, ' +
        'tier_id_snapshot = ?, high_water_fee_event_at = ?, updated_at = ? WHERE id = ?',
    ).run(d.notional, d.fee, d.base, d.bonus, d.gross, d.tierId, d.highWater, now, existing.id)
    return
  }
  db.prepare(
    'INSERT INTO garrison_referral_commissions (id, referrer_wallet, epoch, attributed_notional_lamports, ' +
      'attributed_fee_lamports, base_commission_lamports, bonus_commission_lamports, gross_commission_lamports, ' +
      'tier_id_snapshot, high_water_fee_event_at, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    crypto.randomUUID(), referrerWallet, epoch, d.notional, d.fee, d.base, d.bonus, d.gross,
    d.tierId, d.highWater, 'accrued', now, now,
  )
}

// ---------------------------------------------------------------- reads ---

export function getReferralEarnings(referrerWallet: string): {
  totalAccruedLamports: number
  totalClaimableLamports: number
  totalPaidLamports: number
  referredCount: number
  verifiedReferredCount: number
} {
  const db = getDb()
  const sums = db
    .prepare(
      "SELECT " +
        "COALESCE(SUM(CASE WHEN status != 'paid' THEN gross_commission_lamports ELSE 0 END),0) AS unpaid, " +
        "COALESCE(SUM(CASE WHEN status = 'paid' THEN gross_commission_lamports ELSE 0 END),0) AS paid " +
        "FROM garrison_referral_commissions WHERE referrer_wallet = ?",
    )
    .get(referrerWallet) as { unpaid: number; paid: number }
  const counts = db
    .prepare(
      'SELECT COUNT(*) AS total, COALESCE(SUM(verified),0) AS verified ' +
        "FROM garrison_referral_attributions WHERE referrer_wallet = ? AND status = 'active'",
    )
    .get(referrerWallet) as { total: number; verified: number }
  return {
    totalAccruedLamports: sums.unpaid,
    totalClaimableLamports: sums.unpaid,
    totalPaidLamports: sums.paid,
    referredCount: counts.total,
    verifiedReferredCount: counts.verified,
  }
}

/**
 * The no-double-spend guard: a lamport accrued as commission is no longer "protocol kept",
 * so any meter-funded buyback/sweep must subtract the outstanding commission liability first.
 */
export function availableForBuyback(treasuryBalanceLamports: number): number {
  const db = getDb()
  const { liability } = db
    .prepare(
      "SELECT COALESCE(SUM(gross_commission_lamports),0) AS liability " +
        "FROM garrison_referral_commissions WHERE status != 'paid'",
    )
    .get() as { liability: number }
  return Math.max(0, treasuryBalanceLamports - liability)
}

// ---------------------------------------------------------------- claim ---

/**
 * Pay out a referrer's accrued commission from the meter treasury. The covered rows flip to
 * 'paid' in the SAME tx that inserts the payout row, so an epoch can't be double-claimed; the
 * SOL transfer's signature is persisted right after it lands for idempotent crash-resume.
 */
export async function claim(
  referrerWallet: string,
  treasuryWalletId: string,
): Promise<{ payoutId: string; signature: string; amountLamports: number; commissionsPaid: number }> {
  const db = getDb()
  const settings = getFeeSettings()
  if (!settings.treasuryAddress) throw new Error('Fee treasury is not configured')

  const rows = db
    .prepare(
      "SELECT id, gross_commission_lamports FROM garrison_referral_commissions " +
        "WHERE referrer_wallet = ? AND status != 'paid'",
    )
    .all(referrerWallet) as { id: string; gross_commission_lamports: number }[]
  const amount = rows.reduce((sum, r) => sum + r.gross_commission_lamports, 0)
  if (amount < MIN_CLAIM_LAMPORTS) {
    throw new Error(`Nothing to claim above the ${MIN_CLAIM_LAMPORTS / 1e9} SOL minimum`)
  }
  const commissionIds = rows.map((r) => r.id)

  // Reserve the payout row + flip the covered commissions in one transaction.
  const payoutId = crypto.randomUUID()
  db.transaction(() => {
    db.prepare(
      'INSERT INTO garrison_commission_payouts (id, referrer_wallet, amount_lamports, commission_ids_json, treasury_wallet, status) ' +
        'VALUES (?,?,?,?,?,?)',
    ).run(payoutId, referrerWallet, amount, JSON.stringify(commissionIds), settings.treasuryAddress, 'pending')
    const flip = db.prepare("UPDATE garrison_referral_commissions SET status = 'paid', updated_at = ? WHERE id = ?")
    const now = Date.now()
    for (const id of commissionIds) flip.run(now, id)
  })()

  // Send from the meter treasury, then record the signature for idempotent resume.
  const connection = getConnectionStrict()
  const signature = await withKeypair(treasuryWalletId, async (keypair) => {
    const ix = SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(referrerWallet),
      lamports: amount,
    })
    const res = await executeInstructions(connection, [ix], [keypair], {
      payer: keypair.publicKey,
      guardSource: 'garrison:claim',
    })
    return res.signature
  })
  db.prepare("UPDATE garrison_commission_payouts SET payout_signature = ?, status = 'sent' WHERE id = ?")
    .run(signature, payoutId)

  return { payoutId, signature, amountLamports: amount, commissionsPaid: commissionIds.length }
}

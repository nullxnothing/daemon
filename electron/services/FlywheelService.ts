import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  getAccount,
  createBurnCheckedInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import { getDb } from '../db/db'
import {
  executeInstructions,
  getConnectionStrict,
  withKeypair,
  loadKeypair,
} from './SolanaService'
import { getWalletInfrastructureSettings } from './SettingsService'
import { getFeeSettings } from './FeeService'
import { executeSwap, getMintDecimals } from './WalletService'
import { getJupiterApiKey } from './SolanaService'
import type {
  FlywheelConfig,
  FlywheelConfigureInput,
  FlywheelEvent,
  FlywheelPreview,
  FlywheelShareholder,
  FlywheelState,
} from '../shared/types'

// DAEMON Flywheel Protocol.
// A launched token's pump.fun creator fees are split on-chain into N shareholders
// (default 80% payout / 20% buyback). The buyback leg's SOL is periodically swapped
// into a target mint ($DAEMON) and burned. The split is enforced by pump.fun's
// PumpFees program; the swap-and-burn is run by DAEMON on a manual trigger.
//
// IMPORTANT: the on-chain sharing config is treated as locked after first creation —
// `configureSplit` is a one-shot, irreversible action gated behind `confirmed: true`.

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const DEFAULT_DAEMON_MINT = '4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump'
const DEFAULT_PAYOUT_BPS = 8000
const DEFAULT_BUYBACK_BPS = 2000
const TOTAL_BPS = 10_000
const MAX_SHAREHOLDERS = 10
// DAEMON platform share, skimmed off the top of each claim before the
// payout/buyback split. Locked into the config at creation; existing configs
// migrated with 0 keep their original terms. Skipped when no treasury is set.
export const DEFAULT_PLATFORM_BPS = 1_500
export const MAX_PLATFORM_BPS = 2_000
// Leave headroom for rent + tx fees so the buyback never drains the wallet to zero.
const BUYBACK_SOL_RESERVE = 0.01
// Buyback swaps a low-liquidity Token-2022 ($DAEMON); 1% slippage fails too often, so
// the flywheel uses a wider default than the wallet UI's 100 bps.
const DEFAULT_SWAP_SLIPPAGE_BPS = 300
// Below this, a buyback swap costs more in fees than it's worth — let the SOL accrue.
const MIN_BUYBACK_LAMPORTS = 2_000_000 // 0.002 SOL
// Reserve from the claimed amount to cover the claim + 2 distribute tx fees, so the
// flywheel is self-funding instead of draining the dev wallet's own SOL each run.
const FEE_RESERVE_LAMPORTS = 30_000
// Creator-fee collect can touch both the bonding-curve and AMM creator vaults; give it
// headroom above the default estimate so a multi-vault collect doesn't get starved.
const CLAIM_FEES_COMPUTE_UNITS = 400_000

const require = createRequire(import.meta.url)
let _sdk: typeof import('@nirholas/pump-sdk') | null = null
function getSdk() {
  if (!_sdk) _sdk = require('@nirholas/pump-sdk') as typeof import('@nirholas/pump-sdk')
  return _sdk
}

// ----------------------------------------------------------------- helpers ---

interface ConfigRow {
  id: string
  token_mint: string
  label: string | null
  creator_wallet_id: string
  payout_wallet: string
  buyback_wallet_id: string
  buyback_wallet: string
  payout_bps: number
  buyback_bps: number
  buyback_target_mint: string
  burn: number
  configure_signature: string | null
  created_at: number
  platform_bps: number
}

function rowToConfig(row: ConfigRow): FlywheelConfig {
  return {
    id: row.id,
    tokenMint: row.token_mint,
    label: row.label,
    creatorWalletId: row.creator_wallet_id,
    payoutWallet: row.payout_wallet,
    buybackWalletId: row.buyback_wallet_id,
    buybackWallet: row.buyback_wallet,
    payoutBps: row.payout_bps,
    buybackBps: row.buyback_bps,
    buybackTargetMint: row.buyback_target_mint,
    burn: row.burn === 1,
    configureSignature: row.configure_signature,
    createdAt: row.created_at,
    platformBps: row.platform_bps ?? 0,
  }
}

function walletAddress(walletId: string): string {
  const db = getDb()
  const row = db.prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as
    | { address: string }
    | undefined
  if (!row) throw new Error(`Wallet ${walletId} not found`)
  return row.address
}

function requireMint(mint: string, label: string): PublicKey {
  try {
    return new PublicKey(mint)
  } catch {
    throw new Error(`Invalid ${label}: ${mint}`)
  }
}

function recordEvent(event: Omit<FlywheelEvent, 'id' | 'at'> & { at?: number }): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO flywheel_events (id, config_id, kind, signature, sol_amount, token_amount, token_mint, note, at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    crypto.randomUUID(),
    event.configId,
    event.kind,
    event.signature ?? null,
    event.solAmount ?? null,
    event.tokenAmount ?? null,
    event.tokenMint ?? null,
    event.note ?? null,
    event.at ?? Date.now(),
  )
}

function getConfigOrThrow(configId: string): FlywheelConfig {
  const db = getDb()
  const row = db.prepare('SELECT * FROM flywheel_configs WHERE id = ?').get(configId) as
    | ConfigRow
    | undefined
  if (!row) throw new Error('Flywheel config not found')
  return rowToConfig(row)
}

function getConfigByMint(tokenMint: string): FlywheelConfig | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM flywheel_configs WHERE token_mint = ?').get(tokenMint) as
    | ConfigRow
    | undefined
  return row ? rowToConfig(row) : null
}

// ----------------------------------------------------- settlement ledger ---
// Crash-safe record of one claim and its two distribute legs. Lets a mid-run failure
// resume without double-paying or stranding claimed fees.

interface SettlementRow {
  id: string
  config_id: string
  claim_signature: string
  claimed_lamports: number
  payout_lamports: number
  buyback_lamports: number
  payout_signature: string | null
  buyback_signature: string | null
  status: 'claimed' | 'distributed' | 'done'
  created_at: number
  platform_lamports: number
  platform_signature: string | null
}

function clampPlatformBps(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_PLATFORM_BPS
  return Math.min(Math.max(n, 0), MAX_PLATFORM_BPS)
}

/** Treasury for the platform skim, or null when none is configured. */
function platformTreasury(): string | null {
  const treasury = getFeeSettings().treasuryAddress
  return treasury ? treasury : null
}

function insertSettlement(configId: string, claimSignature: string, claimedLamports: number): string {
  const db = getDb()
  const id = crypto.randomUUID()
  db.prepare(
    `INSERT INTO flywheel_settlements (id, config_id, claim_signature, claimed_lamports, status)
     VALUES (?,?,?,?,'claimed')`,
  ).run(id, configId, claimSignature, claimedLamports)
  return id
}

function getSettlement(id: string): SettlementRow | null {
  const db = getDb()
  return (db.prepare('SELECT * FROM flywheel_settlements WHERE id = ?').get(id) as SettlementRow | undefined) ?? null
}

/** The oldest not-yet-distributed settlement for a config, if any (resume target). */
function getPendingSettlement(configId: string): SettlementRow | null {
  const db = getDb()
  return (
    (db
      .prepare("SELECT * FROM flywheel_settlements WHERE config_id = ? AND status = 'claimed' ORDER BY created_at ASC LIMIT 1")
      .get(configId) as SettlementRow | undefined) ?? null
  )
}

export interface TokenCreatorState {
  /** On-chain creator/coinCreator authority, or null if neither account could be read. */
  creator: string | null
  /** True once the token migrated to the PumpSwap AMM pool. */
  graduated: boolean
  /** Canonical pool address for graduated tokens (pass as `pool` to the SDK); null on the bonding curve. */
  pool: PublicKey | null
}

/**
 * Resolve a pump.fun token's creator authority across BOTH lifecycle stages:
 * - bonding curve (ungraduated): read `BondingCurve.creator`
 * - graduated to PumpSwap: the bonding curve account is gone, so read the canonical
 *   pool's `coinCreator` instead.
 * Throws only when neither account exists (i.e. not a pump.fun token).
 */
async function resolveTokenCreatorState(tokenMint: string): Promise<TokenCreatorState> {
  const sdk = getSdk()
  const connection = getConnectionStrict()
  const pumpSdk = new sdk.PumpSdk()
  const mint = requireMint(tokenMint, 'token mint')

  let lastError: unknown = null

  // 1) Bonding curve. There is exactly one bonding-curve account per mint at the
  //    PDA ["bonding-curve", mint] (both `create` and `create_v2`/Token2022 use it).
  //    Read it raw so a graduated token (whose helper read may throw) still yields a
  //    decodable account, and we can distinguish "graduated" from "RPC failed".
  try {
    const info = await connection.getAccountInfo(sdk.bondingCurvePda(mint))
    if (info) {
      const bc = pumpSdk.decodeBondingCurveNullable(info)
      if (bc && !bc.complete) {
        return { creator: bc.creator.toBase58(), graduated: false, pool: null }
      }
      // bc.complete === true → graduated; fall through to the pool path.
    }
    // info === null → never a bonding curve here; fall through (could be a raw AMM pool).
  } catch (err) {
    lastError = err
  }

  // 2) Graduated: the canonical PumpSwap pool holds `coin_creator`. The SDK derives
  //    the canonical pool PDA (index 0, pool authority, mint, WSOL) for us.
  try {
    const pool = sdk.canonicalPumpPoolPda(mint)
    const accountInfo = await connection.getAccountInfo(pool)
    if (accountInfo) {
      const decoded = pumpSdk.decodePool(accountInfo)
      return { creator: decoded.coinCreator.toBase58(), graduated: true, pool }
    }
  } catch (err) {
    lastError = err
  }

  const cluster = getWalletInfrastructureSettings().cluster
  const detail = lastError instanceof Error ? ` (${lastError.message})` : ''
  const clusterHint =
    cluster !== 'mainnet-beta'
      ? ` Your RPC cluster is "${cluster}" — pump.fun tokens live on mainnet-beta. Switch the cluster in Wallet settings.`
      : ' It may not be a pump.fun token, or the RPC failed — check HELIUS_API_KEY in Wallet settings.'
  throw new Error(
    `Could not read a pump.fun bonding curve or PumpSwap pool for ${tokenMint} on ${cluster}.${detail}${clusterHint}`,
  )
}

// -------------------------------------------------------------- validation ---

function buildShareholders(input: {
  payoutWallet: string
  buybackWallet: string
  payoutBps: number
  buybackBps: number
}): FlywheelShareholder[] {
  return [
    { address: input.payoutWallet, shareBps: input.payoutBps },
    { address: input.buybackWallet, shareBps: input.buybackBps },
  ]
}

/** Throws on any constraint the PumpFees program enforces. */
export function validateShareholders(shareholders: FlywheelShareholder[]): void {
  if (shareholders.length === 0) throw new Error('At least one shareholder is required')
  if (shareholders.length > MAX_SHAREHOLDERS) {
    throw new Error(`Too many shareholders (max ${MAX_SHAREHOLDERS})`)
  }
  const seen = new Set<string>()
  let total = 0
  for (const s of shareholders) {
    if (!Number.isInteger(s.shareBps) || s.shareBps <= 0) {
      throw new Error(`Shareholder ${s.address} must have a positive integer shareBps`)
    }
    if (seen.has(s.address)) throw new Error(`Duplicate shareholder address: ${s.address}`)
    seen.add(s.address)
    requireMint(s.address, 'shareholder address')
    total += s.shareBps
  }
  if (total !== TOTAL_BPS) {
    throw new Error(`Shareholder shares must sum to ${TOTAL_BPS} bps (got ${total})`)
  }
}

// ----------------------------------------------------------------- preview ---

export async function previewSplit(input: FlywheelConfigureInput): Promise<FlywheelPreview> {
  const payoutBps = input.payoutBps ?? DEFAULT_PAYOUT_BPS
  const buybackBps = input.buybackBps ?? DEFAULT_BUYBACK_BPS
  const buybackTargetMint = input.buybackTargetMint ?? DEFAULT_DAEMON_MINT
  const payoutWallet = input.payoutWallet
  const buybackWallet = walletAddress(input.buybackWalletId)

  const shareholders = buildShareholders({ payoutWallet, buybackWallet, payoutBps, buybackBps })
  validateShareholders(shareholders)
  requireMint(buybackTargetMint, 'buyback target mint')

  const creatorAddress = walletAddress(input.creatorWalletId)
  const existing = getConfigByMint(input.tokenMint)
  // Terms lock at creation: an existing config keeps its platform share.
  const platformBps = existing ? existing.platformBps : clampPlatformBps(input.platformBps)

  // Read the token's on-chain creator authority (bonding-curve OR graduated pool) so
  // the UI can warn if the selected wallet can't actually claim the fees. Best-effort.
  let onChainCreator: string | null = null
  try {
    const tokenState = await resolveTokenCreatorState(input.tokenMint)
    onChainCreator = tokenState.creator
  } catch {
    onChainCreator = null
  }
  const creatorMatches = onChainCreator === null || onChainCreator === creatorAddress

  const warnings: string[] = []
  if (!creatorMatches) {
    warnings.push(
      `Selected creator wallet (${creatorAddress.slice(0, 6)}…) is NOT the token's on-chain creator ` +
        `(${onChainCreator?.slice(0, 6)}…). Only the creator can claim this token's fees — claiming will fail.`,
    )
  }
  if (existing) {
    warnings.push('A flywheel is already saved for this token. Saving again updates the recipients/percentages.')
  }
  warnings.push(
    `On "Run flywheel": the creator wallet claims all fees, sends ${payoutBps / 100}% to the payout wallet ` +
      `and ${buybackBps / 100}% to the buyback wallet, which swaps to ${buybackTargetMint.slice(0, 6)}… and burns. ` +
      'No on-chain fee-share config is written — the split is off-chain and editable.',
  )

  return {
    tokenMint: input.tokenMint,
    shareholders,
    buybackTargetMint,
    alreadyConfigured: !!existing,
    onChainCreator,
    creatorMatches,
    warnings,
    platformBps,
  }
}

// --------------------------------------------------------------- configure ---

export async function configureSplit(input: FlywheelConfigureInput): Promise<FlywheelConfig> {
  const payoutBps = input.payoutBps ?? DEFAULT_PAYOUT_BPS
  const buybackBps = input.buybackBps ?? DEFAULT_BUYBACK_BPS
  const buybackTargetMint = input.buybackTargetMint ?? DEFAULT_DAEMON_MINT
  const payoutWallet = input.payoutWallet
  const buybackWallet = walletAddress(input.buybackWalletId)
  const creatorAddress = walletAddress(input.creatorWalletId)

  validateShareholders(buildShareholders({ payoutWallet, buybackWallet, payoutBps, buybackBps }))
  requireMint(buybackTargetMint, 'buyback target mint')

  // The creator wallet claims the fees, so it must be the token's on-chain creator.
  const tokenState = await resolveTokenCreatorState(input.tokenMint)
  if (tokenState.creator && tokenState.creator !== creatorAddress) {
    throw new Error(
      `Selected creator wallet (${creatorAddress.slice(0, 6)}…) is not the token's on-chain creator ` +
        `(${tokenState.creator.slice(0, 6)}…). Only the creator can claim this token's fees.`,
    )
  }

  // Off-chain split: persist (or update) the recipients. No on-chain config is written.
  const db = getDb()
  const existing = getConfigByMint(input.tokenMint)
  const id = existing?.id ?? crypto.randomUUID()
  const burn = input.burn === false ? 0 : 1

  if (existing) {
    db.prepare(
      `UPDATE flywheel_configs SET label=?, creator_wallet_id=?, payout_wallet=?, buyback_wallet_id=?,
         buyback_wallet=?, payout_bps=?, buyback_bps=?, buyback_target_mint=?, burn=? WHERE id=?`,
    ).run(
      input.label ?? null, input.creatorWalletId, payoutWallet, input.buybackWalletId,
      buybackWallet, payoutBps, buybackBps, buybackTargetMint, burn, id,
    )
  } else {
    db.prepare(
      `INSERT INTO flywheel_configs
         (id, token_mint, label, creator_wallet_id, payout_wallet, buyback_wallet_id, buyback_wallet,
          payout_bps, buyback_bps, buyback_target_mint, burn, configure_signature)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id, input.tokenMint, input.label ?? null, input.creatorWalletId, payoutWallet,
      input.buybackWalletId, buybackWallet, payoutBps, buybackBps, buybackTargetMint, burn, null,
    )
  }

  const config = getConfigOrThrow(id)
  recordEvent({
    configId: id,
    kind: 'configure',
    signature: null,
    solAmount: null,
    tokenAmount: null,
    tokenMint: input.tokenMint,
    note: `Off-chain split saved: ${payoutBps / 100}% payout / ${buybackBps / 100}% buyback`,
  })
  return config
}

// ------------------------------------------------------------------- claim ---

/**
 * Read how many lamports a confirmed transaction credited to `address`, from the tx's
 * own pre/post balances. Adds back the tx fee so the fee-payer's gross credit is
 * reported (the claim's fee shouldn't reduce the amount we then split). Returns 0 if
 * the tx can't be fetched yet or the address wasn't involved.
 */
async function readCreditedLamports(
  connection: ReturnType<typeof getConnectionStrict>,
  signature: string,
  address: string,
): Promise<number> {
  // Brief retry: the tx is confirmed, but getTransaction can lag a beat behind.
  for (let attempt = 0; attempt < 5; attempt++) {
    const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 })
    if (tx?.meta) {
      const keys = tx.transaction.message.getAccountKeys?.() ?? null
      const list = keys
        ? keys.staticAccountKeys.concat(keys.accountKeysFromLookups?.writable ?? [], keys.accountKeysFromLookups?.readonly ?? [])
        : tx.transaction.message.staticAccountKeys
      const idx = list.findIndex((k) => k.toBase58() === address)
      if (idx >= 0) {
        const net = tx.meta.postBalances[idx] - tx.meta.preBalances[idx]
        // The fee payer is account index 0; add the fee back to get gross credited.
        const gross = idx === 0 ? net + tx.meta.fee : net
        return Math.max(0, gross)
      }
      return 0
    }
    await new Promise((r) => setTimeout(r, 800))
  }
  return 0
}

/**
 * The dev/creator wallet claims 100% of accrued creator fees to itself. Returns the
 * gross fees the claim credited to the wallet — read from the CONFIRMED transaction's
 * own balance change (authoritative; a before/after getBalance races RPC propagation
 * and can read 0). The dev wallet paid the tx fee, so gross credited = netDelta + fee.
 */
export async function claimFees(configId: string): Promise<{ signature: string; claimedLamports: number; settlementId: string }> {
  const config = getConfigOrThrow(configId)
  const sdk = getSdk()
  const connection = getConnectionStrict()
  const creator = new PublicKey(walletAddress(config.creatorWalletId))
  const creatorAddr = creator.toBase58()

  const result = await withKeypair(config.creatorWalletId, async (keypair) => {
    const onlineSdk = new sdk.OnlinePumpSdk(connection)
    // Without an on-chain sharing config this is a plain creator-vault collect on the
    // pump / AMM program (both allowlisted) — all fees land in the creator wallet.
    const instructions = await onlineSdk.collectCoinCreatorFeeInstructions(keypair.publicKey)
    if (instructions.length === 0) throw new Error('No creator fees available to claim')
    return executeInstructions(connection, instructions, [keypair], {
      payer: keypair.publicKey,
      computeUnitLimit: CLAIM_FEES_COMPUTE_UNITS,
      guardSource: 'flywheel:claim',
    })
  })

  const claimedLamports = await readCreditedLamports(connection, result.signature, creatorAddr)
  // Persist the claim as a pending settlement BEFORE distributing, so a crash between
  // claim and distribute is recoverable (resumed on the next run, no double-pay).
  const settlementId = insertSettlement(configId, result.signature, claimedLamports)

  recordEvent({
    configId,
    kind: 'claim',
    signature: result.signature,
    solAmount: (claimedLamports / 1e9).toString(),
    tokenAmount: null,
    tokenMint: config.tokenMint,
    note: `Claimed ${(claimedLamports / 1e9).toFixed(6)} SOL of creator fees`,
  })
  return { signature: result.signature, claimedLamports, settlementId }
}

// -------------------------------------------------------------- distribute ---

/**
 * Settle one claim: split the claimed SOL (minus a fee reserve) payoutBps to the payout
 * wallet and buybackBps to the buyback wallet, signed by the creator/dev wallet. Driven
 * by a settlement row so it is idempotent — a leg whose signature is already recorded is
 * skipped, so a re-run after a partial failure never double-pays. Each leg's signature is
 * persisted to the ledger immediately after it lands.
 */
export async function distributeClaimed(
  settlementId: string,
): Promise<{ payoutSignature: string | null; buybackSignature: string | null; buybackLamports: number }> {
  const db = getDb()
  const settlement = getSettlement(settlementId)
  if (!settlement) throw new Error('Settlement not found')
  const config = getConfigOrThrow(settlement.config_id)

  // Reserve tx fees from the claimed amount so the flywheel is self-funding, then split
  // the remainder. Computed once and stored on the row so a resume splits identically.
  let payoutLamports = settlement.payout_lamports
  let buybackLamports = settlement.buyback_lamports
  if (payoutLamports === 0 && buybackLamports === 0) {
    const distributable = Math.max(0, settlement.claimed_lamports - FEE_RESERVE_LAMPORTS)
    payoutLamports = Math.floor((distributable * config.payoutBps) / TOTAL_BPS)
    buybackLamports = Math.floor((distributable * config.buybackBps) / TOTAL_BPS)
    db.prepare('UPDATE flywheel_settlements SET payout_lamports = ?, buyback_lamports = ? WHERE id = ?')
      .run(payoutLamports, buybackLamports, settlementId)
  }

  const sendTransfer = async (to: string, lamports: number, kind: 'payout' | 'buyback'): Promise<string> => {
    const sig = await withKeypair(config.creatorWalletId, async (keypair) => {
      const ix = SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: new PublicKey(to), lamports })
      const res = await executeInstructions(connection, [ix], [keypair], {
        payer: keypair.publicKey,
        guardSource: `flywheel:distribute:${kind}`,
      })
      return res.signature
    })
    db.prepare(`UPDATE flywheel_settlements SET ${kind}_signature = ? WHERE id = ?`).run(sig, settlementId)
    recordEvent({
      configId: config.id,
      kind: 'transfer',
      signature: sig,
      solAmount: (lamports / 1e9).toString(),
      tokenAmount: null,
      tokenMint: null,
      note: `${kind === 'payout' ? config.payoutBps / 100 : config.buybackBps / 100}% → ${to.slice(0, 6)}… (${kind})`,
    })
    return sig
  }

  const connection = getConnectionStrict()
  // Skip any leg already completed (idempotent resume); only send what's outstanding.
  let payoutSignature = settlement.payout_signature
  let buybackSignature = settlement.buyback_signature
  if (!payoutSignature && payoutLamports > 0) payoutSignature = await sendTransfer(config.payoutWallet, payoutLamports, 'payout')
  if (!buybackSignature && buybackLamports > 0) buybackSignature = await sendTransfer(config.buybackWallet, buybackLamports, 'buyback')

  db.prepare("UPDATE flywheel_settlements SET status = 'distributed' WHERE id = ?").run(settlementId)
  return { payoutSignature, buybackSignature, buybackLamports }
}

/**
 * Ad-hoc split of a specific SOL amount already sitting in the dev wallet (e.g. fees
 * claimed in an earlier session but never distributed). Not ledger-tracked — it's a
 * manual recovery/top-up action, distinct from the crash-safe runFlywheel path.
 */
export async function distributeManual(
  configId: string,
  grossLamports: number,
): Promise<{ payoutSignature: string | null; buybackSignature: string | null; buybackLamports: number }> {
  const config = getConfigOrThrow(configId)
  const connection = getConnectionStrict()
  const distributable = Math.max(0, Math.floor(grossLamports) - FEE_RESERVE_LAMPORTS)
  if (distributable <= 0) return { payoutSignature: null, buybackSignature: null, buybackLamports: 0 }

  const payoutLamports = Math.floor((distributable * config.payoutBps) / TOTAL_BPS)
  const buybackLamports = Math.floor((distributable * config.buybackBps) / TOTAL_BPS)

  const sendTransfer = async (to: string, lamports: number, kind: 'payout' | 'buyback'): Promise<string | null> => {
    if (lamports <= 0) return null
    const sig = await withKeypair(config.creatorWalletId, async (keypair) => {
      const ix = SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: new PublicKey(to), lamports })
      const res = await executeInstructions(connection, [ix], [keypair], {
        payer: keypair.publicKey,
        guardSource: `flywheel:distribute:${kind}`,
      })
      return res.signature
    })
    recordEvent({
      configId, kind: 'transfer', signature: sig,
      solAmount: (lamports / 1e9).toString(), tokenAmount: null, tokenMint: null,
      note: `${kind === 'payout' ? config.payoutBps / 100 : config.buybackBps / 100}% → ${to.slice(0, 6)}… (${kind}, manual)`,
    })
    return sig
  }

  const payoutSignature = await sendTransfer(config.payoutWallet, payoutLamports, 'payout')
  const buybackSignature = await sendTransfer(config.buybackWallet, buybackLamports, 'buyback')
  return { payoutSignature, buybackSignature, buybackLamports }
}

// --------------------------------------------------------- swap-and-burn ---

/**
 * Resolve which token program owns a mint (classic SPL vs Token-2022). $DAEMON and
 * other pump `create_v2` tokens are Token-2022 — the ATA derivation and burn
 * instruction MUST use the matching program or the ATA is wrong / the burn fails.
 */
async function resolveTokenProgram(connection: ReturnType<typeof getConnectionStrict>, mint: PublicKey): Promise<PublicKey> {
  const info = await connection.getAccountInfo(mint)
  if (info && info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID
  return TOKEN_PROGRAM_ID
}

/** Burn the buyback wallet's entire balance of `targetMint`. */
async function burnTargetBalance(
  config: FlywheelConfig,
): Promise<{ signature: string; amount: string } | null> {
  const connection = getConnectionStrict()
  const mint = requireMint(config.buybackTargetMint, 'buyback target mint')
  const owner = new PublicKey(config.buybackWallet)
  const tokenProgram = await resolveTokenProgram(connection, mint)
  const ata = await getAssociatedTokenAddress(mint, owner, false, tokenProgram)

  let amount: bigint
  try {
    const account = await getAccount(connection, ata, undefined, tokenProgram)
    amount = account.amount
  } catch {
    return null // no ATA / nothing to burn
  }
  if (amount <= 0n) return null

  const decimals = await getMintDecimals(config.buybackTargetMint, connection)
  const result = await withKeypair(config.buybackWalletId, async (keypair) => {
    const ix = createBurnCheckedInstruction(ata, mint, keypair.publicKey, amount, decimals, [], tokenProgram)
    return executeInstructions(connection, [ix], [keypair], {
      payer: keypair.publicKey,
      guardSource: 'flywheel:burn',
    })
  })

  recordEvent({
    configId: config.id,
    kind: 'burn',
    signature: result.signature,
    solAmount: null,
    tokenAmount: amount.toString(),
    tokenMint: config.buybackTargetMint,
    note: `Burned ${Number(amount) / 10 ** decimals} ${config.buybackTargetMint.slice(0, 6)}`,
  })
  return { signature: result.signature, amount: amount.toString() }
}

/**
 * Swap the buyback wallet's SOL (minus a reserve) into the target mint, then burn it.
 * Swap and burn are separate guarded transactions — if the burn fails, the bought
 * tokens sit in the buyback wallet and a later run burns the residual balance.
 */
export type BuybackStatus = 'swapped' | 'swap-failed' | 'no-jupiter-key' | 'nothing-to-swap'

export async function runBuyback(configId: string, slippageBps = DEFAULT_SWAP_SLIPPAGE_BPS): Promise<{
  swapSignature: string | null
  burnSignature: string | null
  status: BuybackStatus
  swapError?: string
}> {
  const config = getConfigOrThrow(configId)
  const connection = getConnectionStrict()
  const owner = new PublicKey(config.buybackWallet)
  const lamports = await connection.getBalance(owner)
  const reserveLamports = Math.floor(BUYBACK_SOL_RESERVE * 1e9)
  const spendableLamports = lamports - reserveLamports

  let swapSignature: string | null = null
  let status: BuybackStatus = 'nothing-to-swap'
  let swapError: string | undefined

  if (spendableLamports < MIN_BUYBACK_LAMPORTS) {
    // Below the floor (or nothing): leave the SOL to accrue rather than burn it on fees.
    status = 'nothing-to-swap'
  } else if (!getJupiterApiKey()) {
    // Don't pretend success: the SOL is in the buyback wallet but cannot be swapped.
    status = 'no-jupiter-key'
  } else {
    const amountSol = spendableLamports / 1e9
    // A swap failure (e.g. an AMM route the signer guard rejects) must NOT block the
    // burn of $DAEMON already in the wallet — record it and continue to the burn.
    try {
      const swap = await executeSwap(
        config.buybackWalletId, SOL_MINT, config.buybackTargetMint, amountSol, slippageBps,
        undefined, { restrictIntermediateTokens: true },
      )
      swapSignature = swap.signature
      status = 'swapped'
      recordEvent({
        configId,
        kind: 'swap',
        signature: swap.signature,
        solAmount: amountSol.toString(),
        tokenAmount: null,
        tokenMint: config.buybackTargetMint,
        note: `Swapped ${amountSol} SOL → ${config.buybackTargetMint.slice(0, 6)}`,
      })
    } catch (err) {
      status = 'swap-failed'
      swapError = err instanceof Error ? err.message : String(err)
    }
  }

  // Burn whatever target-mint balance the wallet holds (covers this swap + any residual).
  let burnSignature: string | null = null
  if (config.burn) {
    const burn = await burnTargetBalance(config)
    burnSignature = burn?.signature ?? null
  }

  return { swapSignature, burnSignature, status, swapError }
}

/**
 * Full flywheel in one action:
 *  1. dev/creator wallet claims 100% of accrued creator fees (measures the SOL delta),
 *  2. splits that claimed amount off-chain — payoutBps to the payout wallet, buybackBps
 *     to the buyback wallet,
 *  3. the buyback wallet swaps its SOL → target mint and burns it.
 */
export async function runFlywheel(configId: string): Promise<{
  claimSignature: string | null
  claimedSol: number
  payoutSignature: string | null
  buybackTransferSignature: string | null
  swapSignature: string | null
  burnSignature: string | null
  status: BuybackStatus
}> {
  let claimSignature: string | null = null
  let claimedLamports = 0
  let settlementId: string | null = null

  // Resume any prior claim that was recorded but not fully distributed (crash recovery)
  // before claiming fresh — this prevents stranded claimed fees and double-distribution.
  const pending = getPendingSettlement(configId)
  if (pending) {
    settlementId = pending.id
    claimSignature = pending.claim_signature
    claimedLamports = pending.claimed_lamports
  } else {
    try {
      const claim = await claimFees(configId)
      claimSignature = claim.signature
      claimedLamports = claim.claimedLamports
      settlementId = claim.settlementId
    } catch (err) {
      // No fees to claim is not fatal — still buy back/burn any residual that exists.
      if (!(err instanceof Error) || !/no creator fees/i.test(err.message)) throw err
    }
  }

  const distribution = settlementId
    ? await distributeClaimed(settlementId)
    : { payoutSignature: null, buybackSignature: null, buybackLamports: 0 }
  const buyback = await runBuyback(configId)

  return {
    claimSignature,
    claimedSol: claimedLamports / 1e9,
    payoutSignature: distribution.payoutSignature,
    buybackTransferSignature: distribution.buybackSignature,
    ...buyback,
  }
}

/**
 * Run every configured flywheel sequentially, continuing past failures. Returns a
 * per-config result summary (does not throw on individual failures).
 */
export async function runAllFlywheels(): Promise<
  Array<{ configId: string; label: string | null; ok: boolean; claimedSol?: number; status?: BuybackStatus; error?: string }>
> {
  const configs = listConfigs()
  const results: Array<{ configId: string; label: string | null; ok: boolean; claimedSol?: number; status?: BuybackStatus; error?: string }> = []
  for (const config of configs) {
    try {
      const r = await runFlywheel(config.id)
      results.push({ configId: config.id, label: config.label, ok: true, claimedSol: r.claimedSol, status: r.status })
    } catch (err) {
      results.push({ configId: config.id, label: config.label, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}

// ------------------------------------------------------------------- reads ---

export function listConfigs(): FlywheelConfig[] {
  const db = getDb()
  const rows = db.prepare('SELECT * FROM flywheel_configs ORDER BY created_at DESC').all() as ConfigRow[]
  return rows.map(rowToConfig)
}

function listEvents(configId: string, limit = 50): FlywheelEvent[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM flywheel_events WHERE config_id = ? ORDER BY at DESC LIMIT ?')
    .all(configId, limit) as Array<{
    id: string
    config_id: string
    kind: FlywheelEvent['kind']
    signature: string | null
    sol_amount: string | null
    token_amount: string | null
    token_mint: string | null
    note: string | null
    at: number
  }>
  return rows.map((r) => ({
    id: r.id,
    configId: r.config_id,
    kind: r.kind,
    signature: r.signature,
    solAmount: r.sol_amount,
    tokenAmount: r.token_amount,
    tokenMint: r.token_mint,
    note: r.note,
    at: r.at,
  }))
}

export async function getFlywheelState(configId: string): Promise<FlywheelState> {
  const config = getConfigOrThrow(configId)
  const sdk = getSdk()
  const connection = getConnectionStrict()
  const creator = new PublicKey(walletAddress(config.creatorWalletId))

  let accruedLamports = '0'
  try {
    const onlineSdk = new sdk.OnlinePumpSdk(connection)
    const balance = await onlineSdk.getCreatorVaultBalanceBothPrograms(creator)
    accruedLamports = balance.toString()
  } catch {
    accruedLamports = '0'
  }

  let buybackWalletSol = 0
  try {
    buybackWalletSol = (await connection.getBalance(new PublicKey(config.buybackWallet))) / 1e9
  } catch {
    buybackWalletSol = 0
  }

  const events = listEvents(config.id)
  const totalBurnedTokens = events
    .filter((e) => e.kind === 'burn' && e.tokenAmount)
    .reduce((acc, e) => acc + BigInt(e.tokenAmount as string), 0n)
    .toString()
  const totalSwappedSol = events
    .filter((e) => e.kind === 'swap' && e.solAmount)
    .reduce((acc, e) => acc + Number(e.solAmount), 0)
    .toString()

  // The split is enforced off-chain by DAEMON, so the "shareholders" are simply the
  // configured recipients. accruedLamports is the unclaimed creator-vault balance.
  return {
    config,
    accruedLamports,
    splitRecipients: [
      { address: config.payoutWallet, shareBps: config.payoutBps },
      { address: config.buybackWallet, shareBps: config.buybackBps },
    ],
    buybackWalletSol,
    totalBurnedTokens,
    totalSwappedSol,
    events,
  }
}

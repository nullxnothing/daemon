import { randomUUID } from 'node:crypto'
import { PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js'
import { getDb } from '../db/db'
import { getJsonSetting, setJsonSetting, getWalletInfrastructureSettings } from './SettingsService'
import { LogService } from './LogService'

/**
 * Execution fee meter.
 *
 * DAEMON charges a basis-point fee on agent-routed mainnet execution. The fee
 * rides as a SystemProgram.transfer leg appended to the SAME transaction as the
 * action it meters — atomic with the action, inspected by the signer guard, and
 * visible on the approval card before anything is signed. Devnet/localnet are
 * never charged, and the meter is hard-disabled until a treasury address is
 * configured. The compiled ceiling caps the published rate ramp: config can
 * lower the rate, never exceed MAX_FEE_BPS.
 */

export const MAX_FEE_BPS = 75
export const DEFAULT_FEE_BPS = 25
/** Below this the fee rounds to noise; we charge nothing rather than dust. */
export const MIN_FEE_LAMPORTS = 5_000

const FEE_SETTINGS_KEY = 'execution_fee_settings'

export type ExecutionFeeKind = 'transfer' | 'swap' | 'launch' | 'other'

export interface ExecutionFeeSettings {
  enabled: boolean
  bps: number
  treasuryAddress: string
}

export interface ExecutionFeeQuote {
  bps: number
  lamports: number
  treasury: string
}

export interface ExecutionFeeRequest {
  kind: ExecutionFeeKind
  notionalLamports: number
  /** Paying wallet address, recorded in the local ledger. */
  wallet: string
}

const DEFAULT_SETTINGS: ExecutionFeeSettings = {
  enabled: false,
  bps: DEFAULT_FEE_BPS,
  treasuryAddress: '',
}

function clampBps(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_FEE_BPS
  return Math.min(Math.max(n, 0), MAX_FEE_BPS)
}

function isValidTreasury(address: string): boolean {
  if (!address) return false
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}

export function getFeeSettings(): ExecutionFeeSettings {
  const raw = getJsonSetting<Partial<ExecutionFeeSettings>>(FEE_SETTINGS_KEY, DEFAULT_SETTINGS)
  const treasuryAddress = typeof raw?.treasuryAddress === 'string' ? raw.treasuryAddress.trim() : ''
  return {
    // No treasury → the meter is off no matter what the flag says.
    enabled: raw?.enabled === true && isValidTreasury(treasuryAddress),
    bps: clampBps(raw?.bps),
    treasuryAddress,
  }
}

export function setFeeSettings(next: Partial<ExecutionFeeSettings>): ExecutionFeeSettings {
  const current = getJsonSetting<Partial<ExecutionFeeSettings>>(FEE_SETTINGS_KEY, DEFAULT_SETTINGS)
  const treasuryAddress = typeof (next.treasuryAddress ?? current.treasuryAddress) === 'string'
    ? String(next.treasuryAddress ?? current.treasuryAddress).trim()
    : ''
  if (treasuryAddress && !isValidTreasury(treasuryAddress)) {
    throw new Error('Treasury address is not a valid Solana public key')
  }
  const merged: ExecutionFeeSettings = {
    enabled: typeof next.enabled === 'boolean' ? next.enabled : current.enabled === true,
    bps: clampBps(next.bps ?? current.bps),
    treasuryAddress,
  }
  setJsonSetting(FEE_SETTINGS_KEY, merged)
  LogService.info('FeeService', 'Execution fee settings updated', {
    enabled: merged.enabled,
    bps: merged.bps,
    treasuryConfigured: Boolean(merged.treasuryAddress),
  })
  return getFeeSettings()
}

function isMainnet(): boolean {
  try {
    return getWalletInfrastructureSettings().cluster === 'mainnet-beta'
  } catch {
    return false
  }
}

/**
 * Fee quote for a mainnet execution, or null when no fee applies (meter off,
 * not on mainnet, zero/invalid notional, or below the dust floor).
 */
export function quoteExecutionFee(notionalLamports: number): ExecutionFeeQuote | null {
  const settings = getFeeSettings()
  if (!settings.enabled) return null
  if (!isMainnet()) return null
  if (!Number.isFinite(notionalLamports) || notionalLamports <= 0) return null
  const lamports = Math.floor((notionalLamports * settings.bps) / 10_000)
  if (lamports < MIN_FEE_LAMPORTS) return null
  return { bps: settings.bps, lamports, treasury: settings.treasuryAddress }
}

/** The fee leg. Appended to the metered transaction so fee + action are atomic. */
export function buildFeeInstruction(payer: PublicKey, quote: ExecutionFeeQuote): TransactionInstruction {
  return SystemProgram.transfer({
    fromPubkey: payer,
    toPubkey: new PublicKey(quote.treasury),
    lamports: quote.lamports,
  })
}

/** Ledger write — call only after the metered transaction confirmed. */
export function recordFeeEvent(
  request: ExecutionFeeRequest,
  quote: ExecutionFeeQuote,
  signature: string | undefined,
): void {
  const cluster = (() => {
    try {
      return getWalletInfrastructureSettings().cluster
    } catch {
      return 'unknown'
    }
  })()
  getDb().prepare(
    `INSERT INTO fee_events (id, cluster, wallet, action_kind, notional_lamports, fee_lamports, bps, treasury, signature)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    randomUUID(),
    cluster,
    request.wallet,
    request.kind,
    Math.floor(request.notionalLamports),
    quote.lamports,
    quote.bps,
    quote.treasury,
    signature ?? null,
  )
}

export interface FeeLedgerSummary {
  totalFeeLamports: number
  totalNotionalLamports: number
  feeEventCount: number
  uniqueWallets: number
  topTenWalletShare: number
}

/** Aggregates for the metrics job. Raw rows stay local; only this leaves. */
export function summarizeFeeLedger(sinceMs: number): FeeLedgerSummary {
  const db = getDb()
  const totals = db.prepare(
    `SELECT COALESCE(SUM(fee_lamports),0) AS fees, COALESCE(SUM(notional_lamports),0) AS notional, COUNT(*) AS n
     FROM fee_events WHERE created_at >= ? AND cluster = 'mainnet-beta'`
  ).get(sinceMs) as { fees: number; notional: number; n: number }
  const wallets = db.prepare(
    `SELECT wallet, SUM(notional_lamports) AS vol FROM fee_events
     WHERE created_at >= ? AND cluster = 'mainnet-beta' GROUP BY wallet ORDER BY vol DESC`
  ).all(sinceMs) as Array<{ wallet: string; vol: number }>
  const totalVol = wallets.reduce((sum, w) => sum + w.vol, 0)
  const topTenVol = wallets.slice(0, 10).reduce((sum, w) => sum + w.vol, 0)
  return {
    totalFeeLamports: totals.fees,
    totalNotionalLamports: totals.notional,
    feeEventCount: totals.n,
    uniqueWallets: wallets.length,
    topTenWalletShare: totalVol > 0 ? topTenVol / totalVol : 0,
  }
}

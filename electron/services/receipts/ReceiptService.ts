import { randomUUID } from 'node:crypto'
import { getDb } from '../../db/db'
import { getJsonSetting, setJsonSetting, getWalletInfrastructureSettings } from '../SettingsService'
import { LogService } from '../LogService'
import {
  buildReceipt,
  receiptContentHash,
  memoPayload,
  type Receipt,
  type ReceiptRecord,
} from './receiptBuilder'
import { defaultReceiptChain, type ReceiptChain, type AnchorResult } from './receiptChain'

/**
 * Attested execution receipts.
 *
 * When enabled AND on devnet, DAEMON emits ONLY the SHA-256 of a canonical
 * receipt JSON on-chain (memo-anchored) after a gated action completes, and
 * records the emission in a local ledger. Never file contents, keys, prompts,
 * or PII — only the hash + agent id go on chain.
 *
 * Off by default. Emission is fire-and-forget: any failure is swallowed and
 * logged so a receipt problem can NEVER block or reverse the underlying action.
 *
 * Mainnet emission is deliberately NOT wired here — see `isEmissionCluster`.
 * Enabling receipts on a mainnet cluster is a clearly-gated follow-up; this
 * slice scopes actual on-chain emission to devnet only.
 */

const RECEIPTS_SETTINGS_KEY = 'receipts_settings'

/** The only cluster this slice will emit on. Mainnet emission is a follow-up. */
const EMISSION_CLUSTER = 'devnet'

export type ReceiptAnchorKind = 'memo'

export interface ReceiptsSettings {
  enabled: boolean
}

const DEFAULT_SETTINGS: ReceiptsSettings = { enabled: false }

export function getReceiptsSettings(): ReceiptsSettings {
  const raw = getJsonSetting<Partial<ReceiptsSettings>>(RECEIPTS_SETTINGS_KEY, DEFAULT_SETTINGS)
  return { enabled: raw?.enabled === true }
}

export function setReceiptsSettings(next: Partial<ReceiptsSettings>): ReceiptsSettings {
  const current = getReceiptsSettings()
  const merged: ReceiptsSettings = {
    enabled: typeof next.enabled === 'boolean' ? next.enabled : current.enabled,
  }
  setJsonSetting(RECEIPTS_SETTINGS_KEY, merged)
  LogService.info('ReceiptService', 'Receipt settings updated', { enabled: merged.enabled })
  return getReceiptsSettings()
}

function liveCluster(): string {
  try {
    return getWalletInfrastructureSettings().cluster
  } catch {
    return 'unknown'
  }
}

/**
 * The complete gate: receipts are enabled AND the live cluster is the sole
 * emission cluster (devnet). Any other cluster — mainnet included — returns
 * false, so no on-chain emission ever happens off devnet in this slice.
 */
export function isEmissionCluster(cluster: string): boolean {
  return cluster === EMISSION_CLUSTER
}

/** True only when a receipt should actually be emitted for the given cluster. */
export function shouldEmit(cluster: string, chain: ReceiptChain = defaultReceiptChain): boolean {
  if (!getReceiptsSettings().enabled) return false
  if (!isEmissionCluster(cluster)) return false
  if (!chain.hasSigner()) return false
  return true
}

interface EmittedReceiptRow {
  id: string
  contentHash: string
  source: string
  actionType: string
  cluster: string
  policyVerdict: string
  executionSignature: string | null
  anchorKind: ReceiptAnchorKind
  anchorSignature: string | null
}

/** Most-recent receipts kept in the local ledger. Older rows are pruned on insert. */
export const RECEIPT_RETENTION = 1000

function writeLedger(row: EmittedReceiptRow): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO receipts
       (id, content_hash, source, action_type, cluster, policy_verdict, execution_signature, anchor_kind, anchor_signature)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.contentHash,
    row.source,
    row.actionType,
    row.cluster,
    row.policyVerdict,
    row.executionSignature,
    row.anchorKind,
    row.anchorSignature,
  )
  pruneReceipts(db)
}

/**
 * Cap ledger growth: keep only the most recent RECEIPT_RETENTION rows. The
 * ledger feeds a "receipts emitted" count + a recent list, so unbounded history
 * has no value — this bounds disk without touching the aggregate count meaning
 * beyond the retention window. Called opportunistically after every insert.
 */
export function pruneReceipts(db = getDb()): number {
  const result = db.prepare(
    `DELETE FROM receipts WHERE id NOT IN (
       SELECT id FROM receipts ORDER BY created_at DESC, id DESC LIMIT ?
     )`,
  ).run(RECEIPT_RETENTION) as { changes?: number } | undefined
  return result?.changes ?? 0
}

export interface EmitResult {
  emitted: boolean
  contentHash: string
  anchorSignature: string | null
}

/**
 * Build, hash, anchor, and ledger a receipt for a completed execution. Returns
 * `{ emitted: false }` (with the computed hash) whenever the gate is closed —
 * this is the normal path when receipts are off. THROWS only if called past the
 * gate and the chain layer fails; callers use `emitReceiptSafe` to swallow that.
 */
export async function emitReceipt(
  record: ReceiptRecord,
  chain: ReceiptChain = defaultReceiptChain,
): Promise<EmitResult> {
  const receipt: Receipt = buildReceipt(record)
  const contentHash = receiptContentHash(receipt)

  if (!shouldEmit(record.cluster, chain)) {
    return { emitted: false, contentHash, anchorSignature: null }
  }

  const anchor: AnchorResult = await chain.anchorMemo(memoPayload(contentHash), record.cluster)

  writeLedger({
    id: randomUUID(),
    contentHash,
    source: record.source,
    actionType: record.actionType,
    cluster: record.cluster,
    policyVerdict: record.verdict,
    executionSignature: record.executionTxSignature ?? null,
    anchorKind: 'memo',
    anchorSignature: anchor.signature,
  })

  LogService.info('ReceiptService', 'Receipt anchored', {
    source: record.source,
    cluster: record.cluster,
    anchorSignature: anchor.signature,
  })
  return { emitted: true, contentHash, anchorSignature: anchor.signature }
}

/**
 * Fire-and-forget wrapper for hook points. Never throws, never rejects, never
 * returns a rejected promise — a receipt failure must not touch the action that
 * produced it. Reads the live cluster itself so callers pass only the facts.
 */
export function emitReceiptSafe(
  record: Omit<ReceiptRecord, 'cluster'> & { cluster?: string },
  chain: ReceiptChain = defaultReceiptChain,
): void {
  // TOTALLY exception-proof, synchronously too: this runs inside the caller's
  // tool/mandate try block, so even the cheap settings pre-check must not throw
  // — a DB hiccup here can never be allowed to flip the underlying action to error.
  try {
    if (!getReceiptsSettings().enabled) return
    const cluster = record.cluster ?? liveCluster()
    void (async () => {
      try {
        await emitReceipt({ ...record, cluster }, chain)
      } catch (err) {
        LogService.warn('ReceiptService', 'Receipt emission failed (action unaffected)', {
          source: record.source,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })()
  } catch (err) {
    try {
      LogService.warn('ReceiptService', 'Receipt pre-check failed (action unaffected)', {
        source: record.source,
        error: err instanceof Error ? err.message : String(err),
      })
    } catch { /* logging must never throw here either */ }
  }
}

export interface ReceiptLedgerSummary {
  totalReceipts: number
  latestAt: number | null
}

export interface ReceiptLedgerEntry {
  id: string
  contentHash: string
  source: string
  actionType: string
  cluster: string
  policyVerdict: string
  anchorSignature: string | null
  createdAt: number
}

/** Aggregate count for /stats and the "receipts emitted" surface. */
export function summarizeReceipts(): ReceiptLedgerSummary {
  const db = getDb()
  const row = db.prepare(
    'SELECT COUNT(*) AS n, MAX(created_at) AS latest FROM receipts',
  ).get() as { n: number; latest: number | null }
  return { totalReceipts: row.n, latestAt: row.latest ?? null }
}

/** Recent ledger rows (hash + signature only) for a local receipts view. */
export function listReceipts(limit = 50): ReceiptLedgerEntry[] {
  const capped = Math.min(Math.max(Math.floor(limit) || 0, 1), 200)
  const rows = getDb().prepare(
    `SELECT id, content_hash, source, action_type, cluster, policy_verdict, anchor_signature, created_at
     FROM receipts ORDER BY created_at DESC LIMIT ?`,
  ).all(capped) as Array<{
    id: string
    content_hash: string
    source: string
    action_type: string
    cluster: string
    policy_verdict: string
    anchor_signature: string | null
    created_at: number
  }>
  return rows.map((r) => ({
    id: r.id,
    contentHash: r.content_hash,
    source: r.source,
    actionType: r.action_type,
    cluster: r.cluster,
    policyVerdict: r.policy_verdict,
    anchorSignature: r.anchor_signature,
    createdAt: r.created_at,
  }))
}

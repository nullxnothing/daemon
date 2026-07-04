import { createHash } from 'node:crypto'

/**
 * Pure receipt shaping + hashing. No chain, no DB, no settings — every function
 * here is deterministic and side-effect free so the canonical JSON and its
 * content hash can be unit-tested in isolation.
 *
 * PRIVACY (hard rule): a receipt attests only that an action happened and how
 * the policy gate ruled on it. It carries NO file contents, keys, prompts,
 * balances, counterparties, or PII. `summary` is a sanitized one-liner and is
 * length-capped here as a second line of defence.
 */

export const RECEIPT_SPEC = 'daemon-receipt/1'

/** Where the metered action originated. */
export type ReceiptSource = 'aria' | 'autopilot'

/** How the policy gate ruled on the action. */
export type ReceiptVerdict = 'approved' | 'rejected' | 'auto'

/** The risk tier the tool/action carried through the gate. */
export type ReceiptRiskTier = 'read' | 'write' | 'sensitive'

/** Immutable facts about a completed execution, handed to the builder. */
export interface ReceiptRecord {
  source: ReceiptSource
  /** Agent / mandate identifier (e.g. tool name, mandate id). Non-secret. */
  agentId: string
  /** Coarse action type, e.g. "swap.execute", "tool.write". Non-secret. */
  actionType: string
  /** Sanitized one-line description. Never include paths, keys, or amounts of PII. */
  summary: string
  cluster: string
  verdict: ReceiptVerdict
  riskTier: ReceiptRiskTier
  /** On-chain signature of the metered action itself, if any. */
  executionTxSignature?: string | null
  /** Operator public key (public data). */
  operator?: string | null
  /** Milliseconds since epoch; defaults to now when omitted. */
  timestamp?: number
}

/** The canonical receipt object. Only its hash is ever placed on-chain. */
export interface Receipt {
  spec: typeof RECEIPT_SPEC
  source: ReceiptSource
  agent: { id: string }
  action: { type: string; summary: string }
  cluster: string
  policy: { verdict: ReceiptVerdict; riskTier: ReceiptRiskTier }
  executionTxSignature: string | null
  operator: string | null
  timestamp: string
}

const SUMMARY_MAX = 200

function sanitizeSummary(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_MAX)
}

/** Build the canonical receipt object from a completed execution record. */
export function buildReceipt(record: ReceiptRecord): Receipt {
  const ts = typeof record.timestamp === 'number' && Number.isFinite(record.timestamp)
    ? record.timestamp
    : Date.now()
  return {
    spec: RECEIPT_SPEC,
    source: record.source,
    agent: { id: String(record.agentId ?? '') },
    action: { type: String(record.actionType ?? ''), summary: sanitizeSummary(record.summary) },
    cluster: String(record.cluster ?? ''),
    policy: { verdict: record.verdict, riskTier: record.riskTier },
    executionTxSignature: record.executionTxSignature ?? null,
    operator: record.operator ?? null,
    timestamp: new Date(ts).toISOString(),
  }
}

/**
 * Deterministic, key-sorted JSON serialization. Two receipts with identical
 * fields serialize byte-for-byte identically regardless of key insertion order,
 * so the SHA-256 below is stable and reproducible off-chain for verification.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** SHA-256 (hex) of the canonical receipt JSON. This is the only value we anchor. */
export function receiptContentHash(receipt: Receipt): string {
  return createHash('sha256').update(canonicalJson(receipt), 'utf8').digest('hex')
}

/** The exact bytes placed in the on-chain memo. Hash-only, agent id for lookup. */
export function memoPayload(contentHash: string): string {
  return `DAEMON-RECEIPT v1 sha256=${contentHash}`
}

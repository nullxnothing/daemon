import { getDb } from '../db/db'
import { getSolanaExecutionContext } from './SolanaService'
import type {
  SolanaActivityEntry,
  SolanaActivityExecutionMode,
  SolanaActivityKind,
  SolanaActivityStatus,
  SolanaActivityProvider,
} from '../shared/types'

interface SolanaActivityRow {
  id: string
  wallet_id: string | null
  kind: SolanaActivityKind
  status: SolanaActivityStatus
  provider: SolanaActivityProvider
  execution_mode: SolanaActivityExecutionMode
  transport: SolanaActivityExecutionMode | null
  signature: string | null
  title: string
  detail: string
  from_address: string
  to_address: string | null
  input_mint: string | null
  output_mint: string | null
  input_symbol: string | null
  output_symbol: string | null
  input_amount: number | null
  output_amount: number | null
  error: string | null
  metadata_json: string
  created_at: number
  updated_at: number
}

interface CreateSolanaActivityInput {
  id?: string
  walletId?: string | null
  kind: SolanaActivityKind
  status?: SolanaActivityStatus
  title: string
  detail: string
  fromAddress: string
  toAddress?: string | null
  inputMint?: string | null
  outputMint?: string | null
  inputSymbol?: string | null
  outputSymbol?: string | null
  inputAmount?: number | null
  outputAmount?: number | null
  metadata?: Record<string, unknown>
}

function mapRow(row: SolanaActivityRow): SolanaActivityEntry {
  return {
    id: row.id,
    walletId: row.wallet_id,
    kind: row.kind,
    status: row.status,
    provider: row.provider,
    executionMode: row.execution_mode,
    transport: row.transport,
    signature: row.signature,
    title: row.title,
    detail: row.detail,
    fromAddress: row.from_address,
    toAddress: row.to_address,
    inputMint: row.input_mint,
    outputMint: row.output_mint,
    inputSymbol: row.input_symbol,
    outputSymbol: row.output_symbol,
    inputAmount: row.input_amount,
    outputAmount: row.output_amount,
    error: row.error,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createSolanaActivity(input: CreateSolanaActivityInput): string {
  const db = getDb()
  const now = Date.now()
  const id = input.id ?? crypto.randomUUID()
  const execution = getSolanaExecutionContext()

  db.prepare(`
    INSERT INTO solana_activity (
      id, wallet_id, kind, status, provider, execution_mode, transport, signature,
      title, detail, from_address, to_address, input_mint, output_mint, input_symbol, output_symbol,
      input_amount, output_amount, error, metadata_json, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      wallet_id = excluded.wallet_id,
      kind = excluded.kind,
      status = excluded.status,
      provider = excluded.provider,
      execution_mode = excluded.execution_mode,
      title = excluded.title,
      detail = excluded.detail,
      from_address = excluded.from_address,
      to_address = excluded.to_address,
      input_mint = excluded.input_mint,
      output_mint = excluded.output_mint,
      input_symbol = excluded.input_symbol,
      output_symbol = excluded.output_symbol,
      input_amount = excluded.input_amount,
      output_amount = excluded.output_amount,
      error = excluded.error,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    input.walletId ?? null,
    input.kind,
    input.status ?? 'pending',
    execution.provider,
    execution.executionMode,
    null,
    null,
    input.title,
    input.detail,
    input.fromAddress,
    input.toAddress ?? null,
    input.inputMint ?? null,
    input.outputMint ?? null,
    input.inputSymbol ?? null,
    input.outputSymbol ?? null,
    input.inputAmount ?? null,
    input.outputAmount ?? null,
    null,
    JSON.stringify(input.metadata ?? {}),
    now,
    now,
  )

  return id
}

export function appendSolanaActivity(input: CreateSolanaActivityInput): string {
  return createSolanaActivity(input)
}

export function markSolanaActivityConfirmed(
  id: string,
  input: {
    signature: string
    transport: SolanaActivityExecutionMode
    detail?: string
    outputAmount?: number | null
    metadata?: Record<string, unknown>
  },
): void {
  const db = getDb()
  const existing = db.prepare('SELECT metadata_json FROM solana_activity WHERE id = ?').get(id) as { metadata_json: string } | undefined
  const mergedMetadata = mergeMetadata(existing?.metadata_json ?? '{}', input.metadata)
  db.prepare(`
    UPDATE solana_activity
    SET status = ?, signature = ?, transport = ?, detail = COALESCE(?, detail), output_amount = COALESCE(?, output_amount), error = NULL, metadata_json = ?, updated_at = ?
    WHERE id = ?
  `).run('confirmed', input.signature, input.transport, input.detail ?? null, input.outputAmount ?? null, mergedMetadata, Date.now(), id)
}

export function markSolanaActivityFailed(
  id: string,
  error: string,
  input?: {
    detail?: string
    metadata?: Record<string, unknown>
  },
): void {
  const db = getDb()
  const existing = db.prepare('SELECT metadata_json FROM solana_activity WHERE id = ?').get(id) as { metadata_json: string } | undefined
  const mergedMetadata = mergeMetadata(existing?.metadata_json ?? '{}', input?.metadata)
  db.prepare(`
    UPDATE solana_activity
    SET status = ?, detail = COALESCE(?, detail), error = ?, metadata_json = ?, updated_at = ?
    WHERE id = ?
  `).run('failed', input?.detail ?? null, error, mergedMetadata, Date.now(), id)
}

export function listSolanaActivity(limit = 50, walletId?: string | null): SolanaActivityEntry[] {
  const safeLimit = Math.min(Math.max(limit ?? 50, 1), 200)
  const db = getDb()
  const rows = walletId
    ? db.prepare(`
      SELECT id, wallet_id, kind, status, provider, execution_mode, transport, signature,
             title, detail, from_address, to_address, input_mint, output_mint, input_symbol, output_symbol,
             input_amount, output_amount, error, metadata_json, created_at, updated_at
      FROM solana_activity
      WHERE wallet_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(walletId, safeLimit) as SolanaActivityRow[]
    : db.prepare(`
      SELECT id, wallet_id, kind, status, provider, execution_mode, transport, signature,
             title, detail, from_address, to_address, input_mint, output_mint, input_symbol, output_symbol,
             input_amount, output_amount, error, metadata_json, created_at, updated_at
      FROM solana_activity
      ORDER BY created_at DESC
      LIMIT ?
    `).all(safeLimit) as SolanaActivityRow[]

  return rows.map(mapRow)
}

export function clearSolanaActivity(): void {
  const db = getDb()
  db.prepare('DELETE FROM solana_activity').run()
}

function mergeMetadata(raw: string, next?: Record<string, unknown>): string {
  if (!next || Object.keys(next).length === 0) return raw
  try {
    const current = JSON.parse(raw) as Record<string, unknown>
    return JSON.stringify({ ...current, ...next })
  } catch {
    return JSON.stringify(next)
  }
}

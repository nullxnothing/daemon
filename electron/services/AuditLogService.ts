import { randomUUID } from 'node:crypto'

import { getDb } from '../db/db'

export interface AuditLogEntry {
  id: string
  action: string
  userId: string | null
  walletId: string | null
  details: Record<string, unknown>
  result: 'success' | 'failed' | 'warning'
  error?: string | null
  timestamp: number
}

export function recordAuditLog(
  action: string,
  details: Record<string, unknown> = {},
  result: 'success' | 'failed' | 'warning' = 'success',
  error: string | null = null,
  userId: string | null = null,
  walletId: string | null = null,
): void {
  try {
    const db = getDb()

    // Ensure table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        user_id TEXT,
        wallet_id TEXT,
        details TEXT NOT NULL,
        result TEXT NOT NULL,
        error TEXT,
        timestamp INTEGER NOT NULL,
        created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
      );

      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_wallet ON audit_logs(wallet_id);
    `)

    const id = `audit_${randomUUID()}`
    const timestamp = Date.now()

    db.prepare(`
      INSERT INTO audit_logs (
        id, action, user_id, wallet_id, details, result, error, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      action,
      userId,
      walletId,
      JSON.stringify(details),
      result,
      error,
      timestamp,
    )
  } catch (err) {
    console.error('[audit] Failed to record audit log:', err)
  }
}

export function getAuditLogs(
  action?: string,
  walletId?: string,
  limit: number = 100,
): AuditLogEntry[] {
  try {
    const db = getDb()
    let query = 'SELECT * FROM audit_logs WHERE 1=1'
    const params: unknown[] = []

    if (action) {
      query += ' AND action = ?'
      params.push(action)
    }
    if (walletId) {
      query += ' AND wallet_id = ?'
      params.push(walletId)
    }

    query += ' ORDER BY timestamp DESC LIMIT ?'
    params.push(limit)

    const rows = db.prepare(query).all(...params) as Array<{
      id: string
      action: string
      user_id: string | null
      wallet_id: string | null
      details: string
      result: string
      error: string | null
      timestamp: number
    }>

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      userId: row.user_id,
      walletId: row.wallet_id,
      details: JSON.parse(row.details),
      result: row.result as 'success' | 'failed' | 'warning',
      error: row.error,
      timestamp: row.timestamp,
    }))
  } catch (err) {
    console.error('[audit] Failed to get audit logs:', err)
    return []
  }
}

export function cleanupOldAuditLogs(olderThanDays: number = 90): void {
  try {
    const db = getDb()
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    db.prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoff)
  } catch (err) {
    console.error('[audit] Failed to cleanup old audit logs:', err)
  }
}

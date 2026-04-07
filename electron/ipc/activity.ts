import { ipcMain } from 'electron'
import { getDb } from '../db/db'
import { ipcHandler } from '../services/IpcHandlerFactory'

interface ActivityEntryInput {
  id: string
  kind: 'info' | 'success' | 'warning' | 'error'
  message: string
  context: string | null
  createdAt: number
}

interface ActivityRow {
  id: string
  kind: 'info' | 'success' | 'warning' | 'error'
  message: string
  context: string | null
  created_at: number
}

const VALID_KINDS = new Set(['info', 'success', 'warning', 'error'])
const MAX_MESSAGE_LEN = 2000
const MAX_CONTEXT_LEN = 200
const MAX_ROWS = 1000

export function registerActivityHandlers() {
  ipcMain.handle('activity:append', ipcHandler(async (_event, entry: ActivityEntryInput) => {
    if (!entry?.id || !entry.message || !VALID_KINDS.has(entry.kind)) {
      throw new Error('Invalid activity entry')
    }
    const db = getDb()
    db.prepare(
      'INSERT OR IGNORE INTO activity_log (id, kind, message, context, created_at) VALUES (?,?,?,?,?)'
    ).run(
      entry.id,
      entry.kind,
      entry.message.slice(0, MAX_MESSAGE_LEN),
      entry.context ? entry.context.slice(0, MAX_CONTEXT_LEN) : null,
      entry.createdAt,
    )

    // Trim oldest entries beyond MAX_ROWS to prevent unbounded growth
    db.prepare(
      `DELETE FROM activity_log WHERE id IN (
         SELECT id FROM activity_log ORDER BY created_at DESC LIMIT -1 OFFSET ?
       )`
    ).run(MAX_ROWS)
  }))

  ipcMain.handle('activity:list', ipcHandler(async (_event, limit?: number) => {
    const db = getDb()
    const safeLimit = Math.min(Math.max(1, limit ?? 500), MAX_ROWS)
    const rows = db.prepare(
      'SELECT id, kind, message, context, created_at FROM activity_log ORDER BY created_at DESC LIMIT ?'
    ).all(safeLimit) as ActivityRow[]
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      message: r.message,
      context: r.context,
      createdAt: r.created_at,
    }))
  }))

  ipcMain.handle('activity:clear', ipcHandler(async () => {
    const db = getDb()
    db.prepare('DELETE FROM activity_log').run()
  }))
}

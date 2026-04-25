import { ipcMain } from 'electron'
import { getDb } from '../db/db'
import { ipcHandler } from '../services/IpcHandlerFactory'

interface ActivityEntryInput {
  id: string
  kind: 'info' | 'success' | 'warning' | 'error'
  message: string
  context: string | null
  createdAt: number
  sessionId?: string | null
  sessionStatus?: 'created' | 'running' | 'blocked' | 'failed' | 'complete' | null
  projectId?: string | null
  projectName?: string | null
}

interface ActivityRow {
  id: string
  kind: 'info' | 'success' | 'warning' | 'error'
  message: string
  context: string | null
  created_at: number
  session_id: string | null
  session_status: 'created' | 'running' | 'blocked' | 'failed' | 'complete' | null
  project_id: string | null
  project_name: string | null
}

const VALID_KINDS = new Set(['info', 'success', 'warning', 'error'])
const VALID_SESSION_STATUSES = new Set(['created', 'running', 'blocked', 'failed', 'complete'])
const MAX_MESSAGE_LEN = 2000
const MAX_CONTEXT_LEN = 200
const MAX_METADATA_LEN = 200
const MAX_ROWS = 1000

export function registerActivityHandlers() {
  ipcMain.handle('activity:append', ipcHandler(async (_event, entry: ActivityEntryInput) => {
    if (!entry?.id || !entry.message || !VALID_KINDS.has(entry.kind)) {
      throw new Error('Invalid activity entry')
    }
    const sessionStatus = entry.sessionStatus && VALID_SESSION_STATUSES.has(entry.sessionStatus)
      ? entry.sessionStatus
      : null
    const db = getDb()
    db.prepare(
      `INSERT OR IGNORE INTO activity_log (
        id, kind, message, context, created_at, session_id, session_status, project_id, project_name
      ) VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(
      entry.id,
      entry.kind,
      entry.message.slice(0, MAX_MESSAGE_LEN),
      entry.context ? entry.context.slice(0, MAX_CONTEXT_LEN) : null,
      entry.createdAt,
      entry.sessionId ? entry.sessionId.slice(0, MAX_METADATA_LEN) : null,
      sessionStatus,
      entry.projectId ? entry.projectId.slice(0, MAX_METADATA_LEN) : null,
      entry.projectName ? entry.projectName.slice(0, MAX_METADATA_LEN) : null,
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
      `SELECT id, kind, message, context, created_at, session_id, session_status, project_id, project_name
       FROM activity_log ORDER BY created_at DESC LIMIT ?`
    ).all(safeLimit) as ActivityRow[]
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      message: r.message,
      context: r.context,
      createdAt: r.created_at,
      sessionId: r.session_id,
      sessionStatus: r.session_status,
      projectId: r.project_id,
      projectName: r.project_name,
    }))
  }))

  ipcMain.handle('activity:clear', ipcHandler(async () => {
    const db = getDb()
    db.prepare('DELETE FROM activity_log').run()
  }))
}

import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { runMigrations } from './migrations'

let _db: Database.Database | null = null
let _walCheckpointTimer: ReturnType<typeof setInterval> | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = path.join(app.getPath('userData'), 'daemon.db')
  _db = new Database(dbPath)

  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  _db.pragma('busy_timeout = 5000')
  _db.pragma('synchronous = NORMAL')

  // Integrity check before migrations — detect corruption early
  const integrity = _db.pragma('integrity_check') as Array<{ integrity_check: string }>
  if (integrity[0]?.integrity_check !== 'ok') {
    const backupPath = dbPath + '.corrupted.' + Date.now()
    fs.copyFileSync(dbPath, backupPath)
    _db.close()
    _db = null
    fs.unlinkSync(dbPath)
    throw new Error(`Database corruption detected. Backup saved to ${backupPath}. Restarting with fresh database.`)
  }

  runMigrations(_db)

  // Periodic passive WAL checkpoint every 5 minutes to prevent unbounded WAL growth
  _walCheckpointTimer = setInterval(() => {
    try {
      _db?.pragma('wal_checkpoint(PASSIVE)')
    } catch { /* best-effort */ }
  }, 5 * 60 * 1000)

  return _db
}

export function closeDb() {
  if (_walCheckpointTimer) {
    clearInterval(_walCheckpointTimer)
    _walCheckpointTimer = null
  }
  if (_db) {
    try {
      _db.pragma('wal_checkpoint(TRUNCATE)')
    } catch { /* checkpoint is best-effort */ }
    _db.close()
    _db = null
  }
}

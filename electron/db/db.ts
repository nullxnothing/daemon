import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import { runMigrations } from './migrations'

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = path.join(app.getPath('userData'), 'daemon.db')
  _db = new Database(dbPath)

  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  _db.pragma('busy_timeout = 5000')

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

  return _db
}

export function closeDb() {
  if (_db) {
    try {
      _db.pragma('wal_checkpoint(TRUNCATE)')
    } catch { /* checkpoint is best-effort */ }
    _db.close()
    _db = null
  }
}

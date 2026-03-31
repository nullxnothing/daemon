import Database from 'better-sqlite3'
import path from 'node:path'
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

  runMigrations(_db)

  return _db
}

export function closeDb() {
  if (_db) {
    _db.close()
    _db = null
  }
}

import { safeStorage } from 'electron'
import { getDb } from '../db/db'

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function storeKey(keyName: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available — cannot store keys securely')
  }

  const db = getDb()
  const encrypted = safeStorage.encryptString(value)
  const hint = value.length > 4 ? '...' + value.slice(-4) : '****'

  db.prepare(
    'INSERT OR REPLACE INTO secure_keys (key_name, encrypted_value, hint, updated_at) VALUES (?,?,?,?)'
  ).run(keyName, encrypted, hint, Date.now())
}

export function getKey(keyName: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null

  const db = getDb()
  const row = db.prepare('SELECT encrypted_value FROM secure_keys WHERE key_name = ?').get(keyName) as
    { encrypted_value: Buffer } | undefined

  if (!row) return null
  return safeStorage.decryptString(Buffer.from(row.encrypted_value))
}

export function deleteKey(keyName: string): void {
  const db = getDb()
  db.prepare('DELETE FROM secure_keys WHERE key_name = ?').run(keyName)
}

export function listKeys(): Array<{ key_name: string; hint: string }> {
  const db = getDb()
  return db.prepare('SELECT key_name, hint FROM secure_keys ORDER BY key_name').all() as
    Array<{ key_name: string; hint: string }>
}

import { safeStorage } from 'electron'
import crypto from 'node:crypto'
import { getDb } from '../db/db'

// --- Types ---

export interface VaultFileRow {
  id: string
  name: string
  encrypted_data: Buffer
  file_type: string
  size_bytes: number
  owner_wallet: string | null
  created_at: number
}

export interface VaultFileMeta {
  id: string
  name: string
  file_type: string
  size_bytes: number
  owner_wallet: string | null
  created_at: number
}

// --- Core Operations ---

/**
 * Store a file in the vault. Data is encrypted via OS keychain (safeStorage).
 * If owner_wallet is provided, an additional wallet-signature check is needed to retrieve.
 */
export function storeFile(opts: {
  name: string
  data: string
  fileType: string
  ownerWallet?: string | null
}): VaultFileMeta {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available — cannot store files securely')
  }

  const id = crypto.randomUUID()
  const encrypted = safeStorage.encryptString(opts.data)
  const sizeBytes = Buffer.byteLength(opts.data, 'utf8')

  const db = getDb()
  db.prepare(
    'INSERT INTO vault_files (id, name, encrypted_data, file_type, size_bytes, owner_wallet, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(id, opts.name, encrypted, opts.fileType, sizeBytes, opts.ownerWallet ?? null, Date.now())

  return {
    id,
    name: opts.name,
    file_type: opts.fileType,
    size_bytes: sizeBytes,
    owner_wallet: opts.ownerWallet ?? null,
    created_at: Date.now(),
  }
}

/**
 * Retrieve and decrypt a vault file by ID.
 * Caller must verify wallet ownership before calling this for wallet-gated files.
 */
export function retrieveFile(id: string): { name: string; data: string; file_type: string } {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available — cannot decrypt vault files')
  }

  const db = getDb()
  const row = db.prepare('SELECT name, encrypted_data, file_type FROM vault_files WHERE id = ?').get(id) as
    Pick<VaultFileRow, 'name' | 'encrypted_data' | 'file_type'> | undefined

  if (!row) throw new Error('Vault file not found')

  const decrypted = safeStorage.decryptString(Buffer.from(row.encrypted_data))
  return { name: row.name, data: decrypted, file_type: row.file_type }
}

/**
 * List all vault files (metadata only — no decrypted data).
 */
export function listFiles(): VaultFileMeta[] {
  const db = getDb()
  return db.prepare(
    'SELECT id, name, file_type, size_bytes, owner_wallet, created_at FROM vault_files ORDER BY created_at DESC'
  ).all() as VaultFileMeta[]
}

/**
 * Delete a vault file by ID.
 */
export function deleteFile(id: string): void {
  const db = getDb()
  const result = db.prepare('DELETE FROM vault_files WHERE id = ?').run(id)
  if (result.changes === 0) throw new Error('Vault file not found')
}

/**
 * Get metadata for a single vault file.
 */
export function getFileMeta(id: string): VaultFileMeta | null {
  const db = getDb()
  const row = db.prepare(
    'SELECT id, name, file_type, size_bytes, owner_wallet, created_at FROM vault_files WHERE id = ?'
  ).get(id) as VaultFileMeta | undefined
  return row ?? null
}

/**
 * Update the wallet owner of a vault file (set or remove wallet gating).
 */
export function setFileOwner(id: string, ownerWallet: string | null): void {
  const db = getDb()
  const result = db.prepare('UPDATE vault_files SET owner_wallet = ? WHERE id = ?').run(ownerWallet, id)
  if (result.changes === 0) throw new Error('Vault file not found')
}

/**
 * Re-encrypt a vault file with updated content.
 */
export function updateFileContent(id: string, data: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available')
  }

  const db = getDb()
  const encrypted = safeStorage.encryptString(data)
  const sizeBytes = Buffer.byteLength(data, 'utf8')
  const result = db.prepare('UPDATE vault_files SET encrypted_data = ?, size_bytes = ? WHERE id = ?').run(encrypted, sizeBytes, id)
  if (result.changes === 0) throw new Error('Vault file not found')
}

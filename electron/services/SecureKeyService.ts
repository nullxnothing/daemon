import { safeStorage } from 'electron'
import { getDb } from '../db/db'

/**
 * Backends that mean the OS keyring is unavailable and safeStorage has silently
 * fallen back to a hardcoded-password cipher (Linux) or an unknown state.
 * In these modes the at-rest blob is effectively plaintext, so we refuse to
 * hold private keys. See Electron docs: getSelectedStorageBackend() === 'basic_text'.
 */
const DEGRADED_STORAGE_BACKENDS = new Set(['basic_text', 'unknown'])

/**
 * Key-name prefixes/names for on-chain private keys — the high-value secrets we
 * never store or decrypt under a degraded backend. These mirror the names used
 * by WalletService, PumpFunService, AgentStationService, and ProofPoolService.
 */
const PRIVATE_KEY_NAME_PREFIXES = [
  'WALLET_KEYPAIR_',
  'AGENT_STATION_KEY_',
  'PROOF_POOL_KEY_',
  'PROOF_CREATOR_KEY_',
  'PROOF_VANITY_MINT_',
]
const PRIVATE_KEY_NAMES = new Set(['PROOF_POOL_PLATFORM_ESCROW'])

function isPrivateKeyName(keyName: string): boolean {
  return PRIVATE_KEY_NAMES.has(keyName) || PRIVATE_KEY_NAME_PREFIXES.some((prefix) => keyName.startsWith(prefix))
}

/**
 * safeStorage.getSelectedStorageBackend() only exists on Linux. On macOS
 * (Keychain) and Windows (DPAPI) the call is absent, and isEncryptionAvailable()
 * is the authoritative signal. Returns null when the API is unavailable.
 */
function getSelectedStorageBackend(): string | null {
  const fn = (safeStorage as { getSelectedStorageBackend?: () => string }).getSelectedStorageBackend
  if (typeof fn !== 'function') return null
  try {
    return fn.call(safeStorage)
  } catch {
    return 'unknown'
  }
}

/**
 * True when the OS keyring is available AND, where the platform reports a
 * backend, that backend is not a plaintext-equivalent fallback.
 */
export function isKeyEncryptionTrustworthy(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  const backend = getSelectedStorageBackend()
  if (backend === null) return true // macOS/Windows: no backend selector, trust isEncryptionAvailable
  return !DEGRADED_STORAGE_BACKENDS.has(backend)
}

export function getStorageBackend(): string | null {
  return getSelectedStorageBackend()
}

/**
 * Startup health check. Returns a blocking warning string when private-key
 * storage must be disabled, or null when the keyring is healthy. Callers should
 * surface a non-dismissible warning and avoid signing flows when this is set.
 */
export function getKeyEncryptionWarning(): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return 'Your OS keyring is unavailable. DAEMON cannot encrypt wallet keys and will not hold private keys until a secure keyring is configured.'
  }
  const backend = getSelectedStorageBackend()
  if (backend !== null && DEGRADED_STORAGE_BACKENDS.has(backend)) {
    return `Your OS keyring fell back to degraded encryption (${backend}). Stored secrets would be effectively plaintext, so DAEMON will not hold private keys. Configure a system secret service (gnome-keyring / KWallet) and restart.`
  }
  return null
}

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

export function storeKey(keyName: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available — cannot store keys securely')
  }
  // High-value private keys are never written under a degraded (plaintext-equivalent) backend.
  if (isPrivateKeyName(keyName) && !isKeyEncryptionTrustworthy()) {
    throw new Error(getKeyEncryptionWarning() ?? 'OS keyring is in a degraded encryption mode — refusing to store private key')
  }

  const db = getDb()
  const encrypted = safeStorage.encryptString(value)
  const hint = value.length > 4 ? '...' + value.slice(-4) : '****'

  db.prepare(
    'INSERT OR REPLACE INTO secure_keys (key_name, encrypted_value, hint, updated_at) VALUES (?,?,?,?)'
  ).run(keyName, encrypted, hint, Date.now())
}

export function getKey(keyName: string): string | null {
  // Private keys must fail loud, never silently return null and let a caller
  // proceed as if there were simply no wallet. A degraded backend here means
  // the decrypted bytes cannot be trusted as confidentially stored.
  if (isPrivateKeyName(keyName)) {
    if (!isKeyEncryptionTrustworthy()) {
      throw new Error(getKeyEncryptionWarning() ?? 'OS keyring is unavailable or degraded — refusing to decrypt private key')
    }
  } else if (!safeStorage.isEncryptionAvailable()) {
    return null
  }

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

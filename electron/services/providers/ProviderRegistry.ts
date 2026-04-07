import { getDb } from '../../db/db'
import type { ProviderId, ProviderInterface, ProviderConnection, AgentRow } from './ProviderInterface'

const providers = new Map<ProviderId, ProviderInterface>()

// Re-verify cached connections older than this when resolving for spawn
const AUTH_CACHE_MAX_AGE_MS = 5 * 60 * 1000
const lastVerifiedAt = new Map<ProviderId, number>()

export type ProviderErrorCode =
  | 'NO_PROVIDER_AUTH'        // neither provider authenticated
  | 'NOT_AUTHENTICATED'       // explicitly chosen provider not auth'd
  | 'CLI_NOT_INSTALLED'       // CLI binary missing
  | 'PROVIDER_UNKNOWN'        // unknown provider id

export class ProviderError extends Error {
  code: ProviderErrorCode
  providerId: ProviderId | null

  constructor(code: ProviderErrorCode, message: string, providerId: ProviderId | null = null) {
    super(`${code}: ${message}`)
    this.name = 'ProviderError'
    this.code = code
    this.providerId = providerId
  }
}

export function register(provider: ProviderInterface): void {
  providers.set(provider.id, provider)
}

export function get(id: ProviderId): ProviderInterface {
  const provider = providers.get(id)
  if (!provider) throw new ProviderError('PROVIDER_UNKNOWN', `Provider '${id}' not registered`, null)
  return provider
}

export function getDefaultId(): ProviderId {
  try {
    const db = getDb()
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('default_provider') as { value: string } | undefined
    if (row?.value && providers.has(row.value as ProviderId)) {
      return row.value as ProviderId
    }
  } catch { /* fall through */ }
  return 'claude'
}

export function getDefault(): ProviderInterface {
  return get(getDefaultId())
}

export function setDefault(id: ProviderId): void {
  if (!providers.has(id)) throw new ProviderError('PROVIDER_UNKNOWN', `Provider '${id}' not registered`, null)
  const db = getDb()
  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run('default_provider', id, Date.now())
}

async function getLiveConnection(provider: ProviderInterface): Promise<ProviderConnection | null> {
  const cached = provider.getConnection()
  const lastAt = lastVerifiedAt.get(provider.id) ?? 0
  const fresh = Date.now() - lastAt < AUTH_CACHE_MAX_AGE_MS
  if (cached && fresh) return cached
  try {
    const conn = await provider.verifyConnection()
    lastVerifiedAt.set(provider.id, Date.now())
    return conn
  } catch {
    return cached
  }
}

function isAuthed(conn: ProviderConnection | null): boolean {
  return !!conn && (conn.isAuthenticated || conn.authMode !== 'none')
}

/**
 * Resolve which provider should spawn this agent. Re-verifies stale auth.
 * Throws ProviderError with a code the renderer can render distinctly.
 */
export async function resolveForAgent(agent: AgentRow): Promise<ProviderInterface> {
  const explicit = (agent.provider as ProviderId | 'auto' | null | undefined) ?? 'auto'

  // Live-verify all known providers (cheap when fresh)
  const conns = new Map<ProviderId, ProviderConnection | null>()
  for (const [id, p] of providers) {
    conns.set(id, await getLiveConnection(p))
  }

  const authedIds: ProviderId[] = []
  for (const [id, conn] of conns) {
    if (isAuthed(conn)) authedIds.push(id)
  }

  if (authedIds.length === 0) {
    throw new ProviderError(
      'NO_PROVIDER_AUTH',
      'Sign in to Claude or Codex to launch agents.',
      null,
    )
  }

  // Explicit choice — must be authed, no silent fallback
  if (explicit === 'claude' || explicit === 'codex') {
    if (!providers.has(explicit)) {
      throw new ProviderError('PROVIDER_UNKNOWN', `Provider '${explicit}' not registered`, null)
    }
    if (!authedIds.includes(explicit)) {
      throw new ProviderError(
        'NOT_AUTHENTICATED',
        `This agent is set to ${explicit}, but you are not signed in to ${explicit}.`,
        explicit,
      )
    }
    return providers.get(explicit)!
  }

  // 'auto' — single provider authed: use it
  if (authedIds.length === 1) return providers.get(authedIds[0])!

  // 'auto' + multiple authed: prefer global default
  const def = getDefaultId()
  if (authedIds.includes(def)) return providers.get(def)!

  // Default not authed (shouldn't happen given check above) — first authed wins
  return providers.get(authedIds[0])!
}

/**
 * Synchronous fallback used in code paths that can't await (legacy callers).
 * Does NOT re-verify; uses cached connections only.
 */
export function resolveForAgentSync(agent: AgentRow): ProviderInterface {
  const explicit = (agent.provider as ProviderId | 'auto' | null | undefined) ?? 'auto'
  if (explicit && explicit !== 'auto' && providers.has(explicit)) {
    return providers.get(explicit)!
  }
  return getDefault()
}

export async function verifyAll(): Promise<Record<ProviderId, ProviderConnection | null>> {
  const results: Record<string, ProviderConnection | null> = {}
  for (const [id, provider] of providers) {
    try {
      results[id] = await provider.verifyConnection()
      lastVerifiedAt.set(id, Date.now())
    } catch {
      results[id] = null
    }
  }
  return results as Record<ProviderId, ProviderConnection | null>
}

export function getAll(): ProviderInterface[] {
  return Array.from(providers.values())
}

export function getAllConnections(): Record<ProviderId, ProviderConnection | null> {
  const results: Record<string, ProviderConnection | null> = {}
  for (const [id, provider] of providers) {
    results[id] = provider.getConnection()
  }
  return results as Record<ProviderId, ProviderConnection | null>
}

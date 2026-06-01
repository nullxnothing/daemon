import { getDb } from '../../db/db'
import type { ProviderId, ProviderInterface, ProviderConnection, AgentRow } from './ProviderInterface'

const providers = new Map<ProviderId, ProviderInterface>()

export type ProviderFeatureId = 'aria' | 'daemonAi' | 'agents' | 'terminal'
export type DaemonAiAccessPreference = 'auto' | 'hosted' | 'byok'
export type DaemonAiModelPreference = 'auto' | 'fast' | 'standard' | 'reasoning' | 'premium'

export interface ProviderPreferences {
  aria: {
    provider: ProviderId
    model: 'fast' | 'standard' | 'reasoning'
  }
  daemonAi: {
    accessMode: DaemonAiAccessPreference
    byokProvider: ProviderId
    modelLane: DaemonAiModelPreference
  }
  agents: {
    defaultProvider: ProviderId
  }
  terminal: {
    defaultProvider: ProviderId
  }
}

const PROVIDER_PREFS_KEY = 'provider_preferences'
const PROVIDER_FEATURE_IDS = new Set<ProviderFeatureId>(['aria', 'daemonAi', 'agents', 'terminal'])

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

function normalizeProviderId(input: unknown, fallback: ProviderId): ProviderId {
  return input === 'claude' || input === 'codex' ? input : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isProviderFeatureId(value: unknown): value is ProviderFeatureId {
  return typeof value === 'string' && PROVIDER_FEATURE_IDS.has(value as ProviderFeatureId)
}

function normalizeAriaModel(input: unknown): ProviderPreferences['aria']['model'] {
  return input === 'standard' || input === 'reasoning' ? input : 'fast'
}

function normalizeDaemonAiAccess(input: unknown): DaemonAiAccessPreference {
  return input === 'hosted' || input === 'byok' ? input : 'auto'
}

function normalizeDaemonAiLane(input: unknown): DaemonAiModelPreference {
  return input === 'fast' || input === 'standard' || input === 'reasoning' || input === 'premium' ? input : 'auto'
}

export function getPreferences(): ProviderPreferences {
  const fallback = getDefaultId()
  const defaults: ProviderPreferences = {
    aria: {
      provider: providers.has('codex') ? 'codex' : fallback,
      model: 'fast',
    },
    daemonAi: {
      accessMode: 'auto',
      byokProvider: providers.has('codex') ? 'codex' : fallback,
      modelLane: 'auto',
    },
    agents: {
      defaultProvider: fallback,
    },
    terminal: {
      defaultProvider: fallback,
    },
  }

  try {
    const db = getDb()
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(PROVIDER_PREFS_KEY) as { value: string } | undefined
    if (!row?.value) return defaults
    const parsed = JSON.parse(row.value) as unknown
    const raw = isRecord(parsed) ? parsed as Partial<ProviderPreferences> : {}
    return {
      aria: {
        provider: normalizeProviderId(raw.aria?.provider, defaults.aria.provider),
        model: normalizeAriaModel(raw.aria?.model),
      },
      daemonAi: {
        accessMode: normalizeDaemonAiAccess(raw.daemonAi?.accessMode),
        byokProvider: normalizeProviderId(raw.daemonAi?.byokProvider, defaults.daemonAi.byokProvider),
        modelLane: normalizeDaemonAiLane(raw.daemonAi?.modelLane),
      },
      agents: {
        defaultProvider: normalizeProviderId(raw.agents?.defaultProvider, defaults.agents.defaultProvider),
      },
      terminal: {
        defaultProvider: normalizeProviderId(raw.terminal?.defaultProvider, defaults.terminal.defaultProvider),
      },
    }
  } catch {
    return defaults
  }
}

export function setPreferences(input: unknown): ProviderPreferences {
  const raw = isRecord(input) ? input as Partial<ProviderPreferences> : {}
  const current = getPreferences()
  const next: ProviderPreferences = {
    aria: {
      provider: normalizeProviderId(raw.aria?.provider, current.aria.provider),
      model: normalizeAriaModel(raw.aria?.model ?? current.aria.model),
    },
    daemonAi: {
      accessMode: normalizeDaemonAiAccess(raw.daemonAi?.accessMode ?? current.daemonAi.accessMode),
      byokProvider: normalizeProviderId(raw.daemonAi?.byokProvider, current.daemonAi.byokProvider),
      modelLane: normalizeDaemonAiLane(raw.daemonAi?.modelLane ?? current.daemonAi.modelLane),
    },
    agents: {
      defaultProvider: normalizeProviderId(raw.agents?.defaultProvider, current.agents.defaultProvider),
    },
    terminal: {
      defaultProvider: normalizeProviderId(raw.terminal?.defaultProvider, current.terminal.defaultProvider),
    },
  }

  const db = getDb()
  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(PROVIDER_PREFS_KEY, JSON.stringify(next), Date.now())
  return next
}

export function getFeatureProviderId(feature: ProviderFeatureId): ProviderId {
  const prefs = getPreferences()
  if (feature === 'aria') return prefs.aria.provider
  if (feature === 'daemonAi') return prefs.daemonAi.byokProvider
  if (feature === 'agents') return prefs.agents.defaultProvider
  return prefs.terminal.defaultProvider
}

export function getFeatureProvider(feature: ProviderFeatureId): ProviderInterface {
  return get(getFeatureProviderId(feature))
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

  // 'auto' + multiple authed: prefer configured agent default
  const def = getFeatureProviderId('agents')
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
  return getFeatureProvider('agents')
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

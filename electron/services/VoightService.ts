import crypto from 'node:crypto'
import { getDb } from '../db/db'
import * as SecureKey from './SecureKeyService'
import { redactValue, sanitizeErrorMessage } from '../security/PrivacyGuard'

export type VoightPrivacyLevel = 'minimal' | 'standard' | 'full'
export type VoightEventType = 'reasoning' | 'tool' | 'tx' | 'decision' | 'action' | 'error'
export type VoightOutcome = 'pending' | 'success' | 'failed'
export type VoightKeySource = 'secure' | 'env' | 'none'

export interface VoightEventInput {
  agentId: string
  type: VoightEventType
  timestamp?: string
  input?: unknown
  reasoning?: unknown
  toolExecuted?: string
  toolsConsidered?: string[]
  transaction?: string
  amountToken?: string
  amountValue?: number | string
  outcome?: VoightOutcome
  durationMs?: number
  errorMessage?: string
  model?: string
  metadata?: Record<string, unknown>
}

export interface VoightStatus {
  configured: boolean
  keySource: VoightKeySource
  privacyLevel: VoightPrivacyLevel
  endpoint: string
  pending: number
  failed: number
  sent: number
  lastSentAt: number | null
  lastError: string | null
}

export interface VoightTestResult {
  accepted: boolean
  status: number
  eventId: string
  response: unknown
}

interface QueueRow {
  id: string
  payload_json: string
  attempts: number
}

const VOIGHT_KEY_NAME = 'VOIGHT_KEY'
const DEFAULT_ENDPOINT = 'https://api.voight.xyz/v1/events'
const DEFAULT_PRIVACY_LEVEL: VoightPrivacyLevel = 'standard'
const MAX_QUEUE_ROWS = 2500
const MAX_EVENT_JSON_BYTES = 48_000
const TERMINAL_OUTPUT_LIMIT = 4000
const TERMINAL_FLUSH_MS = 1500
const VALID_EVENT_TYPES = new Set<VoightEventType>(['reasoning', 'tool', 'tx', 'decision', 'action', 'error'])
const VALID_PRIVACY_LEVELS = new Set<VoightPrivacyLevel>(['minimal', 'standard', 'full'])
const VALID_OUTCOMES = new Set<VoightOutcome>(['pending', 'success', 'failed'])

let flushInFlight = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let tablesReady = false

const terminalOutput = new Map<string, {
  agentId: string
  sessionId: string
  terminalId: string
  providerId: string | null
  buffer: string
  timer: ReturnType<typeof setTimeout> | null
}>()

class VoightHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs: number | null,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

function ensureVoightTables(): void {
  if (tablesReady) return
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS voight_event_queue (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      type TEXT NOT NULL,
      outcome TEXT,
      dedup_key TEXT UNIQUE,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sent_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_voight_queue_status
      ON voight_event_queue(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_voight_queue_agent
      ON voight_event_queue(agent_id, created_at DESC);
  `)
  tablesReady = true
}

function nowIso(): string {
  return new Date().toISOString()
}

function endpoint(): string {
  return process.env.VOIGHT_ENDPOINT?.trim() || DEFAULT_ENDPOINT
}

function boundedNumber(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined
}

function keySource(): { source: VoightKeySource; key: string | null } {
  const secure = SecureKey.getKey(VOIGHT_KEY_NAME)
  if (secure?.trim()) return { source: 'secure', key: secure.trim() }
  const env = process.env.VOIGHT_KEY?.trim()
  if (env) return { source: 'env', key: env }
  return { source: 'none', key: null }
}

function validateKey(value: string): void {
  if (!/^vk_[A-Za-z0-9_-]{20,}$/.test(value.trim())) {
    throw new Error('Voight key must start with vk_')
  }
}

function settingValue(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSettingValue(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, Date.now())
}

export function getPrivacyLevel(): VoightPrivacyLevel {
  const value = settingValue('voight_privacy_level')
  return VALID_PRIVACY_LEVELS.has(value as VoightPrivacyLevel) ? value as VoightPrivacyLevel : DEFAULT_PRIVACY_LEVEL
}

export function setPrivacyLevel(level: VoightPrivacyLevel): VoightPrivacyLevel {
  if (!VALID_PRIVACY_LEVELS.has(level)) throw new Error('Invalid Voight privacy level')
  setSettingValue('voight_privacy_level', level)
  return level
}

export function storeKey(value: string): void {
  validateKey(value)
  SecureKey.storeKey(VOIGHT_KEY_NAME, value.trim())
}

export function deleteKey(): void {
  SecureKey.deleteKey(VOIGHT_KEY_NAME)
}

function dropTransportSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => dropTransportSecrets(entry)) as T
  if (!value || typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (
      normalized === 'authorization' ||
      normalized === 'cookie' ||
      normalized === 'setcookie' ||
      normalized === 'xpayment' ||
      normalized === 'paymentheaders' ||
      normalized === 'privatekey' ||
      normalized === 'secretkey' ||
      normalized === 'seedphrase' ||
      normalized === 'mnemonic' ||
      normalized === 'voightkey'
    ) {
      output[key] = '[REDACTED_SECRET]'
    } else {
      output[key] = dropTransportSecrets(item)
    }
  }
  return output as T
}

function normalizeMetadata(metadata: Record<string, unknown> | undefined, privacyLevel: VoightPrivacyLevel): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    sessionId: typeof metadata?.sessionId === 'string' && metadata.sessionId ? metadata.sessionId : crypto.randomUUID(),
    source: 'daemon',
    framework: 'daemon-electron',
    privacyLevel,
  }
}

function normalizeEvent(input: VoightEventInput, privacyLevel: VoightPrivacyLevel): VoightEventInput {
  if (!input || typeof input.agentId !== 'string' || !input.agentId.trim()) throw new Error('Voight agentId required')
  if (!VALID_EVENT_TYPES.has(input.type)) throw new Error('Invalid Voight event type')
  if (input.outcome && !VALID_OUTCOMES.has(input.outcome)) throw new Error('Invalid Voight outcome')

  return {
    agentId: input.agentId.trim().slice(0, 160),
    type: input.type,
    timestamp: input.timestamp || nowIso(),
    ...(input.input !== undefined ? { input: input.input } : {}),
    ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
    ...(typeof input.toolExecuted === 'string' && input.toolExecuted.trim() ? { toolExecuted: input.toolExecuted.trim().slice(0, 240) } : {}),
    ...(Array.isArray(input.toolsConsidered) ? { toolsConsidered: input.toolsConsidered.filter((tool): tool is string => typeof tool === 'string').slice(0, 40) } : {}),
    ...(typeof input.transaction === 'string' && input.transaction.trim() ? { transaction: input.transaction.trim().slice(0, 200) } : {}),
    ...(typeof input.amountToken === 'string' && input.amountToken.trim() ? { amountToken: input.amountToken.trim().slice(0, 80) } : {}),
    ...(input.amountValue !== undefined ? { amountValue: input.amountValue } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(boundedNumber(input.durationMs) !== undefined ? { durationMs: boundedNumber(input.durationMs) } : {}),
    ...(typeof input.errorMessage === 'string' && input.errorMessage.trim() ? { errorMessage: input.errorMessage.trim().slice(0, 4000) } : {}),
    ...(typeof input.model === 'string' && input.model.trim() ? { model: input.model.trim().slice(0, 160) } : {}),
    metadata: normalizeMetadata(input.metadata, privacyLevel),
  }
}

function applyPrivacy(event: VoightEventInput, level: VoightPrivacyLevel): VoightEventInput {
  const safe = dropTransportSecrets(event)
  if (level === 'full') return safe

  if (level === 'minimal') {
    const metadata = safe.metadata ? redactValue(safe.metadata) : undefined
    return {
      agentId: safe.agentId,
      type: safe.type,
      timestamp: safe.timestamp,
      ...(safe.outcome ? { outcome: safe.outcome } : {}),
      ...(safe.durationMs !== undefined ? { durationMs: safe.durationMs } : {}),
      ...(safe.model ? { model: safe.model } : {}),
      ...(safe.errorMessage ? { errorMessage: '[REDACTED_ERROR]' } : {}),
      ...(metadata ? { metadata } : {}),
    }
  }

  return redactValue(safe)
}

function payloadJson(event: VoightEventInput): string {
  const json = JSON.stringify(event)
  if (Buffer.byteLength(json, 'utf8') <= MAX_EVENT_JSON_BYTES) return json
  const truncated = {
    ...event,
    input: event.input ? '[TRUNCATED]' : undefined,
    reasoning: event.reasoning ? '[TRUNCATED]' : undefined,
    metadata: {
      ...(event.metadata ?? {}),
      truncated: true,
    },
  }
  return JSON.stringify(truncated)
}

function parseJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, 1000)
  }
}

async function postPayload(payload: VoightEventInput, key: string): Promise<VoightTestResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      const retryAfter = res.headers.get('Retry-After')
      const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : null
      throw new VoightHttpError(
        `Voight POST failed with HTTP ${res.status}`,
        res.status,
        retryAfterMs,
        res.status === 429 || res.status >= 500,
      )
    }
    return {
      accepted: true,
      status: res.status,
      eventId: String(payload.metadata?.eventId ?? ''),
      response: parseJson(text),
    }
  } catch (err) {
    if (err instanceof VoightHttpError) throw err
    throw new VoightHttpError(sanitizeErrorMessage(err), 0, null, true)
  } finally {
    clearTimeout(timeout)
  }
}

async function sendWithRetry(payload: VoightEventInput, key: string): Promise<VoightTestResult> {
  const delays = [1000, 2000, 4000]
  let lastError: unknown = null
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await postPayload(payload, key)
    } catch (err) {
      lastError = err
      if (err instanceof VoightHttpError && !err.retryable) throw err
      if (attempt < delays.length) {
        const delay = err instanceof VoightHttpError && err.retryAfterMs ? err.retryAfterMs : delays[attempt]
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Voight send failed')
}

function scheduleFlush(delayMs = 250): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flushQueue().catch(() => { /* fire-and-forget */ })
  }, delayMs)
}

function nextAttemptAt(attempts: number, err: unknown): number {
  if (err instanceof VoightHttpError && err.retryAfterMs) return Date.now() + err.retryAfterMs
  return Date.now() + Math.min(60_000, 1000 * (2 ** Math.max(0, attempts)))
}

export async function flushQueue(): Promise<{ sent: number; failed: number; pending: number }> {
  ensureVoightTables()
  const { key } = keySource()
  if (!key) return { sent: 0, failed: 0, pending: 0 }
  if (flushInFlight) return { sent: 0, failed: 0, pending: 0 }

  flushInFlight = true
  let sent = 0
  let failed = 0
  try {
    const rows = getDb().prepare(`
      SELECT id, payload_json, attempts
      FROM voight_event_queue
      WHERE status = 'pending' AND next_attempt_at <= ?
      ORDER BY created_at ASC
      LIMIT 25
    `).all(Date.now()) as QueueRow[]

    for (const row of rows) {
      const payload = JSON.parse(row.payload_json) as VoightEventInput
      try {
        await postPayload(payload, key)
        getDb().prepare(`
          UPDATE voight_event_queue
          SET status = 'sent', attempts = attempts + 1, updated_at = ?, sent_at = ?, last_error = NULL
          WHERE id = ?
        `).run(Date.now(), Date.now(), row.id)
        sent += 1
      } catch (err) {
        const attempts = row.attempts + 1
        const isRetryable = err instanceof VoightHttpError && err.retryable && attempts < 4
        getDb().prepare(`
          UPDATE voight_event_queue
          SET status = ?, attempts = ?, next_attempt_at = ?, updated_at = ?, last_error = ?
          WHERE id = ?
        `).run(
          isRetryable ? 'pending' : 'failed',
          attempts,
          isRetryable ? nextAttemptAt(attempts, err) : 0,
          Date.now(),
          sanitizeErrorMessage(err),
          row.id,
        )
        if (isRetryable) scheduleFlush(nextAttemptAt(attempts, err) - Date.now())
        else failed += 1
      }
    }

    getDb().prepare(`
      DELETE FROM voight_event_queue
      WHERE id IN (
        SELECT id FROM voight_event_queue
        ORDER BY created_at DESC
        LIMIT -1 OFFSET ?
      )
    `).run(MAX_QUEUE_ROWS)

    const pending = (getDb().prepare("SELECT COUNT(*) as count FROM voight_event_queue WHERE status = 'pending'").get() as { count: number }).count
    if (pending > 0) scheduleFlush(2000)
    return { sent, failed, pending }
  } finally {
    flushInFlight = false
  }
}

export async function emitEvent(input: VoightEventInput): Promise<string | null> {
  ensureVoightTables()
  if (!keySource().key) return null

  const privacyLevel = getPrivacyLevel()
  const eventId = crypto.randomUUID()
  const normalized = normalizeEvent({
    ...input,
    metadata: {
      ...(input.metadata ?? {}),
      eventId,
    },
  }, privacyLevel)
  const payload = applyPrivacy(normalized, privacyLevel)
  const dedupKey = typeof payload.metadata?.dedupKey === 'string' ? payload.metadata.dedupKey.slice(0, 240) : null
  const now = Date.now()

  getDb().prepare(`
    INSERT OR IGNORE INTO voight_event_queue (
      id, agent_id, type, outcome, dedup_key, payload_json, status,
      attempts, next_attempt_at, last_error, created_at, updated_at, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, NULL, ?, ?, NULL)
  `).run(
    eventId,
    payload.agentId,
    payload.type,
    payload.outcome ?? null,
    dedupKey,
    payloadJson(payload),
    now,
    now,
  )

  scheduleFlush()
  return eventId
}

export function emitEventSafe(input: VoightEventInput): void {
  emitEvent(input).catch(() => { /* fire-and-forget */ })
}

export async function testEvent(): Promise<VoightTestResult> {
  const { key } = keySource()
  if (!key) throw new Error('Voight key is not configured')
  const privacyLevel = getPrivacyLevel()
  const eventId = crypto.randomUUID()
  const payload = applyPrivacy(normalizeEvent({
    agentId: 'daemon',
    type: 'action',
    outcome: 'success',
    input: { action: 'voight_test_event' },
    metadata: {
      eventId,
      sessionId: `voight-test-${eventId}`,
      detail: 'DAEMON Voight test event',
      tags: { integration: 'voight' },
    },
  }, privacyLevel), privacyLevel)

  return sendWithRetry(payload, key)
}

export function getStatus(): VoightStatus {
  ensureVoightTables()
  const source = keySource().source
  const counts = getDb().prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      MAX(sent_at) as lastSentAt
    FROM voight_event_queue
  `).get() as { pending: number | null; failed: number | null; sent: number | null; lastSentAt: number | null }
  const lastError = getDb().prepare(`
    SELECT last_error FROM voight_event_queue
    WHERE last_error IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `).get() as { last_error: string } | undefined

  return {
    configured: source !== 'none',
    keySource: source,
    privacyLevel: getPrivacyLevel(),
    endpoint: endpoint(),
    pending: Number(counts.pending ?? 0),
    failed: Number(counts.failed ?? 0),
    sent: Number(counts.sent ?? 0),
    lastSentAt: counts.lastSentAt ?? null,
    lastError: lastError?.last_error ?? null,
  }
}

export function trackError(agentId: string, error: unknown, metadata: Record<string, unknown> = {}): void {
  emitEventSafe({
    agentId,
    type: 'error',
    outcome: 'failed',
    errorMessage: sanitizeErrorMessage(error),
    metadata,
  })
}

export function trackTerminalOutput(input: {
  terminalId: string
  sessionId?: string | null
  agentId?: string | null
  providerId?: string | null
  data: string
}): void {
  if (!input.data) return
  const sessionId = input.sessionId || input.terminalId
  const agentId = input.agentId || input.providerId || 'daemon-terminal'
  const current = terminalOutput.get(input.terminalId) ?? {
    agentId,
    sessionId,
    terminalId: input.terminalId,
    providerId: input.providerId ?? null,
    buffer: '',
    timer: null,
  }
  current.buffer = `${current.buffer}${input.data}`.slice(-TERMINAL_OUTPUT_LIMIT)
  terminalOutput.set(input.terminalId, current)

  if (current.buffer.length >= TERMINAL_OUTPUT_LIMIT) {
    flushTerminalOutput(input.terminalId)
    return
  }

  if (!current.timer) {
    current.timer = setTimeout(() => flushTerminalOutput(input.terminalId), TERMINAL_FLUSH_MS)
  }
}

export function flushTerminalOutput(terminalId: string): void {
  const current = terminalOutput.get(terminalId)
  if (!current || !current.buffer) return
  if (current.timer) clearTimeout(current.timer)
  terminalOutput.delete(terminalId)

  emitEventSafe({
    agentId: current.agentId,
    type: 'tool',
    toolExecuted: 'terminal_output',
    outcome: 'success',
    input: { output: current.buffer },
    metadata: {
      sessionId: current.sessionId,
      terminalId: current.terminalId,
      providerId: current.providerId,
      detail: 'terminal output chunk',
    },
  })
}

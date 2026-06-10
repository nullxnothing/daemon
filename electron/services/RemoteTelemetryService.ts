import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { app } from 'electron'

import { getDb } from '../db/db'
import { sanitizeErrorMessage } from '../security/PrivacyGuard'
import { getBooleanSetting, setBooleanSetting } from './SettingsService'

const DEFAULT_TELEMETRY_ENDPOINT = 'https://daemon-landing.vercel.app/api/telemetry'
const STATE_TABLE = 'remote_telemetry_state'
const ENABLED_SETTING_KEY = 'telemetry_remote_enabled'
// DAEMON is an IDE — sessions span days. Re-flush hourly so the UTC-day
// rollover emits daily_active without a restart (per-day state keys dedupe).
const FLUSH_INTERVAL_MS = 60 * 60 * 1000

type TelemetryEventName = 'first_open' | 'daily_active'

type TelemetryPayload = {
  schemaVersion: 1
  eventName: TelemetryEventName
  eventId: string
  installId: string
  timestamp: number
  appVersion: string
  platform: NodeJS.Platform
  arch: NodeJS.Architecture
  osVersion: string
  locale: string
  isPackaged: boolean
  isBackfill?: boolean
  estimatedFirstSeenAt?: number
}

/** User-facing opt-out, persisted in app_settings and surfaced in Settings → Privacy. */
export function isRemoteTelemetryEnabled(): boolean {
  return getBooleanSetting(ENABLED_SETTING_KEY, true)
}

export function setRemoteTelemetryEnabled(enabled: boolean): void {
  setBooleanSetting(ENABLED_SETTING_KEY, enabled)
}

function remoteTelemetryEnabled(): boolean {
  if (process.env.DAEMON_TELEMETRY_DISABLED === '1') return false
  if (!isRemoteTelemetryEnabled()) return false
  if (process.env.DAEMON_REMOTE_TELEMETRY_DEV === '1') return true
  return app.isPackaged
}

function endpoint(): string {
  return process.env.DAEMON_TELEMETRY_ENDPOINT?.trim() || DEFAULT_TELEMETRY_ENDPOINT
}

function utcDay(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function ensureStateTable(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
}

function getState(key: string): string | null {
  ensureStateTable()
  const row = getDb()
    .prepare(`SELECT value FROM ${STATE_TABLE} WHERE key = ?`)
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setState(key: string, value: string): void {
  ensureStateTable()
  getDb()
    .prepare(`
      INSERT INTO ${STATE_TABLE} (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    .run(key, value, Date.now())
}

function getInstallId(): string {
  const existing = getState('install_id')
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing

  const installId = randomUUID()
  setState('install_id', installId)
  setState('install_created_at', String(Date.now()))
  return installId
}

function firstLocalTelemetryTimestamp(): number | null {
  try {
    const row = getDb()
      .prepare('SELECT MIN(timestamp) as firstSeenAt FROM telemetry_events')
      .get() as { firstSeenAt: number | null } | undefined
    return typeof row?.firstSeenAt === 'number' ? row.firstSeenAt : null
  } catch {
    return null
  }
}

function buildPayload(eventName: TelemetryEventName, installId: string): TelemetryPayload {
  const firstSeenAt = firstLocalTelemetryTimestamp()
  const installCreatedAt = Number(getState('install_created_at') ?? '')
  const estimatedFirstSeenAt = firstSeenAt ?? (Number.isFinite(installCreatedAt) ? installCreatedAt : null)

  return {
    schemaVersion: 1,
    eventName,
    eventId: randomUUID(),
    installId,
    timestamp: Date.now(),
    appVersion: app.getVersion() || 'unknown',
    platform: process.platform,
    arch: process.arch,
    osVersion: os.release(),
    locale: app.getLocale() || Intl.DateTimeFormat().resolvedOptions().locale || 'unknown',
    isPackaged: app.isPackaged,
    ...(eventName === 'first_open' && firstSeenAt ? { isBackfill: true } : {}),
    ...(estimatedFirstSeenAt ? { estimatedFirstSeenAt } : {}),
  }
}

async function postTelemetry(payload: TelemetryPayload): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5_000)

  try {
    const res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Telemetry POST failed with HTTP ${res.status}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function sendOnce(eventName: TelemetryEventName, stateKey: string, installId: string): Promise<void> {
  if (getState(stateKey)) return

  const payload = buildPayload(eventName, installId)
  await postTelemetry(payload)
  setState(stateKey, String(payload.timestamp))
}

export async function flushRemoteTelemetry(): Promise<void> {
  if (!remoteTelemetryEnabled()) return

  try {
    const installId = getInstallId()
    await sendOnce('first_open', 'first_open_sent_at', installId)
    await sendOnce('daily_active', `daily_active_sent:${utcDay()}`, installId)
  } catch (err) {
    console.warn('[telemetry] Remote telemetry flush failed:', sanitizeErrorMessage(err))
  }
}

let flushTimer: NodeJS.Timeout | null = null

/** Flush now, then keep re-flushing so multi-day sessions emit daily_active. */
export function startRemoteTelemetryLoop(): void {
  if (flushTimer) return
  void flushRemoteTelemetry()
  flushTimer = setInterval(() => void flushRemoteTelemetry(), FLUSH_INTERVAL_MS)
  flushTimer.unref?.()
}

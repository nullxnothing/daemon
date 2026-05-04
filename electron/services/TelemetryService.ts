import { app } from 'electron'
import crypto from 'node:crypto'
import os from 'node:os'
import { getDb } from '../db/db'
import { getBooleanSetting, setBooleanSetting } from './SettingsService'

const TELEMETRY_ENDPOINT =
  process.env.DAEMON_TELEMETRY_URL ??
  'https://daemon-landing.vercel.app/api/telemetry'

const TELEMETRY_SCHEMA_VERSION = 1
const TELEMETRY_ENABLED_KEY = 'telemetry_enabled'
const TELEMETRY_INSTALL_ID_KEY = 'telemetry_install_id'
const TELEMETRY_FIRST_OPEN_SENT_KEY = 'telemetry_first_open_sent'
const TELEMETRY_LAST_DAILY_ACTIVE_KEY = 'telemetry_last_daily_active_date'
const TELEMETRY_TIMEOUT_MS = 4000

export interface TelemetrySettings {
  enabled: boolean
  installId: string
  endpoint: string
}

type TelemetryEventName = 'first_open' | 'daily_active'

interface TelemetryPayload {
  schemaVersion: number
  eventName: TelemetryEventName
  eventId: string
  installId: string
  timestamp: number
  appVersion: string
  platform: NodeJS.Platform
  arch: string
  osVersion: string
  locale: string
  isPackaged: boolean
  isBackfill: boolean
  estimatedFirstSeenAt: number | null
}

function isTelemetryAllowedInThisRuntime(): boolean {
  if (process.env.DAEMON_SMOKE_TEST === '1') return false
  if (process.env.NODE_ENV === 'test') return false
  return app.isPackaged || process.env.DAEMON_TELEMETRY_DEV === '1'
}

function getUtcDay(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function getSettingValue(key: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSettingValue(key: string, value: string): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, value, Date.now())
}

export function isTelemetryEnabled(): boolean {
  return getBooleanSetting(TELEMETRY_ENABLED_KEY, app.isPackaged)
}

export function setTelemetryEnabled(enabled: boolean): void {
  setBooleanSetting(TELEMETRY_ENABLED_KEY, enabled)
}

export function getTelemetryInstallId(): string {
  const existing = getSettingValue(TELEMETRY_INSTALL_ID_KEY)
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return existing
  }
  const installId = crypto.randomUUID()
  setSettingValue(TELEMETRY_INSTALL_ID_KEY, installId)
  return installId
}

export function getTelemetrySettings(): TelemetrySettings {
  return {
    enabled: isTelemetryEnabled(),
    installId: getTelemetryInstallId(),
    endpoint: TELEMETRY_ENDPOINT,
  }
}

function estimateFirstSeenAt(): number | null {
  const db = getDb()
  const queries = [
    'SELECT MIN(created_at) as ts FROM _migrations',
    'SELECT MIN(created_at) as ts FROM projects',
    'SELECT MIN(created_at) as ts FROM agents',
    'SELECT MIN(started_at) as ts FROM agent_sessions_local',
    'SELECT MIN(created_at) as ts FROM activity_log',
    'SELECT MIN(created_at) as ts FROM app_crashes',
  ]

  let earliest: number | null = null
  for (const query of queries) {
    try {
      const row = db.prepare(query).get() as { ts: number | null } | undefined
      const ts = row?.ts
      if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) continue
      if (ts < 1_000_000_000_000) continue
      earliest = earliest === null ? ts : Math.min(earliest, ts)
    } catch {
      // Older databases may not have every table.
    }
  }
  return earliest
}

function buildPayload(eventName: TelemetryEventName, isBackfill: boolean): TelemetryPayload {
  return {
    schemaVersion: TELEMETRY_SCHEMA_VERSION,
    eventName,
    eventId: crypto.randomUUID(),
    installId: getTelemetryInstallId(),
    timestamp: Date.now(),
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osVersion: `${os.type()} ${os.release()}`,
    locale: app.getLocale(),
    isPackaged: app.isPackaged,
    isBackfill,
    estimatedFirstSeenAt: estimateFirstSeenAt(),
  }
}

async function postTelemetry(payload: TelemetryPayload): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS)
  try {
    const res = await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `DAEMON/${payload.appVersion}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new Error(`Telemetry failed with status ${res.status}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function sendEvent(eventName: TelemetryEventName, isBackfill: boolean): Promise<void> {
  await postTelemetry(buildPayload(eventName, isBackfill))
}

export async function trackAppLaunchTelemetry(): Promise<void> {
  if (!isTelemetryAllowedInThisRuntime()) return
  if (!isTelemetryEnabled()) return

  const firstOpenSent = getBooleanSetting(TELEMETRY_FIRST_OPEN_SENT_KEY, false)
  if (!firstOpenSent) {
    const estimatedFirstSeenAt = estimateFirstSeenAt()
    const isBackfill = typeof estimatedFirstSeenAt === 'number' && Date.now() - estimatedFirstSeenAt > 24 * 60 * 60 * 1000
    await sendEvent('first_open', isBackfill)
    setBooleanSetting(TELEMETRY_FIRST_OPEN_SENT_KEY, true)
  }

  const today = getUtcDay()
  const lastDailyActive = getSettingValue(TELEMETRY_LAST_DAILY_ACTIVE_KEY)
  if (lastDailyActive !== today) {
    await sendEvent('daily_active', false)
    setSettingValue(TELEMETRY_LAST_DAILY_ACTIVE_KEY, today)
  }
}

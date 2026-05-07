import { randomUUID } from 'node:crypto'

import { getDb } from '../db/db'
import { sanitizeTelemetryProperties } from '../security/PrivacyGuard'

export interface TelemetryEvent {
  eventId: string
  eventName: string
  userId: string | null
  sessionId: string
  timestamp: number
  properties: Record<string, unknown>
  version: string
}

export interface TelemetrySession {
  sessionId: string
  startedAt: number
  version: string
}

let currentSession: TelemetrySession | null = null

export function initTelemetry(version: string): TelemetrySession {
  const sessionId = `session_${randomUUID()}`
  currentSession = {
    sessionId,
    startedAt: Date.now(),
    version,
  }

  // Ensure telemetry tables exist
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      properties TEXT NOT NULL,
      version TEXT NOT NULL,
      created_at INTEGER DEFAULT (CAST(unixepoch('now') * 1000 AS INTEGER))
    );

    CREATE INDEX IF NOT EXISTS idx_telemetry_session ON telemetry_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_telemetry_event_name ON telemetry_events(event_name);
    CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_events(timestamp);
  `)

  return currentSession
}

export function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {},
  userId: string | null = null,
): void {
  if (!currentSession) {
    console.warn('[telemetry] Session not initialized')
    return
  }

  const event: TelemetryEvent = {
    eventId: `event_${randomUUID()}`,
    eventName,
    userId,
    sessionId: currentSession.sessionId,
    timestamp: Date.now(),
    properties: sanitizeTelemetryProperties(properties),
    version: currentSession.version,
  }

  try {
    const db = getDb()
    db.prepare(`
      INSERT INTO telemetry_events (
        id, event_name, user_id, session_id, timestamp, properties, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      event.eventName,
      event.userId,
      event.sessionId,
      event.timestamp,
      JSON.stringify(event.properties),
      event.version,
    )
  } catch (err) {
    console.error('[telemetry] Failed to record event:', err)
  }
}

export function trackTiming(
  eventName: string,
  durationMs: number,
  properties: Record<string, unknown> = {},
  userId: string | null = null,
): void {
  trackEvent(eventName, { ...properties, durationMs }, userId)
}

export function getSessionId(): string | null {
  return currentSession?.sessionId ?? null
}

export function getSessionStats(): { eventsCount: number; sessionDuration: number } {
  if (!currentSession) return { eventsCount: 0, sessionDuration: 0 }

  try {
    const db = getDb()
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM telemetry_events
      WHERE session_id = ?
    `).get(currentSession.sessionId) as { count: number }

    return {
      eventsCount: row.count,
      sessionDuration: Date.now() - currentSession.startedAt,
    }
  } catch (err) {
    console.error('[telemetry] Failed to get session stats:', err)
    return { eventsCount: 0, sessionDuration: 0 }
  }
}

export function getRecentEvents(limit: number = 50): TelemetryEvent[] {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        id as eventId,
        event_name as eventName,
        user_id as userId,
        session_id as sessionId,
        timestamp,
        properties,
        version
      FROM telemetry_events
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as Array<{
      eventId: string
      eventName: string
      userId: string | null
      sessionId: string
      timestamp: number
      properties: string
      version: string
    }>

    return rows.map((row) => ({
      ...row,
      properties: JSON.parse(row.properties),
    }))
  } catch (err) {
    console.error('[telemetry] Failed to get recent events:', err)
    return []
  }
}

export function cleanupOldTelemetry(olderThanDays: number = 30): void {
  try {
    const db = getDb()
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    db.prepare('DELETE FROM telemetry_events WHERE timestamp < ?').run(cutoff)
  } catch (err) {
    console.error('[telemetry] Failed to cleanup old telemetry:', err)
  }
}

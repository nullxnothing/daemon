import * as crypto from 'node:crypto'
import { getDb } from '../db/db'

export interface LocalSession {
  id: string
  project_id: string | null
  agent_id: string | null
  agent_name: string | null
  model: string | null
  started_at: number
  ended_at: number | null
  status: 'active' | 'completed' | 'cancelled'
  lines_generated: number
  tools_used: string[]
  published_signature: string | null
  created_at: number
  terminal_id: string | null
  custom_name: string | null
}

interface SessionRow {
  id: string
  project_id: string | null
  agent_id: string | null
  agent_name: string | null
  model: string | null
  started_at: number
  ended_at: number | null
  status: string
  lines_generated: number
  tools_used: string
  published_signature: string | null
  created_at: number
  terminal_id: string | null
  custom_name: string | null
}

function rowToSession(row: SessionRow): LocalSession {
  return {
    ...row,
    status: row.status as LocalSession['status'],
    tools_used: (() => {
      try { return JSON.parse(row.tools_used) as string[] } catch { return [] }
    })(),
    terminal_id: row.terminal_id ?? null,
    custom_name: row.custom_name ?? null,
  }
}

export function startSession(params: {
  projectId: string | null
  agentId: string | null
  agentName: string | null
  model: string | null
  terminalId?: string | null
}): string {
  const id = crypto.randomUUID()
  const now = Date.now()

  try {
    getDb().prepare(`
      INSERT INTO agent_sessions_local
        (id, project_id, agent_id, agent_name, model, started_at, status, lines_generated, tools_used, created_at, terminal_id)
      VALUES (?, ?, ?, ?, ?, ?, 'active', 0, '[]', ?, ?)
    `).run(id, params.projectId, params.agentId, params.agentName, params.model, now, now, params.terminalId ?? null)
  } catch (err) {
    console.warn('[SessionTracker] failed to start session:', (err as Error).message)
  }

  return id
}

export function renameSession(sessionId: string, customName: string): void {
  const trimmed = customName.trim()
  const value = trimmed.length > 0 ? trimmed : null

  try {
    getDb().prepare(`
      UPDATE agent_sessions_local SET custom_name = ? WHERE id = ?
    `).run(value, sessionId)
  } catch (err) {
    console.warn('[SessionTracker] failed to rename session:', (err as Error).message)
  }
}

export function endSession(params: {
  sessionId: string
  linesGenerated?: number
  toolsUsed?: string[]
  status?: 'completed' | 'cancelled' | 'failed'
}): void {
  const { sessionId, linesGenerated = 0, toolsUsed = [], status = 'completed' } = params
  const now = Date.now()

  try {
    getDb().prepare(`
      UPDATE agent_sessions_local
      SET ended_at = ?, status = ?, lines_generated = ?, tools_used = ?
      WHERE id = ?
    `).run(now, status, linesGenerated, JSON.stringify(toolsUsed), sessionId)
  } catch (err) {
    console.warn('[SessionTracker] failed to end session:', (err as Error).message)
  }
}

export function markPublished(sessionId: string, signature: string): void {
  try {
    getDb().prepare(`
      UPDATE agent_sessions_local SET published_signature = ? WHERE id = ?
    `).run(signature, sessionId)
  } catch (err) {
    console.warn('[SessionTracker] failed to mark session published:', (err as Error).message)
  }
}

export function listSessions(opts: { limit?: number; status?: string } = {}): LocalSession[] {
  try {
    const { limit = 50, status } = opts
    const db = getDb()

    if (status) {
      const rows = db.prepare(`
        SELECT * FROM agent_sessions_local WHERE status = ? ORDER BY created_at DESC LIMIT ?
      `).all(status, limit) as SessionRow[]
      return rows.map(rowToSession)
    }

    const rows = db.prepare(`
      SELECT * FROM agent_sessions_local ORDER BY created_at DESC LIMIT ?
    `).all(limit) as SessionRow[]
    return rows.map(rowToSession)
  } catch (err) {
    console.warn('[SessionTracker] failed to list sessions:', (err as Error).message)
    return []
  }
}

export function getProfileStats(): {
  totalSessions: number
  totalDuration: number
  totalAgentsSpawned: number
  projectsCount: number
  unpublishedCount: number
} {
  try {
    const db = getDb()

    const totals = db.prepare(`
      SELECT
        COUNT(*) as totalSessions,
        SUM(CASE WHEN ended_at IS NOT NULL THEN (ended_at - started_at) ELSE 0 END) as totalDuration,
        COUNT(DISTINCT agent_id) as totalAgentsSpawned,
        COUNT(DISTINCT project_id) as projectsCount,
        SUM(CASE WHEN published_signature IS NULL AND status = 'completed' THEN 1 ELSE 0 END) as unpublishedCount
      FROM agent_sessions_local
    `).get() as {
      totalSessions: number
      totalDuration: number | null
      totalAgentsSpawned: number
      projectsCount: number
      unpublishedCount: number
    }

    return {
      totalSessions: totals.totalSessions ?? 0,
      totalDuration: totals.totalDuration ?? 0,
      totalAgentsSpawned: totals.totalAgentsSpawned ?? 0,
      projectsCount: totals.projectsCount ?? 0,
      unpublishedCount: totals.unpublishedCount ?? 0,
    }
  } catch (err) {
    console.warn('[SessionTracker] failed to get profile stats:', (err as Error).message)
    return { totalSessions: 0, totalDuration: 0, totalAgentsSpawned: 0, projectsCount: 0, unpublishedCount: 0 }
  }
}

export function getUnpublishedSessions(): LocalSession[] {
  try {
    const rows = getDb().prepare(`
      SELECT * FROM agent_sessions_local
      WHERE published_signature IS NULL AND status = 'completed'
      ORDER BY created_at DESC
    `).all() as SessionRow[]
    return rows.map(rowToSession)
  } catch (err) {
    console.warn('[SessionTracker] failed to get unpublished sessions:', (err as Error).message)
    return []
  }
}

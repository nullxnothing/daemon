import { ipcMain } from 'electron'
import { getDb } from '../db/db'
import { listClaudeAgents } from '../services/ClaudeAgentService'
import type { Agent } from '../shared/types'

const ALLOWED_AGENT_COLUMNS = new Set([
  'name', 'system_prompt', 'model', 'mcps', 'project_id', 'shortcut', 'source', 'external_path',
])

export function registerAgentHandlers() {
  ipcMain.handle('agents:list', async () => {
    try {
      const db = getDb()
      const agents = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all()
      return { ok: true, data: agents }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('agents:create', async (_event, agent: {
    name: string
    systemPrompt: string
    model: string
    mcps: string[]
    projectId?: string
    shortcut?: string
    source?: string
    externalPath?: string | null
  }) => {
    try {
      const db = getDb()
      const id = crypto.randomUUID()
      db.prepare(
        'INSERT INTO agents (id, name, system_prompt, model, mcps, project_id, shortcut, source, external_path) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(
        id,
        agent.name,
        agent.systemPrompt,
        agent.model,
        JSON.stringify(agent.mcps),
        agent.projectId ?? null,
        agent.shortcut ?? null,
        agent.source ?? 'daemon',
        agent.externalPath ?? null,
      )
      const created = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
      return { ok: true, data: created }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('agents:claude-list', async () => {
    try {
      return { ok: true, data: listClaudeAgents() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('agents:import-claude', async (_event, filePath: string) => {
    try {
      const db = getDb()
      const candidate = listClaudeAgents().find((agent) => agent.filePath === filePath)
      if (!candidate) return { ok: false, error: 'Claude agent not found' }

      const existing = db.prepare('SELECT * FROM agents WHERE external_path = ?').get(filePath)
      if (existing) return { ok: true, data: existing }

      const id = crypto.randomUUID()
      db.prepare(
        'INSERT INTO agents (id, name, system_prompt, model, mcps, project_id, shortcut, source, external_path) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(
        id,
        candidate.name,
        candidate.systemPrompt,
        candidate.model,
        '[]',
        null,
        null,
        'claude-import',
        filePath,
      )

      const created = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
      return { ok: true, data: created }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('agents:sync-claude', async (_event, filePath: string) => {
    try {
      const db = getDb()
      const candidate = listClaudeAgents().find((agent) => agent.filePath === filePath)
      if (!candidate) return { ok: false, error: 'Claude agent not found' }

      const existing = db.prepare('SELECT * FROM agents WHERE external_path = ?').get(filePath) as Agent | undefined
      if (!existing) return { ok: false, error: 'Claude agent has not been imported yet' }

      db.prepare(
        'UPDATE agents SET name = ?, system_prompt = ?, model = ? WHERE id = ?'
      ).run(
        candidate.name,
        candidate.systemPrompt,
        candidate.model,
        existing.id,
      )

      const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(existing.id)
      return { ok: true, data: updated }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('agents:update', async (_event, id: string, data: Record<string, unknown>) => {
    try {
      const db = getDb()
      const fields = Object.keys(data).filter((f) => ALLOWED_AGENT_COLUMNS.has(f))
      if (fields.length === 0) return { ok: false, error: 'No valid fields to update' }

      const sets = fields.map((f) => `${f} = ?`).join(', ')
      const values = fields.map((f) => {
        const v = data[f]
        return Array.isArray(v) ? JSON.stringify(v) : v
      })
      db.prepare(`UPDATE agents SET ${sets} WHERE id = ?`).run(...values, id)
      const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
      return { ok: true, data: updated }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('agents:delete', async (_event, id: string) => {
    try {
      const db = getDb()
      db.prepare('DELETE FROM agents WHERE id = ?').run(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

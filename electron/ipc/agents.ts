import { ipcMain } from 'electron'
import { getDb } from '../db/db'
import { listClaudeAgents } from '../services/ClaudeAgentService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { Agent, AgentCreateInput } from '../shared/types'

/** Allowed columns for partial agent updates — keys serve as the whitelist */
const AGENT_COLUMN_MAP: Record<string, true> = {
  name: true,
  system_prompt: true,
  model: true,
  mcps: true,
  provider: true,
  project_id: true,
  shortcut: true,
  source: true,
  external_path: true,
}

export function registerAgentHandlers() {
  ipcMain.handle('agents:list', ipcHandler(async () => {
    const db = getDb()
    return db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all()
  }))

  ipcMain.handle('agents:create', ipcHandler(async (_event, agent: AgentCreateInput) => {
    const db = getDb()
    const id = crypto.randomUUID()
    db.prepare(
      'INSERT INTO agents (id, name, system_prompt, model, mcps, provider, project_id, shortcut, source, external_path) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(
      id,
      agent.name,
      agent.systemPrompt,
      agent.model,
      JSON.stringify(agent.mcps),
      agent.provider ?? 'claude',
      agent.projectId ?? null,
      agent.shortcut ?? null,
      agent.source ?? 'daemon',
      agent.externalPath ?? null,
    )
    return db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
  }))

  ipcMain.handle('agents:claude-list', ipcHandler(async () => listClaudeAgents()))

  ipcMain.handle('agents:import-claude', ipcHandler(async (_event, filePath: string) => {
    const db = getDb()
    const candidate = listClaudeAgents().find((agent) => agent.filePath === filePath)
    if (!candidate) throw new Error('Claude agent not found')

    const existing = db.prepare('SELECT * FROM agents WHERE external_path = ?').get(filePath)
    if (existing) return existing

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

    return db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
  }))

  ipcMain.handle('agents:sync-claude', ipcHandler(async (_event, filePath: string) => {
    const db = getDb()
    const candidate = listClaudeAgents().find((agent) => agent.filePath === filePath)
    if (!candidate) throw new Error('Claude agent not found')

    const existing = db.prepare('SELECT * FROM agents WHERE external_path = ?').get(filePath) as Agent | undefined
    if (!existing) throw new Error('Claude agent has not been imported yet')

    db.prepare(
      'UPDATE agents SET name = ?, system_prompt = ?, model = ? WHERE id = ?'
    ).run(
      candidate.name,
      candidate.systemPrompt,
      candidate.model,
      existing.id,
    )

    return db.prepare('SELECT * FROM agents WHERE id = ?').get(existing.id)
  }))

  ipcMain.handle('agents:update', ipcHandler(async (_event, id: string, data: Record<string, unknown>) => {
    const db = getDb()

    const updates: Array<{ column: string; value: unknown }> = []
    for (const [key, value] of Object.entries(data)) {
      if (key in AGENT_COLUMN_MAP) {
        updates.push({ column: key, value: Array.isArray(value) ? JSON.stringify(value) : value })
      }
    }
    if (updates.length === 0) throw new Error('No valid fields to update')

    // Column names originate exclusively from AGENT_COLUMN_MAP keys
    const sets = updates.map((u) => `${u.column} = ?`).join(', ')
    const values = updates.map((u) => u.value)
    db.prepare(`UPDATE agents SET ${sets} WHERE id = ?`).run(...values, id)
    return db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
  }))

  ipcMain.handle('agents:delete', ipcHandler(async (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  }))
}

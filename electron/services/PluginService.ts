import { getDb } from '../db/db'
import type { PluginCreateInput, PluginRow } from '../shared/types'

export function listPlugins(): PluginRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM plugins ORDER BY sort_order').all() as PluginRow[]
}

export function setPluginEnabled(id: string, enabled: boolean): void {
  const db = getDb()
  db.prepare('UPDATE plugins SET enabled = ?, updated_at = unixepoch() WHERE id = ?')
    .run(enabled ? 1 : 0, id)
}

export function addPlugin(input: PluginCreateInput): PluginRow {
  const id = normalizePluginId(input.id)
  const name = input.name.trim()
  if (!id) throw new Error('Plugin id is required')
  if (!name) throw new Error('Plugin name is required')

  const db = getDb()
  const existing = db.prepare('SELECT id FROM plugins WHERE id = ?').get(id)
  if (existing) throw new Error(`Plugin "${id}" already exists`)

  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM plugins').get() as { maxOrder: number }
  const config = JSON.stringify({
    type: 'external',
    name,
    description: input.description?.trim() ?? '',
    entry: input.entry?.trim() ?? '',
    command: input.command?.trim() ?? '',
  })

  db.prepare('INSERT INTO plugins (id, enabled, sort_order, config, updated_at) VALUES (?, ?, ?, ?, unixepoch())')
    .run(id, 1, maxOrder.maxOrder + 1, config)

  return db.prepare('SELECT * FROM plugins WHERE id = ?').get(id) as PluginRow
}

export function setPluginConfig(id: string, config: string): void {
  try {
    JSON.parse(config)
  } catch {
    throw new Error('Invalid JSON config')
  }
  const db = getDb()
  db.prepare('UPDATE plugins SET config = ?, updated_at = unixepoch() WHERE id = ?')
    .run(config, id)
}

export function reorderPlugins(orderedIds: string[]): void {
  const db = getDb()
  const update = db.prepare('UPDATE plugins SET sort_order = ?, updated_at = unixepoch() WHERE id = ?')

  db.transaction(() => {
    for (let i = 0; i < orderedIds.length; i++) {
      update.run(i, orderedIds[i])
    }
  })()
}

function normalizePluginId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

import { getDb } from '../db/db'
import type { PluginRow } from '../shared/types'

export function listPlugins(): PluginRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM plugins ORDER BY sort_order').all() as PluginRow[]
}

export function setPluginEnabled(id: string, enabled: boolean): void {
  const db = getDb()
  db.prepare('UPDATE plugins SET enabled = ?, updated_at = unixepoch() WHERE id = ?')
    .run(enabled ? 1 : 0, id)
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

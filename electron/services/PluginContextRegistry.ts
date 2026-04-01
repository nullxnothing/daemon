import { getDb } from '../db/db'

// --- Types ---

export interface PromptTemplate {
  id: string
  name: string
  template: string            // supports {{var}} interpolation
  formatInstruction?: string  // appended to every prompt using this template (e.g. "return JSON array")
}

export interface PluginSkill {
  id: string
  name: string
  description: string
  enabled: boolean
}

export interface PluginContextConfig {
  systemPrompt: string
  templates: PromptTemplate[]
  skills: PluginSkill[]
  model: string               // haiku | sonnet | opus
  effort: string              // low | medium | high
  examples: string[]
}

interface PluginContextRow {
  plugin_id: string
  system_prompt: string
  templates: string           // JSON
  skills: string              // JSON
  model: string
  effort: string
  examples: string            // JSON
  updated_at: number
}

// --- Built-in Defaults ---
// Each plugin declares its factory defaults here. DB overrides these per-field.

type DefaultFactory = () => PluginContextConfig

const DEFAULTS: Record<string, DefaultFactory> = {}

export function registerDefault(pluginId: string, factory: DefaultFactory): void {
  DEFAULTS[pluginId] = factory
}

// --- Registry API ---

export function getPluginContext(pluginId: string): PluginContextConfig | null {
  const factory = DEFAULTS[pluginId]
  if (!factory) return null

  const defaults = factory()

  // Check DB for user overrides
  const db = getDb()
  const row = db.prepare('SELECT * FROM plugin_contexts WHERE plugin_id = ?').get(pluginId) as PluginContextRow | undefined

  if (!row) return defaults

  // Merge: DB values override defaults, but missing fields fall back to defaults
  return {
    systemPrompt: row.system_prompt || defaults.systemPrompt,
    templates: safeParseArray(row.templates, defaults.templates),
    skills: mergeSkills(defaults.skills, safeParseArray(row.skills, [])),
    model: row.model || defaults.model,
    effort: row.effort || defaults.effort,
    examples: safeParseArray(row.examples, defaults.examples),
  }
}

export function updatePluginContext(pluginId: string, updates: Partial<PluginContextConfig>): void {
  const db = getDb()
  const existing = db.prepare('SELECT plugin_id FROM plugin_contexts WHERE plugin_id = ?').get(pluginId)

  if (existing) {
    const sets: string[] = []
    const values: unknown[] = []

    if (updates.systemPrompt !== undefined) { sets.push('system_prompt = ?'); values.push(updates.systemPrompt) }
    if (updates.templates !== undefined) { sets.push('templates = ?'); values.push(JSON.stringify(updates.templates)) }
    if (updates.skills !== undefined) { sets.push('skills = ?'); values.push(JSON.stringify(updates.skills)) }
    if (updates.model !== undefined) { sets.push('model = ?'); values.push(updates.model) }
    if (updates.effort !== undefined) { sets.push('effort = ?'); values.push(updates.effort) }
    if (updates.examples !== undefined) { sets.push('examples = ?'); values.push(JSON.stringify(updates.examples)) }

    if (sets.length === 0) return

    sets.push('updated_at = ?')
    values.push(Date.now())
    values.push(pluginId)

    db.prepare(`UPDATE plugin_contexts SET ${sets.join(', ')} WHERE plugin_id = ?`).run(...values)
  } else {
    const ctx = getPluginContext(pluginId)
    if (!ctx) return

    const merged = { ...ctx, ...updates }
    db.prepare(
      'INSERT INTO plugin_contexts (plugin_id, system_prompt, templates, skills, model, effort, examples, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run(
      pluginId,
      merged.systemPrompt,
      JSON.stringify(merged.templates),
      JSON.stringify(merged.skills),
      merged.model,
      merged.effort,
      JSON.stringify(merged.examples),
      Date.now(),
    )
  }
}

export function toggleSkill(pluginId: string, skillId: string, enabled: boolean): void {
  const ctx = getPluginContext(pluginId)
  if (!ctx) return

  const skills = ctx.skills.map((s) =>
    s.id === skillId ? { ...s, enabled } : s
  )

  updatePluginContext(pluginId, { skills })
}

export function resetPluginContext(pluginId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM plugin_contexts WHERE plugin_id = ?').run(pluginId)
}

export function listPluginContexts(): Array<{ pluginId: string; config: PluginContextConfig }> {
  const results: Array<{ pluginId: string; config: PluginContextConfig }> = []

  for (const pluginId of Object.keys(DEFAULTS)) {
    const config = getPluginContext(pluginId)
    if (config) results.push({ pluginId, config })
  }

  return results
}

// --- Helpers ---

function safeParseArray<T>(json: string | undefined, fallback: T[]): T[] {
  if (!json) return fallback
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

// Merge user skill toggles onto default skill list
// Defaults define the full set; DB only stores toggle state
function mergeSkills(defaults: PluginSkill[], overrides: PluginSkill[]): PluginSkill[] {
  const overrideMap = new Map(overrides.map((s) => [s.id, s.enabled]))

  return defaults.map((s) => ({
    ...s,
    enabled: overrideMap.has(s.id) ? overrideMap.get(s.id)! : s.enabled,
  }))
}

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getDb } from '../db/db'
import { LogService } from './LogService'
import type { McpEntry } from '../shared/types'

export type { McpEntry }
export type McpListEntry = McpEntry

interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
  type?: string
}

const CLAUDE_JSON_PATH = path.join(os.homedir(), '.claude.json')

function readClaudeJson(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function writeClaudeJson(data: Record<string, unknown>): void {
  fs.writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * Get all User-level MCP servers from ~/.claude.json mcpServers
 * Plus any from our registry that aren't already installed
 */
export function getGlobalMcps(): McpListEntry[] {
  const claudeJson = readClaudeJson()
  const userMcps = (claudeJson.mcpServers ?? {}) as Record<string, McpServerConfig>
  const result: McpListEntry[] = []
  const seen = new Set<string>()

  // User-level MCPs (all enabled since they're in the config)
  for (const [name, config] of Object.entries(userMcps)) {
    result.push({ name, config, source: 'user', enabled: true })
    seen.add(name)
  }

  // Registry MCPs not already in user config (available to add)
  try {
    const db = getDb()
    const registry = db.prepare('SELECT * FROM mcp_registry').all() as Array<{ name: string; config: string; description: string }>
    for (const entry of registry) {
      if (!seen.has(entry.name)) {
        result.push({ name: entry.name, config: JSON.parse(entry.config), source: 'registry', enabled: false })
      }
    }
  } catch (err) {
    LogService.warn('McpConfig', 'failed to load registry MCPs: ' + (err as Error).message)
  }

  return result
}

/**
 * Toggle an MCP on/off at User level in ~/.claude.json mcpServers
 */
export function toggleMcp(mcpName: string, enabled: boolean): void {
  const claudeJson = readClaudeJson()
  const mcpServers = (claudeJson.mcpServers ?? {}) as Record<string, McpServerConfig>
  const db = getDb()

  if (enabled) {
    // Try to restore from disabled cache (preserves user's custom config)
    const cached = db.prepare('SELECT config FROM mcp_disabled WHERE name = ?').get(mcpName) as { config: string } | undefined
    if (cached) {
      mcpServers[mcpName] = JSON.parse(cached.config)
      db.prepare('DELETE FROM mcp_disabled WHERE name = ?').run(mcpName)
    } else {
      // Fall back to registry
      const row = db.prepare('SELECT config FROM mcp_registry WHERE name = ?').get(mcpName) as { config: string } | undefined
      if (!row) throw new Error(`MCP "${mcpName}" not found in registry or disabled cache`)
      mcpServers[mcpName] = JSON.parse(row.config)
    }
  } else {
    // Save config to disabled cache before removing
    if (mcpServers[mcpName]) {
      db.prepare('INSERT OR REPLACE INTO mcp_disabled (name, config) VALUES (?,?)')
        .run(mcpName, JSON.stringify(mcpServers[mcpName]))
    }
    delete mcpServers[mcpName]
  }

  claudeJson.mcpServers = mcpServers
  writeClaudeJson(claudeJson)
}

export function getProjectMcps(projectPath: string): McpListEntry[] {
  const projectMcps = readProjectMcpConfig(projectPath)
  const result: McpListEntry[] = []
  const seen = new Set<string>()

  for (const [name, config] of Object.entries(projectMcps)) {
    result.push({ name, config, source: 'project', enabled: true })
    seen.add(name)
  }

  for (const entry of getRegistryMcps()) {
    if (!seen.has(entry.name)) {
      result.push({
        name: entry.name,
        config: JSON.parse(entry.config),
        source: 'registry',
        enabled: false,
      })
    }
  }

  return result
}

export function toggleProjectMcp(projectPath: string, mcpName: string, enabled: boolean): void {
  const current = readProjectMcpFile(projectPath)
  const mcpServers = current.mcpServers ?? {}

  if (enabled) {
    const row = getDb()
      .prepare('SELECT config FROM mcp_registry WHERE name = ?')
      .get(mcpName) as { config: string } | undefined
    if (!row) throw new Error(`MCP "${mcpName}" not found in registry`)
    mcpServers[mcpName] = JSON.parse(row.config)
  } else {
    delete mcpServers[mcpName]
  }

  writeProjectMcpFile(projectPath, { ...current, mcpServers })
}

// --- Registry helpers ---

export function getRegistryMcps(): Array<{ name: string; config: string; description: string; is_global: number }> {
  const db = getDb()
  return db.prepare('SELECT * FROM mcp_registry ORDER BY name').all() as Array<{ name: string; config: string; description: string; is_global: number }>
}

export function addRegistryMcp(name: string, config: string, description: string, isGlobal: boolean): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO mcp_registry (name, config, description, is_global) VALUES (?,?,?,?)').run(name, config, description, isGlobal ? 1 : 0)
}

// --- Usage from ~/.claude.json ---

export function getSessionUsage(projectPath?: string): {
  lastCost: number
  models: Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; costUSD: number }>
} | null {
  const claudeJson = readClaudeJson()

  // Try project-level first, then top-level
  let source: Record<string, unknown> = claudeJson
  if (projectPath) {
    const projects = (claudeJson.projects ?? {}) as Record<string, Record<string, unknown>>
    const normalized = projectPath.replace(/\\/g, '/')
    for (const [key, pdata] of Object.entries(projects)) {
      if (key.replace(/\\/g, '/').toLowerCase() === normalized.toLowerCase()) {
        source = pdata
        break
      }
    }
  }

  if (!source.lastCost && !source.lastModelUsage) return null

  return {
    lastCost: (source.lastCost as number) ?? 0,
    models: (source.lastModelUsage as Record<string, { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; costUSD: number }>) ?? {},
  }
}

// --- Project .mcp.json helpers (for agent spawning) ---

export function writeProjectMcpConfig(projectPath: string, mcpServers: Record<string, McpServerConfig>): void {
  const current = readProjectMcpFile(projectPath)
  writeProjectMcpFile(projectPath, { ...current, mcpServers })
}

export function readProjectMcpConfig(projectPath: string): Record<string, McpServerConfig> {
  return readProjectMcpFile(projectPath).mcpServers ?? {}
}

export function hasProjectMcpFile(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, '.mcp.json'))
}

function readProjectMcpFile(projectPath: string): { mcpServers?: Record<string, McpServerConfig>; [key: string]: unknown } {
  const mcpJsonPath = path.join(projectPath, '.mcp.json')
  if (!fs.existsSync(mcpJsonPath)) return {}

  try {
    return JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'))
  } catch {
    return {}
  }
}

function writeProjectMcpFile(
  projectPath: string,
  data: { mcpServers?: Record<string, McpServerConfig>; [key: string]: unknown },
): void {
  const mcpJsonPath = path.join(projectPath, '.mcp.json')
  fs.writeFileSync(mcpJsonPath, JSON.stringify(data, null, 2), 'utf8')
}

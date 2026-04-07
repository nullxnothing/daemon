// Manages MCP servers in Codex's ~/.codex/config.toml
// Codex stores MCPs under [mcp_servers.<name>] sections in TOML format.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'

interface CodexConfig {
  model?: string
  model_reasoning_effort?: string
  approvals_reviewer?: string
  mcp_servers?: Record<string, CodexMcpEntry>
  [key: string]: unknown
}

interface CodexMcpEntry {
  command: string
  args?: string[]
  env?: Record<string, string>
  disabled?: boolean
}

export interface CodexMcpListEntry {
  name: string
  config: { command: string; args?: string[]; env?: Record<string, string> }
  enabled: boolean
  source: 'codex'
}

const CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml')

function readConfig(): CodexConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {}
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
    return parseToml(raw) as CodexConfig
  } catch (err) {
    console.warn('[CodexMcpConfig] failed to parse config.toml:', (err as Error).message)
    return {}
  }
}

function writeConfig(config: CodexConfig): void {
  const dir = path.dirname(CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_PATH, stringifyToml(config), 'utf8')
}

export function getCodexMcps(): CodexMcpListEntry[] {
  const config = readConfig()
  const servers = config.mcp_servers ?? {}
  return Object.entries(servers).map(([name, entry]) => ({
    name,
    config: { command: entry.command, args: entry.args, env: entry.env },
    enabled: !entry.disabled,
    source: 'codex' as const,
  }))
}

export function toggleCodexMcp(name: string, enabled: boolean): void {
  const config = readConfig()
  if (!config.mcp_servers?.[name]) return

  if (enabled) {
    delete config.mcp_servers[name].disabled
  } else {
    config.mcp_servers[name].disabled = true
  }

  writeConfig(config)
}

export function addCodexMcp(name: string, command: string, args?: string[], env?: Record<string, string>): void {
  const config = readConfig()
  if (!config.mcp_servers) config.mcp_servers = {}

  config.mcp_servers[name] = { command }
  if (args && args.length > 0) config.mcp_servers[name].args = args
  if (env && Object.keys(env).length > 0) config.mcp_servers[name].env = env

  writeConfig(config)
}

export function removeCodexMcp(name: string): void {
  const config = readConfig()
  if (!config.mcp_servers?.[name]) return
  delete config.mcp_servers[name]
  writeConfig(config)
}

export function getCodexModel(): string {
  const config = readConfig()
  return config.model ?? 'gpt-5.4'
}

export function getCodexReasoningEffort(): string {
  const config = readConfig()
  return config.model_reasoning_effort ?? 'medium'
}

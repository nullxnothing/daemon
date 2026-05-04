import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { LogService } from './LogService'
import type { SkillEntry } from '../shared/types'

export type { SkillEntry }

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills')
const PLUGINS_FILE = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json')
const SETTINGS_LOCAL = path.join(CLAUDE_DIR, 'settings.local.json')

export function getAllSkillsAndPlugins(): SkillEntry[] {
  const result: SkillEntry[] = []

  // Skills from ~/.claude/skills/
  try {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        result.push({ name: entry.name, type: 'skill', enabled: true })
      }
    }
  } catch (err) {
    LogService.warn('SkillsConfig', 'failed to read skills directory: ' + (err as Error).message)
  }

  // Plugins from installed_plugins.json
  try {
    const data = JSON.parse(fs.readFileSync(PLUGINS_FILE, 'utf8'))
    const plugins = data.plugins ?? {}
    const disabledPlugins = getDisabledPlugins()

    for (const key of Object.keys(plugins)) {
      const name = key.split('@')[0] // "backend-development@claude-code-workflows" -> "backend-development"
      const isDisabled = disabledPlugins.has(key)
      result.push({ name, type: 'plugin', enabled: !isDisabled })
    }
  } catch (err) {
    LogService.warn('SkillsConfig', 'failed to read installed plugins: ' + (err as Error).message)
  }

  return result
}

function getDisabledPlugins(): Set<string> {
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_LOCAL, 'utf8'))
    const enabled = data.enabledPlugins ?? {}
    return new Set(
      Object.entries(enabled)
        .filter(([, v]) => v === false)
        .map(([k]) => k)
    )
  } catch {
    return new Set()
  }
}

import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/db'
import type { EnvVar, EnvFile, UnifiedKey, EnvDiff } from '../shared/types'

export type { EnvVar, EnvFile, UnifiedKey, EnvDiff }

const SECRET_PATTERNS: Array<{ pattern: string; label: string }> = [
  { pattern: 'sk-', label: 'sk-' },
  { pattern: '_KEY', label: '_KEY' },
  { pattern: '_TOKEN', label: '_TOKEN' },
  { pattern: '_SECRET', label: '_SECRET' },
  { pattern: 'PRIVATE', label: 'PRIV' },
  { pattern: 'PASSWORD', label: 'PASS' },
  { pattern: 'KEYPAIR', label: 'KEY' },
  { pattern: 'AUTH_', label: 'AUTH' },
  { pattern: 'CREDENTIAL', label: 'CRED' },
]

const ENV_FILE_NAMES = ['.env', '.env.local', '.env.production', '.env.staging', '.env.development']

export function detectSecret(key: string): { isSecret: boolean; label: string | null } {
  const upper = key.toUpperCase()
  for (const { pattern, label } of SECRET_PATTERNS) {
    if (upper.includes(pattern.toUpperCase())) return { isSecret: true, label }
  }
  return { isSecret: false, label: null }
}

export function parseEnvFile(filePath: string): EnvVar[] {
  if (!fs.existsSync(filePath)) return []

  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const vars: EnvVar[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      vars.push({ key: '', value: '', isComment: true, isSecret: false, secretLabel: null, lineIndex: i, raw })
      continue
    }

    // Handle export prefix
    const line = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) {
      vars.push({ key: '', value: '', isComment: true, isSecret: false, secretLabel: null, lineIndex: i, raw })
      continue
    }

    const key = line.slice(0, eqIdx).trim()
    let value = line.slice(eqIdx + 1).trim()

    // Strip surrounding quotes (must be at least 2 chars: "" or '')
    if (value.length >= 2) {
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
    }

    const secret = detectSecret(key)
    vars.push({ key, value, isComment: false, isSecret: secret.isSecret, secretLabel: secret.label, lineIndex: i, raw })
  }

  return vars
}

export function scanProjectEnvFiles(projectPath: string): EnvFile[] {
  const files: EnvFile[] = []

  for (const name of ENV_FILE_NAMES) {
    const filePath = path.join(projectPath, name)
    if (fs.existsSync(filePath)) {
      files.push({
        filePath,
        fileName: name,
        vars: parseEnvFile(filePath),
      })
    }
  }

  return files
}

export function scanAllProjects(): UnifiedKey[] {
  const db = getDb()
  const projects = db.prepare('SELECT id, name, path FROM projects').all() as Array<{ id: string; name: string; path: string }>

  const keyMap = new Map<string, UnifiedKey>()

  for (const project of projects) {
    const envFiles = scanProjectEnvFiles(project.path)

    for (const envFile of envFiles) {
      for (const v of envFile.vars) {
        if (v.isComment || !v.key) continue

        if (!keyMap.has(v.key)) {
          keyMap.set(v.key, {
            key: v.key,
            isSecret: v.isSecret,
            secretLabel: v.secretLabel,
            projects: [],
          })
        }

        keyMap.get(v.key)!.projects.push({
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path,
          filePath: envFile.filePath,
          value: v.value,
        })
      }
    }
  }

  // Sort by number of projects (most used first)
  return Array.from(keyMap.values()).sort((a, b) => b.projects.length - a.projects.length)
}

export function writeEnvVar(filePath: string, key: string, newValue: string): void {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  let found = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const line = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed
    const eqIdx = line.indexOf('=')
    if (eqIdx === -1) continue

    const k = line.slice(0, eqIdx).trim()
    if (k === key) {
      // Preserve the original format (export prefix, quotes)
      const hasExport = trimmed.startsWith('export ')
      const prefix = hasExport ? 'export ' : ''
      // Quote if value has spaces, special chars, or quotes
      const escaped = newValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const needsQuote = newValue.includes(' ') || newValue.includes('#') || newValue.includes('"')
      const quotedValue = needsQuote ? `"${escaped}"` : newValue
      lines[i] = `${prefix}${key}=${quotedValue}`
      found = true
      break
    }
  }

  if (!found) {
    // Append to end
    lines.push(`${key}=${newValue}`)
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
}

export function addEnvVar(filePath: string, key: string, value: string): void {
  let content = ''
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8')
    if (!content.endsWith('\n')) content += '\n'
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const needsQuote = value.includes(' ') || value.includes('#') || value.includes('"')
  const quotedValue = needsQuote ? `"${escaped}"` : value
  content += `${key}=${quotedValue}\n`
  fs.writeFileSync(filePath, content, 'utf8')
}

export function deleteEnvVar(filePath: string, key: string): void {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const filtered = lines.filter((line) => {
    const trimmed = line.trim()
    const l = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed
    const eqIdx = l.indexOf('=')
    if (eqIdx === -1) return true
    return l.slice(0, eqIdx).trim() !== key
  })
  fs.writeFileSync(filePath, filtered.join('\n'), 'utf8')
}

export function diffProjects(pathA: string, pathB: string): EnvDiff {
  const varsA = new Map<string, string>()
  const varsB = new Map<string, string>()

  for (const file of scanProjectEnvFiles(pathA)) {
    for (const v of file.vars) {
      if (!v.isComment && v.key) varsA.set(v.key, v.value)
    }
  }

  for (const file of scanProjectEnvFiles(pathB)) {
    for (const v of file.vars) {
      if (!v.isComment && v.key) varsB.set(v.key, v.value)
    }
  }

  const onlyA: EnvDiff['onlyA'] = []
  const onlyB: EnvDiff['onlyB'] = []
  const same: EnvDiff['same'] = []
  const different: EnvDiff['different'] = []

  for (const [key, value] of varsA) {
    if (!varsB.has(key)) {
      onlyA.push({ key, value })
    } else if (varsB.get(key) === value) {
      same.push({ key, value })
    } else {
      different.push({ key, valueA: value, valueB: varsB.get(key)! })
    }
  }

  for (const [key, value] of varsB) {
    if (!varsA.has(key)) {
      onlyB.push({ key, value })
    }
  }

  return { onlyA, onlyB, same, different }
}

export function propagateVar(key: string, value: string, projectPaths: string[]): number {
  let updated = 0
  for (const projectPath of projectPaths) {
    const resolved = path.resolve(projectPath)
    const envPath = path.join(resolved, '.env')
    // Ensure the .env path stays within the project directory
    if (!envPath.startsWith(resolved + path.sep)) continue
    if (fs.existsSync(envPath)) {
      writeEnvVar(envPath, key, value)
    } else {
      addEnvVar(envPath, key, value)
    }
    updated++
  }
  return updated
}

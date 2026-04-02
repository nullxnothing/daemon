import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getDb } from '../db/db'
import type { ToolRow, ToolCreateInput, ToolManifest, ToolRunStatus } from '../shared/types'

const TOOLS_DIR_NAME = 'tools'
const runningTools = new Map<string, { terminalId: string; pid: number; startedAt: number }>()

function getToolsDir(): string {
  const dir = path.join(app.getPath('userData'), TOOLS_DIR_NAME)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

const ENTRYPOINT_TEMPLATES: Record<string, { file: string; content: string }> = {
  typescript: {
    file: 'index.ts',
    content: `// Tool: {{name}}
// Run with: npx tsx index.ts

async function main() {
  console.log('Running {{name}}...')
  // Your tool logic here
}

main().catch(console.error)
`,
  },
  javascript: {
    file: 'index.js',
    content: `// Tool: {{name}}

async function main() {
  console.log('Running {{name}}...')
  // Your tool logic here
}

main().catch(console.error)
`,
  },
  python: {
    file: 'main.py',
    content: `# Tool: {{name}}

def main():
    print("Running {{name}}...")
    # Your tool logic here

if __name__ == "__main__":
    main()
`,
  },
  shell: {
    file: 'run.sh',
    content: `#!/bin/bash
# Tool: {{name}}

echo "Running {{name}}..."
# Your tool logic here
`,
  },
}

export function listTools(): ToolRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM tools ORDER BY sort_order, name').all() as ToolRow[]
}

export function getTool(id: string): ToolRow | null {
  const db = getDb()
  return (db.prepare('SELECT * FROM tools WHERE id = ?').get(id) as ToolRow) ?? null
}

export function scaffoldTool(input: ToolCreateInput): ToolRow {
  const language = input.language ?? 'typescript'
  const template = ENTRYPOINT_TEMPLATES[language] ?? ENTRYPOINT_TEMPLATES.typescript
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const toolDir = path.join(getToolsDir(), slug)

  if (fs.existsSync(toolDir)) throw new Error(`Tool directory already exists: ${slug}`)
  fs.mkdirSync(toolDir, { recursive: true })

  const manifest: ToolManifest = {
    name: input.name,
    description: input.description ?? '',
    version: '1.0.0',
    category: input.category ?? 'general',
    language,
    entrypoint: template.file,
  }

  fs.writeFileSync(path.join(toolDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  fs.writeFileSync(
    path.join(toolDir, template.file),
    template.content.replace(/\{\{name\}\}/g, input.name),
    'utf8',
  )

  const db = getDb()
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO tools (id, name, description, category, language, entrypoint, tool_path, tags) VALUES (?,?,?,?,?,?,?,?)'
  ).run(id, input.name, input.description ?? null, manifest.category, language, template.file, toolDir, '[]')

  return db.prepare('SELECT * FROM tools WHERE id = ?').get(id) as ToolRow
}

export function importTool(folderPath: string): ToolRow {
  const manifestPath = path.join(folderPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error('No manifest.json found in tool directory')

  const manifest: ToolManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!manifest.name || !manifest.entrypoint) throw new Error('Invalid manifest: missing name or entrypoint')

  // Prevent path traversal via entrypoint — must resolve within the tool folder
  const resolvedFolder = path.resolve(folderPath)
  const entrypointPath = path.resolve(folderPath, manifest.entrypoint)
  if (!entrypointPath.startsWith(resolvedFolder + path.sep)) {
    throw new Error('Invalid entrypoint: path traversal detected')
  }
  if (!fs.existsSync(entrypointPath)) throw new Error(`Entrypoint not found: ${manifest.entrypoint}`)

  const db = getDb()
  const existing = db.prepare('SELECT id FROM tools WHERE tool_path = ?').get(folderPath)
  if (existing) throw new Error('Tool already imported from this directory')

  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO tools (id, name, description, category, language, entrypoint, tool_path, version, author, tags) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).run(
    id, manifest.name, manifest.description ?? null, manifest.category ?? 'general',
    manifest.language ?? 'typescript', manifest.entrypoint, folderPath,
    manifest.version ?? '1.0.0', manifest.author ?? null, JSON.stringify(manifest.tags ?? []),
  )

  return db.prepare('SELECT * FROM tools WHERE id = ?').get(id) as ToolRow
}

export function discoverTools(): ToolRow[] {
  const toolsDir = getToolsDir()
  const db = getDb()
  const imported: ToolRow[] = []

  const entries = fs.readdirSync(toolsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const toolDir = path.join(toolsDir, entry.name)
    const manifestPath = path.join(toolDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue

    const existing = db.prepare('SELECT id FROM tools WHERE tool_path = ?').get(toolDir)
    if (existing) continue

    try {
      imported.push(importTool(toolDir))
    } catch (err) {
      console.warn('[ToolService] failed to import tool from', toolDir + ':', (err as Error).message)
    }
  }

  return imported
}

export function updateTool(id: string, data: Record<string, unknown>): ToolRow {
  const db = getDb()
  const allowed = new Set(['name', 'description', 'category', 'language', 'entrypoint', 'icon', 'version', 'author', 'tags', 'config', 'enabled', 'sort_order'])
  const fields = Object.keys(data).filter((k) => allowed.has(k))
  if (fields.length === 0) throw new Error('No valid fields to update')

  // H-01: guard against column name injection by validating each field name
  const COLUMN_NAME_RE = /^[a-z_]+$/
  for (const f of fields) {
    if (!COLUMN_NAME_RE.test(f)) throw new Error(`Invalid column name: ${f}`)
  }

  const sets = fields.map((f) => `${f} = ?`).join(', ')
  const values = fields.map((f) => {
    const v = data[f]
    return typeof v === 'object' ? JSON.stringify(v) : v
  })
  db.prepare(`UPDATE tools SET ${sets} WHERE id = ?`).run(...values, id)
  return db.prepare('SELECT * FROM tools WHERE id = ?').get(id) as ToolRow
}

export function deleteTool(id: string, removeFiles = false): void {
  const db = getDb()
  if (removeFiles) {
    const tool = db.prepare('SELECT tool_path FROM tools WHERE id = ?').get(id) as { tool_path: string } | undefined
    if (tool?.tool_path && fs.existsSync(tool.tool_path)) {
      fs.rmSync(tool.tool_path, { recursive: true, force: true })
    }
  }
  db.prepare('DELETE FROM tools WHERE id = ?').run(id)
}

export function buildRunCommand(tool: ToolRow): { command: string; args: string[] } {
  switch (tool.language) {
    case 'typescript':
      return { command: 'npx', args: ['tsx', tool.entrypoint] }
    case 'javascript':
      return { command: 'node', args: [tool.entrypoint] }
    case 'python':
      return { command: 'python', args: [tool.entrypoint] }
    case 'shell':
      return process.platform === 'win32'
        ? { command: 'powershell', args: ['-File', tool.entrypoint] }
        : { command: 'bash', args: [tool.entrypoint] }
    default:
      return { command: 'node', args: [tool.entrypoint] }
  }
}

export function markToolRun(id: string): void {
  const db = getDb()
  db.prepare('UPDATE tools SET last_run_at = ?, run_count = run_count + 1 WHERE id = ?').run(Date.now(), id)
}

export function setRunning(toolId: string, terminalId: string, pid: number): void {
  runningTools.set(toolId, { terminalId, pid, startedAt: Date.now() })
}

export function clearRunning(toolId: string): void {
  runningTools.delete(toolId)
}

export function getRunStatus(toolId: string): ToolRunStatus {
  const entry = runningTools.get(toolId)
  if (!entry) return { running: false, terminalId: null, pid: null, startedAt: null }
  return { running: true, terminalId: entry.terminalId, pid: entry.pid, startedAt: entry.startedAt }
}

export function getToolsBasePath(): string {
  return getToolsDir()
}

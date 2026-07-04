import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { CLAUDE_MODEL_IDS } from '../../packages/shared/src/constants'
import type { ClaudeAgentFile } from '../shared/types'

export type { ClaudeAgentFile }

const AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents')

export function listClaudeAgents(): ClaudeAgentFile[] {
  if (!fs.existsSync(AGENTS_DIR)) return []

  const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
  const agents: ClaudeAgentFile[] = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const filePath = path.join(AGENTS_DIR, entry.name)
    const parsed = parseClaudeAgentFile(filePath)
    if (parsed) agents.push(parsed)
  }

  agents.sort((a, b) => a.name.localeCompare(b.name))
  return agents
}

function parseClaudeAgentFile(filePath: string): ClaudeAgentFile | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const { frontmatter, body } = splitFrontmatter(raw)
    const meta = parseSimpleFrontmatter(frontmatter)
    const fallbackName = path.basename(filePath, '.md')

    return {
      id: fallbackName,
      name: meta.name ?? fallbackName,
      description: meta.description ?? '',
      model: normalizeModel(meta.model),
      color: meta.color ?? null,
      filePath,
      systemPrompt: body.trim(),
    }
  } catch {
    return null
  }
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  if (!raw.startsWith('---')) return { frontmatter: '', body: raw }

  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { frontmatter: '', body: raw }

  const frontmatter = raw.slice(4, end).trim()
  const body = raw.slice(end + 4).trimStart()
  return { frontmatter, body }
}

function parseSimpleFrontmatter(frontmatter: string): Record<string, string> {
  const result: Record<string, string> = {}

  for (const line of frontmatter.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }

  return result
}

function normalizeModel(model: string | undefined): string {
  switch ((model ?? '').toLowerCase()) {
    case 'opus':
      return CLAUDE_MODEL_IDS.opus
    case 'sonnet':
      return CLAUDE_MODEL_IDS.sonnet
    case 'haiku':
      return CLAUDE_MODEL_IDS.haiku
    default:
      return model && model.length > 0 ? model : CLAUDE_MODEL_IDS.sonnet
  }
}

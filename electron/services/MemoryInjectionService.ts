import { isSecretClass, listMemories, recordUsage } from './MemoryService'
import type { MemoryContextBundle, MemoryKind, ProjectMemory } from '../shared/types'

const DEFAULT_CHAR_BUDGET = 1500

// Injection priority (highest first). Anything not listed sorts after these, by confidence.
const KIND_PRIORITY: MemoryKind[] = [
  'constraint',
  'do_not_touch',
  'security_note',
  'test_command',
  'build_command',
  'dev_command',
  'command',
  'package_manager',
  'stack',
  'rpc_context',
  'wallet_context',
  'deployment_target',
  'mcp_config',
  'prior_failure',
  'prior_fix',
  'decision',
  'project_summary',
  'style_preference',
]

function priorityOf(kind: MemoryKind): number {
  const i = KIND_PRIORITY.indexOf(kind)
  return i === -1 ? KIND_PRIORITY.length : i
}

/**
 * Pure selection + formatting. Takes approved memories, drops secret classes (defense in
 * depth — they should never be approved), orders by priority then confidence, and packs
 * into a char-budgeted block. Returns the block plus the ids actually included.
 */
export function buildBundle(
  memories: ProjectMemory[],
  charBudget = DEFAULT_CHAR_BUDGET,
): MemoryContextBundle {
  const safe = memories
    .filter((m) => m.status === 'approved' && !isSecretClass(m.privacyClass))
    .sort((a, b) => priorityOf(a.kind) - priorityOf(b.kind) || b.confidence - a.confidence)

  const lines: string[] = []
  const usedMemoryIds: string[] = []
  let used = 0
  for (const m of safe) {
    const line = `${labelFor(m.kind)}: ${m.value} (source: ${m.sourceType})`
    if (used + line.length + 1 > charBudget) break
    lines.push(line)
    usedMemoryIds.push(m.id)
    used += line.length + 1
  }

  if (lines.length === 0) return { block: '', usedMemoryIds: [], totalChars: 0 }

  const block = ['--- DAEMON MEMORY ---', ...lines, '--- END DAEMON MEMORY ---'].join('\n')
  return { block, usedMemoryIds, totalChars: block.length }
}

function labelFor(kind: MemoryKind): string {
  switch (kind) {
    case 'do_not_touch': return 'Do not touch'
    case 'test_command': return 'Known-good test'
    case 'build_command': return 'Build command'
    case 'dev_command': return 'Dev command'
    case 'package_manager': return 'Package manager'
    case 'prior_failure': return 'Prior failure'
    case 'prior_fix': return 'Prior fix'
    case 'rpc_context': return 'RPC'
    case 'wallet_context': return 'Wallet'
    case 'deployment_target': return 'Deploy target'
    case 'security_note': return 'Security'
    case 'project_summary': return 'Project'
    default: return kind.replace(/_/g, ' ')
  }
}

/**
 * Effectful: build the bundle for a project's approved memories and record a usage event
 * for each memory that was actually injected, so receipts can show provenance.
 */
export function buildContextBundle(
  projectId: string | null,
  opts: { charBudget?: number; sessionRef?: string | null; usedIn?: string } = {},
): MemoryContextBundle {
  const approved = listMemories(projectId, { status: 'approved' })
  const bundle = buildBundle(approved, opts.charBudget ?? DEFAULT_CHAR_BUDGET)
  for (const id of bundle.usedMemoryIds) {
    recordUsage(id, projectId, opts.usedIn ?? 'agent_prompt', opts.sessionRef ?? null)
  }
  return bundle
}

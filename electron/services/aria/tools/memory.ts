/**
 * Project-memory tools for the operator. Wrap MemoryService CRUD so ARIA can be
 * told to remember a durable fact, recall what it knows, and forget/correct.
 *
 * Storage + privacy gating live in MemoryService — `assertSafeMemoryValue` rejects
 * secret material, so an operator cannot persist an API key even if asked to. These
 * tools never hard-delete (forget = archive).
 */
import * as MemoryService from '../../MemoryService'
import type { AriaTool } from '../AriaTool'
import type { MemoryKind } from '../../../shared/types'

// Kinds the operator may assign. Mirrors MemoryKind; we validate against it so a
// model-supplied kind can't write an unknown value.
const MEMORY_KINDS: readonly MemoryKind[] = [
  'project_summary', 'stack', 'package_manager', 'command', 'test_command',
  'build_command', 'dev_command', 'mcp_config', 'wallet_context', 'rpc_context',
  'decision', 'constraint', 'do_not_touch', 'prior_failure', 'prior_fix',
  'deployment_target', 'security_note', 'style_preference',
]

function coerceKind(value: unknown): MemoryKind {
  return MEMORY_KINDS.includes(value as MemoryKind) ? (value as MemoryKind) : 'decision'
}

export const memoryTools: AriaTool[] = [
  {
    name: 'remember_fact',
    description: 'Store a durable project fact (a decision, constraint, command, or preference) so future sessions recall it. Use when the user says to remember something, or when a stable fact about how this project works is established. Never store secrets — keys, seed phrases, and credentials are rejected.',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short label, e.g. "Package manager".' },
        value: { type: 'string', description: 'The fact itself, e.g. "Use pnpm, never npm".' },
        kind: { type: 'string', description: `One of: ${MEMORY_KINDS.join(', ')}. Defaults to decision.` },
      },
      required: ['title', 'value'],
    },
    async handler(input, ctx) {
      const title = String(input.title ?? '').trim()
      const value = String(input.value ?? '').trim()
      if (!title || !value) return { ok: false, summary: 'A title and value are required.' }
      try {
        const mem = MemoryService.createSuggestion({
          projectId: ctx.snapshot.activeProjectId,
          kind: coerceKind(input.kind),
          title,
          value,
          sourceType: 'operator',
          sourceRef: ctx.sessionId,
          confidence: 0.9,
          createdBy: 'agent',
        })
        // Operator-authored facts are trusted enough to approve immediately so the
        // next turn can use them; the privacy guard already ran in createSuggestion.
        MemoryService.approveMemory(mem.id, 'operator')
        return { ok: true, summary: `Remembered: ${title}.`, data: { id: mem.id } }
      } catch (err) {
        return { ok: false, summary: (err as Error).message }
      }
    },
  },
  {
    name: 'recall_memories',
    description: 'List the durable facts already stored for this project (what the assistant "knows"). Use to answer questions like "what do you know about this project?" or before assuming a convention.',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: {} },
    async handler(_input, ctx) {
      const memories = MemoryService.listMemories(ctx.snapshot.activeProjectId, { status: 'approved' })
      if (memories.length === 0) return { ok: true, summary: 'No stored facts yet for this project.', data: { memories: [] } }
      const list = memories.map((m) => ({ id: m.id, kind: m.kind, title: m.title, value: m.value }))
      return { ok: true, summary: `${memories.length} stored fact${memories.length === 1 ? '' : 's'}.`, data: { memories: list } }
    },
  },
  {
    name: 'forget_memory',
    description: 'Archive a stored fact by id so it is no longer recalled or injected. Use recall_memories first to find the id. This is reversible (archive, not delete).',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    async handler(input) {
      const id = String(input.id ?? '').trim()
      if (!id) return { ok: false, summary: 'A memory id is required.' }
      try {
        const mem = MemoryService.archiveMemory(id)
        return { ok: true, summary: `Forgot: ${mem.title}.` }
      } catch (err) {
        return { ok: false, summary: (err as Error).message }
      }
    },
  },
  {
    name: 'update_memory',
    description: 'Correct a stored fact by id — change its title or value. Use recall_memories first to find the id.',
    kind: 'edit',
    risk: 'write',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['id'],
    },
    async handler(input) {
      const id = String(input.id ?? '').trim()
      if (!id) return { ok: false, summary: 'A memory id is required.' }
      const patch: { title?: string; value?: string } = {}
      if (typeof input.title === 'string' && input.title.trim()) patch.title = input.title.trim()
      if (typeof input.value === 'string' && input.value.trim()) patch.value = input.value.trim()
      if (!patch.title && !patch.value) return { ok: false, summary: 'Provide a new title or value.' }
      try {
        const mem = MemoryService.updateMemory(id, patch)
        return { ok: true, summary: `Updated: ${mem.title}.` }
      } catch (err) {
        return { ok: false, summary: (err as Error).message }
      }
    },
  },
]

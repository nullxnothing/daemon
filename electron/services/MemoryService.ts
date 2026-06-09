import crypto from 'node:crypto'
import { getDb } from '../db/db'
import { redactText, type PrivacyDataClass } from '../security/PrivacyGuard'
import type {
  KnowledgeItem,
  MemoryPrivacyClass,
  MemoryStatus,
  MemorySuggestionInput,
  MemoryUpdateInput,
  ProjectMemory,
} from '../shared/types'

// Privacy classes that must never be stored as memory or injected into a prompt.
// Kept here as the single source of truth; MemoryInjectionService imports it.
export const SECRET_PRIVACY_CLASSES: ReadonlySet<MemoryPrivacyClass> = new Set([
  'env_secret',
  'wallet_secret',
  'financial_tx',
  'personal_data',
])

export function isSecretClass(privacyClass: MemoryPrivacyClass): boolean {
  return SECRET_PRIVACY_CLASSES.has(privacyClass)
}

/**
 * A memory value is unsafe if its declared class is a secret class OR the value
 * itself redacts to something (i.e. PrivacyGuard found a secret in it). Defense in
 * depth: even a value labelled project_code is rejected if it carries a live secret.
 */
export function assertSafeMemoryValue(privacyClass: MemoryPrivacyClass, value: string): void {
  if (isSecretClass(privacyClass)) {
    throw new Error(`Refusing to store memory with secret privacy class "${privacyClass}".`)
  }
  const { findings } = redactText(value)
  if (findings.length > 0) {
    throw new Error('Refusing to store memory: value contains secret-like material.')
  }
}

interface MemoryRow {
  id: string
  project_id: string | null
  scope: string
  kind: string
  title: string
  value: string
  source_type: string
  source_ref: string
  confidence: number
  status: string
  privacy_class: string
  tags_json: string
  created_by: string
  approved_by: string | null
  last_used_at: number | null
  expires_at: number | null
  created_at: number
  updated_at: number
}

export function rowToMemory(row: MemoryRow): ProjectMemory {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(row.tags_json) as unknown
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string')
  } catch { /* malformed tags -> empty */ }
  return {
    id: row.id,
    projectId: row.project_id,
    scope: row.scope as ProjectMemory['scope'],
    kind: row.kind as ProjectMemory['kind'],
    title: row.title,
    value: row.value,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    confidence: row.confidence,
    status: row.status as MemoryStatus,
    privacyClass: row.privacy_class as MemoryPrivacyClass,
    tags,
    createdBy: row.created_by as ProjectMemory['createdBy'],
    approvedBy: row.approved_by,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface ListOptions {
  status?: MemoryStatus
  kind?: ProjectMemory['kind']
}

export function listMemories(projectId: string | null, opts: ListOptions = {}): ProjectMemory[] {
  const clauses: string[] = []
  const params: unknown[] = []
  if (projectId === null) {
    clauses.push('project_id IS NULL')
  } else {
    clauses.push('project_id = ?')
    params.push(projectId)
  }
  if (opts.status) { clauses.push('status = ?'); params.push(opts.status) }
  if (opts.kind) { clauses.push('kind = ?'); params.push(opts.kind) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(`SELECT * FROM project_memories ${where} ORDER BY updated_at DESC`)
    .all(...params) as MemoryRow[]
  return rows.map(rowToMemory)
}

/**
 * Approved memories for the "What I know" view, enriched with a usage count from
 * memory_usage_events. Sorted by how proven they are (confidence, then recent use) so
 * the knowledge base reads strongest-first.
 */
export function listKnowledge(projectId: string | null): KnowledgeItem[] {
  const projectClause = projectId === null ? 'm.project_id IS NULL' : 'm.project_id = ?'
  const params = projectId === null ? [] : [projectId]
  const rows = getDb()
    .prepare(
      `SELECT m.id, m.kind, m.title, m.value, m.confidence, m.source_type,
              m.created_at, m.last_used_at,
              (SELECT COUNT(*) FROM memory_usage_events e WHERE e.memory_id = m.id) AS usage_count
       FROM project_memories m
       WHERE m.status = 'approved' AND ${projectClause}
       ORDER BY m.confidence DESC, m.last_used_at DESC NULLS LAST, m.created_at DESC`,
    )
    .all(...params) as Array<{
      id: string; kind: string; title: string; value: string; confidence: number
      source_type: string; created_at: number; last_used_at: number | null; usage_count: number
    }>
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as KnowledgeItem['kind'],
    title: r.title,
    value: r.value,
    confidence: r.confidence,
    sourceType: r.source_type,
    usageCount: r.usage_count,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }))
}

export function getMemory(id: string): ProjectMemory | null {
  const row = getDb().prepare('SELECT * FROM project_memories WHERE id = ?').get(id) as MemoryRow | undefined
  return row ? rowToMemory(row) : null
}

/**
 * Create a suggested (or directly-approved) memory. Rejects secret material. Dedupes
 * against an existing non-rejected row with the same (project_id, kind, value): if one
 * exists it is returned unchanged rather than inserting a duplicate.
 */
export function createSuggestion(input: MemorySuggestionInput): ProjectMemory {
  const privacyClass = input.privacyClass ?? 'project_code'
  assertSafeMemoryValue(privacyClass, input.value)

  const db = getDb()
  const existing = db
    .prepare(
      `SELECT * FROM project_memories
       WHERE kind = ? AND value = ? AND status != 'rejected'
         AND (project_id IS ? OR project_id = ?)
       LIMIT 1`,
    )
    .get(input.kind, input.value, input.projectId, input.projectId) as MemoryRow | undefined
  if (existing) return rowToMemory(existing)

  const now = Date.now()
  const id = `mem_${crypto.randomUUID()}`
  db.prepare(
    `INSERT INTO project_memories
       (id, project_id, scope, kind, title, value, source_type, source_ref,
        confidence, status, privacy_class, tags_json, created_by, approved_by,
        last_used_at, expires_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.projectId,
    input.scope ?? 'project',
    input.kind,
    input.title,
    input.value,
    input.sourceType,
    input.sourceRef,
    input.confidence ?? 0.5,
    'suggested',
    privacyClass,
    JSON.stringify(input.tags ?? []),
    input.createdBy ?? 'extractor',
    null,
    null,
    null,
    now,
    now,
  )
  return getMemory(id) as ProjectMemory
}

export function approveMemory(id: string, approvedBy = 'user'): ProjectMemory {
  const memory = getMemory(id)
  if (!memory) throw new Error(`Memory ${id} not found`)
  // Re-validate on approval — the value or class may have been edited since suggestion.
  assertSafeMemoryValue(memory.privacyClass, memory.value)
  getDb()
    .prepare(
      `UPDATE project_memories SET status = 'approved', approved_by = ?, updated_at = ? WHERE id = ?`,
    )
    .run(approvedBy, Date.now(), id)
  return getMemory(id) as ProjectMemory
}

export function rejectMemory(id: string): ProjectMemory {
  getDb()
    .prepare(`UPDATE project_memories SET status = 'rejected', updated_at = ? WHERE id = ?`)
    .run(Date.now(), id)
  const memory = getMemory(id)
  if (!memory) throw new Error(`Memory ${id} not found`)
  return memory
}

export function archiveMemory(id: string): ProjectMemory {
  getDb()
    .prepare(`UPDATE project_memories SET status = 'archived', updated_at = ? WHERE id = ?`)
    .run(Date.now(), id)
  const memory = getMemory(id)
  if (!memory) throw new Error(`Memory ${id} not found`)
  return memory
}

export function updateMemory(id: string, patch: MemoryUpdateInput): ProjectMemory {
  const current = getMemory(id)
  if (!current) throw new Error(`Memory ${id} not found`)
  const nextValue = patch.value ?? current.value
  // If the value changes, re-run the secret check against the (possibly new) class.
  if (patch.value !== undefined) assertSafeMemoryValue(current.privacyClass, nextValue)

  const sets: string[] = []
  const params: unknown[] = []
  if (patch.title !== undefined) { sets.push('title = ?'); params.push(patch.title) }
  if (patch.value !== undefined) { sets.push('value = ?'); params.push(patch.value) }
  if (patch.kind !== undefined) { sets.push('kind = ?'); params.push(patch.kind) }
  if (patch.confidence !== undefined) { sets.push('confidence = ?'); params.push(patch.confidence) }
  if (patch.tags !== undefined) { sets.push('tags_json = ?'); params.push(JSON.stringify(patch.tags)) }
  sets.push('updated_at = ?'); params.push(Date.now())
  params.push(id)
  getDb().prepare(`UPDATE project_memories SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return getMemory(id) as ProjectMemory
}

export function deleteMemory(id: string): void {
  getDb().prepare('DELETE FROM project_memories WHERE id = ?').run(id)
}

// Each use nudges confidence up a small step (capped) so frequently-recalled facts
// float to the top of injection priority and the knowledge view — the "smarter every
// week" mechanic. Tuned small so a single use doesn't overweight an unverified fact.
const CONFIDENCE_REINFORCE_STEP = 0.02
const CONFIDENCE_CAP = 1

export function recordUsage(
  memoryId: string,
  projectId: string | null,
  usedIn: string,
  sessionRef: string | null = null,
): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO memory_usage_events (id, memory_id, project_id, used_in, session_ref, created_at)
     VALUES (?,?,?,?,?,?)`,
  ).run(`use_${crypto.randomUUID()}`, memoryId, projectId, usedIn, sessionRef, now)
  db.prepare(
    `UPDATE project_memories
       SET last_used_at = ?, confidence = MIN(?, confidence + ?)
     WHERE id = ?`,
  ).run(now, CONFIDENCE_CAP, CONFIDENCE_REINFORCE_STEP, memoryId)
}

// Type guard used by callers that receive an unknown privacy class from the renderer.
export function isPrivacyDataClass(value: string): value is PrivacyDataClass {
  return [
    'public', 'project_code', 'env_secret', 'wallet_secret', 'email_body',
    'browser_content', 'personal_data', 'financial_tx', 'onchain_receipt',
  ].includes(value)
}

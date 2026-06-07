import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/db/db', () => ({ getDb: vi.fn() }))

import { getDb } from '../../electron/db/db'
import {
  approveMemory,
  assertSafeMemoryValue,
  createSuggestion,
  isSecretClass,
  listMemories,
  rejectMemory,
  rowToMemory,
} from '../../electron/services/MemoryService'

// Minimal in-memory stand-in for the better-sqlite3 surface the service uses.
// Avoids loading the Electron-ABI native module under vitest's plain-Node runtime.
interface Row { [k: string]: unknown }
class FakeDb {
  rows: Row[] = []
  prepare(sql: string) {
    const s = sql.trim()
    return {
      run: (...params: unknown[]) => {
        if (s.startsWith('INSERT INTO project_memories')) {
          const cols = [
            'id', 'project_id', 'scope', 'kind', 'title', 'value', 'source_type', 'source_ref',
            'confidence', 'status', 'privacy_class', 'tags_json', 'created_by', 'approved_by',
            'last_used_at', 'expires_at', 'created_at', 'updated_at',
          ]
          const row: Row = {}
          cols.forEach((c, i) => { row[c] = params[i] })
          this.rows.push(row)
        } else if (s.startsWith("UPDATE project_memories SET status = 'approved'")) {
          const [approvedBy, updatedAt, id] = params
          const row = this.rows.find((r) => r.id === id)
          if (row) { row.status = 'approved'; row.approved_by = approvedBy; row.updated_at = updatedAt }
        } else if (s.startsWith("UPDATE project_memories SET status = 'rejected'")) {
          const [, id] = params
          const row = this.rows.find((r) => r.id === id)
          if (row) row.status = 'rejected'
        }
        return { changes: 1 }
      },
      get: (...params: unknown[]) => {
        if (s.startsWith('SELECT * FROM project_memories WHERE id = ?')) {
          return this.rows.find((r) => r.id === params[0])
        }
        if (s.startsWith('SELECT * FROM project_memories\n       WHERE kind = ?') ||
            s.startsWith('SELECT * FROM project_memories WHERE kind = ?')) {
          const [kind, value] = params
          return this.rows.find(
            (r) => r.kind === kind && r.value === value && r.status !== 'rejected',
          )
        }
        return undefined
      },
      all: () => this.rows,
    }
  }
}

let fake: FakeDb
beforeEach(() => {
  fake = new FakeDb()
  ;(getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fake)
})

describe('MemoryService secret guards', () => {
  it('flags secret privacy classes', () => {
    expect(isSecretClass('env_secret')).toBe(true)
    expect(isSecretClass('wallet_secret')).toBe(true)
    expect(isSecretClass('financial_tx')).toBe(true)
    expect(isSecretClass('personal_data')).toBe(true)
    expect(isSecretClass('project_code')).toBe(false)
    expect(isSecretClass('public')).toBe(false)
  })

  it('rejects a secret-classed value', () => {
    expect(() => assertSafeMemoryValue('env_secret', 'pnpm test')).toThrow(/secret privacy class/)
  })

  it('rejects a project_code value that carries a live secret', () => {
    expect(() =>
      assertSafeMemoryValue('project_code', 'API_KEY=sk-ant-aaaaaaaaaaaaaaaaaaaaaaaa'),
    ).toThrow(/secret-like material/)
  })

  it('allows a clean project_code value', () => {
    expect(() => assertSafeMemoryValue('project_code', 'pnpm run typecheck')).not.toThrow()
  })
})

describe('MemoryService CRUD', () => {
  it('creates a suggestion and approves it', () => {
    const created = createSuggestion({
      projectId: 'p1',
      kind: 'test_command',
      title: 'Known-good test command',
      value: 'pnpm test',
      sourceType: 'package_script',
      sourceRef: 'package.json:scripts.test',
    })
    expect(created.status).toBe('suggested')
    expect(created.kind).toBe('test_command')

    const approved = approveMemory(created.id, 'user')
    expect(approved.status).toBe('approved')
    expect(approved.approvedBy).toBe('user')
  })

  it('dedupes identical (project, kind, value) suggestions', () => {
    const a = createSuggestion({
      projectId: 'p1', kind: 'package_manager', title: 'pnpm', value: 'pnpm',
      sourceType: 'lockfile', sourceRef: 'pnpm-lock.yaml',
    })
    const b = createSuggestion({
      projectId: 'p1', kind: 'package_manager', title: 'pnpm', value: 'pnpm',
      sourceType: 'lockfile', sourceRef: 'pnpm-lock.yaml',
    })
    expect(b.id).toBe(a.id)
    expect(fake.rows).toHaveLength(1)
  })

  it('refuses to create a memory from secret material', () => {
    expect(() =>
      createSuggestion({
        projectId: 'p1', kind: 'security_note', title: 'leak',
        value: 'export OPENAI_API_KEY=sk-proj-zzzzzzzzzzzzzzzzzzzzzzzz',
        sourceType: 'package_script', sourceRef: 'x',
      }),
    ).toThrow()
    expect(fake.rows).toHaveLength(0)
  })

  it('lists rejected memories distinctly from suggested', () => {
    const m = createSuggestion({
      projectId: 'p1', kind: 'command', title: 'x', value: 'echo hi',
      sourceType: 'manual', sourceRef: 'user',
    })
    rejectMemory(m.id)
    const all = listMemories('p1')
    expect(all.find((x) => x.id === m.id)?.status).toBe('rejected')
  })
})

describe('rowToMemory', () => {
  it('parses tags and tolerates malformed json', () => {
    const base = {
      id: 'm', project_id: 'p', scope: 'project', kind: 'stack', title: 't', value: 'v',
      source_type: 's', source_ref: 'r', confidence: 0.5, status: 'approved',
      privacy_class: 'project_code', created_by: 'extractor', approved_by: null,
      last_used_at: null, expires_at: null, created_at: 1, updated_at: 1,
    }
    expect(rowToMemory({ ...base, tags_json: '["a","b"]' }).tags).toEqual(['a', 'b'])
    expect(rowToMemory({ ...base, tags_json: 'not json' }).tags).toEqual([])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'

const {
  handlers,
  fakeDb,
  dbCalls,
  dbResponders,
  listClaudeAgentsSpy,
} = vi.hoisted(() => {
  type HandlerFn = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  const registry = new Map<string, HandlerFn>()
  const fakeEvent = {} as IpcMainInvokeEvent
  const handlers = {
    register(channel: string, fn: HandlerFn) { registry.set(channel, fn) },
    async invoke(channel: string, ...args: unknown[]) {
      const fn = registry.get(channel)
      if (!fn) throw new Error(`No handler for '${channel}'`)
      return (await fn(fakeEvent, ...args)) as { ok: boolean; data?: unknown; error?: string }
    },
    clear() { registry.clear() },
  }

  const dbCalls: Array<{ sql: string; method: string; params: unknown[] }> = []
  const dbResponders: {
    all: Array<(sql: string, params: unknown[]) => unknown>
    get: Array<(sql: string, params: unknown[]) => unknown>
    run: Array<(sql: string, params: unknown[]) => unknown>
  } = { all: [], get: [], run: [] }

  const fakeDb = {
    prepare: vi.fn((sql: string) => ({
      all: (...params: unknown[]) => {
        dbCalls.push({ sql, method: 'all', params })
        for (const r of dbResponders.all) {
          const v = r(sql, params)
          if (v !== undefined) return v
        }
        return []
      },
      get: (...params: unknown[]) => {
        dbCalls.push({ sql, method: 'get', params })
        for (const r of dbResponders.get) {
          const v = r(sql, params)
          if (v !== undefined) return v
        }
        return undefined
      },
      run: (...params: unknown[]) => {
        dbCalls.push({ sql, method: 'run', params })
        for (const r of dbResponders.run) {
          const v = r(sql, params)
          if (v !== undefined) return v
        }
        return { changes: 1, lastInsertRowid: 1 }
      },
    })),
  }

  return {
    handlers,
    fakeDb,
    dbCalls,
    dbResponders,
    listClaudeAgentsSpy: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.register(channel, fn as never),
  },
}))

vi.mock('../../electron/db/db', () => ({ getDb: () => fakeDb }))
vi.mock('../../electron/services/ClaudeAgentService', () => ({
  listClaudeAgents: listClaudeAgentsSpy,
}))

import { registerAgentHandlers } from '../../electron/ipc/agents'

beforeEach(() => {
  handlers.clear()
  dbCalls.length = 0
  dbResponders.all.length = 0
  dbResponders.get.length = 0
  dbResponders.run.length = 0
  listClaudeAgentsSpy.mockReset()
  registerAgentHandlers()
})

describe('agents:list', () => {
  it('returns agents ordered by created_at desc', async () => {
    dbResponders.all.push((sql) =>
      sql.includes('FROM agents ORDER BY created_at') ? [{ id: '1' }, { id: '2' }] : undefined,
    )
    const res = await handlers.invoke('agents:list')
    expect(res).toEqual({ ok: true, data: [{ id: '1' }, { id: '2' }] })
  })
})

describe('agents:create', () => {
  it('inserts with generated UUID and returns the row', async () => {
    const created: Record<string, unknown> = {}
    dbResponders.run.push((sql, params) => {
      if (sql.includes('INSERT INTO agents')) {
        created.id = params[0]
        return { changes: 1, lastInsertRowid: 1 }
      }
      return undefined
    })
    dbResponders.get.push((sql, params) => {
      if (sql.includes('FROM agents WHERE id') && params[0] === created.id) {
        return { id: created.id, name: 'Test Agent', model: 'opus' }
      }
      return undefined
    })

    const res = await handlers.invoke('agents:create', {
      name: 'Test Agent',
      systemPrompt: 'You are a test',
      model: 'opus',
      mcps: ['github', 'fs'],
      projectId: 'proj-1',
    })

    expect(res.ok).toBe(true)
    const insertCall = dbCalls.find((c) => c.sql.includes('INSERT INTO agents'))
    expect(insertCall).toBeTruthy()
    // id is a UUID
    expect(insertCall!.params[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    // mcps are JSON-stringified
    expect(insertCall!.params[4]).toBe('["github","fs"]')
    // provider defaults to 'claude'
    expect(insertCall!.params[5]).toBe('claude')
    // source defaults to 'daemon'
    expect(insertCall!.params[8]).toBe('daemon')
  })

  it('honors explicit provider and source overrides', async () => {
    dbResponders.get.push(() => ({ id: 'x' }))
    await handlers.invoke('agents:create', {
      name: 'Codex Agent',
      systemPrompt: '',
      model: 'gpt-5',
      mcps: [],
      provider: 'codex',
      source: 'claude-import',
    })
    const insertCall = dbCalls.find((c) => c.sql.includes('INSERT INTO agents'))
    expect(insertCall!.params[5]).toBe('codex')
    expect(insertCall!.params[8]).toBe('claude-import')
  })
})

describe('agents:update — column allowlist', () => {
  it('updates only allowlisted columns', async () => {
    dbResponders.get.push(() => ({ id: 'a1', name: 'New' }))

    const res = await handlers.invoke('agents:update', 'a1', {
      name: 'New',
      // Not on the allowlist — must be silently dropped:
      id: 'MALICIOUS',
      created_at: 99999,
      DROP: '1',
    })

    expect(res.ok).toBe(true)
    const updateCall = dbCalls.find((c) => c.sql.startsWith('UPDATE agents SET'))
    expect(updateCall).toBeTruthy()
    expect(updateCall!.sql).toBe('UPDATE agents SET name = ? WHERE id = ?')
    expect(updateCall!.params).toEqual(['New', 'a1'])
  })

  it('rejects updates with no valid fields (prevents stray UPDATE WHERE id)', async () => {
    const res = await handlers.invoke('agents:update', 'a1', {
      id: 'MALICIOUS',
      created_at: 0,
    })
    expect(res).toEqual({ ok: false, error: 'No valid fields to update' })
  })

  it('JSON-stringifies array values', async () => {
    dbResponders.get.push(() => ({ id: 'a1' }))
    await handlers.invoke('agents:update', 'a1', {
      mcps: ['a', 'b'],
    })
    const updateCall = dbCalls.find((c) => c.sql.startsWith('UPDATE agents SET'))
    expect(updateCall!.params[0]).toBe('["a","b"]')
  })

  it('composes multi-column updates safely', async () => {
    dbResponders.get.push(() => ({ id: 'a1' }))
    await handlers.invoke('agents:update', 'a1', {
      name: 'X',
      model: 'opus',
      shortcut: 'ctrl+x',
    })
    const updateCall = dbCalls.find((c) => c.sql.startsWith('UPDATE agents SET'))
    expect(updateCall!.sql).toBe('UPDATE agents SET name = ?, model = ?, shortcut = ? WHERE id = ?')
    expect(updateCall!.params).toEqual(['X', 'opus', 'ctrl+x', 'a1'])
  })
})

describe('agents:delete', () => {
  it('issues DELETE with bound id', async () => {
    await handlers.invoke('agents:delete', 'a1')
    const del = dbCalls.find((c) => c.sql.includes('DELETE FROM agents'))
    expect(del?.params).toEqual(['a1'])
  })
})

describe('agents:import-claude', () => {
  it('throws when the claude agent file is not found', async () => {
    listClaudeAgentsSpy.mockReturnValue([])
    const res = await handlers.invoke('agents:import-claude', '/fake/path.md')
    expect(res).toEqual({ ok: false, error: 'Claude agent not found' })
  })

  it('returns existing row without re-inserting if already imported', async () => {
    listClaudeAgentsSpy.mockReturnValue([{
      filePath: '/x/y.md', name: 'Existing', systemPrompt: 'sp', model: 'opus',
    }])
    dbResponders.get.push((sql) =>
      sql.includes('WHERE external_path') ? { id: 'existing-id', name: 'Existing' } : undefined,
    )

    const res = await handlers.invoke('agents:import-claude', '/x/y.md')
    expect(res).toEqual({ ok: true, data: { id: 'existing-id', name: 'Existing' } })
    expect(dbCalls.find((c) => c.sql.includes('INSERT INTO agents'))).toBeUndefined()
  })

  it('inserts a new row when agent has not been imported yet', async () => {
    listClaudeAgentsSpy.mockReturnValue([{
      filePath: '/x/new.md', name: 'New Agent', systemPrompt: 'sp', model: 'opus',
    }])
    let inserted = false
    dbResponders.get.push((sql) => {
      if (sql.includes('WHERE external_path')) return null
      if (sql.includes('WHERE id = ?') && inserted) return { id: 'x', name: 'New Agent' }
      return undefined
    })
    dbResponders.run.push((sql) => {
      if (sql.includes('INSERT INTO agents')) {
        inserted = true
        return { changes: 1, lastInsertRowid: 1 }
      }
      return undefined
    })

    const res = await handlers.invoke('agents:import-claude', '/x/new.md')
    expect(res.ok).toBe(true)
    const insertCall = dbCalls.find((c) => c.sql.includes('INSERT INTO agents'))
    expect(insertCall).toBeTruthy()
    expect(insertCall!.params[7]).toBe('claude-import') // source column
    expect(insertCall!.params[8]).toBe('/x/new.md')      // external_path
  })
})

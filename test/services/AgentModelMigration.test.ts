import { describe, it, expect } from 'vitest'
import type Database from 'better-sqlite3'
import { SUPERSEDED_AGENT_MODELS, refreshSupersededAgentModels } from '../../electron/db/migrations'

// Minimal in-memory stand-in for the better-sqlite3 surface the refresh uses.
// Avoids loading the Electron-ABI native module under vitest's plain-Node runtime.
interface AgentRow { id: string; model: string }

class FakeDb {
  agents: AgentRow[]

  constructor(rows: AgentRow[]) {
    this.agents = rows.map((r) => ({ ...r }))
  }

  prepare(sql: string) {
    if (sql.trim() !== 'UPDATE agents SET model = ? WHERE model = ?') {
      throw new Error(`unexpected sql: ${sql}`)
    }
    return {
      run: (nextModel: string, prevModel: string) => {
        let changes = 0
        for (const row of this.agents) {
          if (row.model === prevModel) {
            row.model = nextModel
            changes++
          }
        }
        return { changes }
      },
    }
  }
}

function asDb(fake: FakeDb): Database.Database {
  return fake as unknown as Database.Database
}

describe('refreshSupersededAgentModels (V59 upgrade migration)', () => {
  it('rewrites the superseded seeded IDs to the current aliases', () => {
    const db = new FakeDb([
      { id: 'daemon-debug', model: 'claude-sonnet-4-20250514' },
      { id: 'solana-agent', model: 'claude-opus-4-20250514' },
    ])
    refreshSupersededAgentModels(asDb(db))
    expect(db.agents).toEqual([
      { id: 'daemon-debug', model: 'claude-sonnet-4-6' },
      { id: 'solana-agent', model: 'claude-opus-4-8' },
    ])
  })

  it('leaves the still-valid dated Haiku snapshot untouched', () => {
    const db = new FakeDb([{ id: 'git-agent', model: 'claude-haiku-4-5-20251001' }])
    refreshSupersededAgentModels(asDb(db))
    expect(db.agents[0].model).toBe('claude-haiku-4-5-20251001')
  })

  it('never rewrites a deliberate non-default model that is still valid', () => {
    const db = new FakeDb([
      { id: 'custom-a', model: 'claude-opus-4-5' },
      { id: 'custom-b', model: 'claude-sonnet-4-6' },
      { id: 'custom-c', model: 'claude-opus-4-8' },
    ])
    refreshSupersededAgentModels(asDb(db))
    expect(db.agents.map((a) => a.model)).toEqual([
      'claude-opus-4-5',
      'claude-sonnet-4-6',
      'claude-opus-4-8',
    ])
  })

  it('is idempotent — a second run changes nothing', () => {
    const db = new FakeDb([
      { id: 'daemon-debug', model: 'claude-sonnet-4-20250514' },
      { id: 'git-agent', model: 'claude-haiku-4-5-20251001' },
    ])
    refreshSupersededAgentModels(asDb(db))
    const afterFirst = db.agents.map((a) => ({ ...a }))
    refreshSupersededAgentModels(asDb(db))
    expect(db.agents).toEqual(afterFirst)
  })

  it('maps only superseded IDs onto exact current aliases', () => {
    expect(SUPERSEDED_AGENT_MODELS).toEqual({
      'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
      'claude-opus-4-20250514': 'claude-opus-4-8',
    })
    // Targets are dateless current aliases — never invented date suffixes.
    for (const target of Object.values(SUPERSEDED_AGENT_MODELS)) {
      expect(target).not.toMatch(/-20\d{6}$/)
    }
    // No key maps to itself and no still-valid ID appears as a key.
    for (const [stale, current] of Object.entries(SUPERSEDED_AGENT_MODELS)) {
      expect(stale).not.toBe(current)
      expect(current in SUPERSEDED_AGENT_MODELS).toBe(false)
    }
  })
})

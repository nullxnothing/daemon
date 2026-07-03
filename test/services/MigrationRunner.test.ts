import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import type Database from 'better-sqlite3'
import {
  runMigrations,
  SUPERSEDED_AGENT_MODELS,
  SUPERSEDED_STATION_MODELS,
} from '../../electron/db/migrations'
import { CLAUDE_MODEL_IDS } from '../../packages/shared/src/constants'

/**
 * Real-SQL migration harness. node:sqlite ships with the test runtime and
 * exposes the same prepare/run/get/all surface runMigrations uses, so the
 * full migration chain executes against a real SQLite engine without the
 * Electron-ABI better-sqlite3 binding that vitest's plain-Node runtime
 * cannot load.
 */
function makeDb(): Database.Database {
  const raw = new DatabaseSync(':memory:')
  const adapter = {
    exec: (sql: string) => raw.exec(sql),
    prepare: (sql: string) => {
      const stmt = raw.prepare(sql)
      return {
        run: (...params: unknown[]) => stmt.run(...(params as never[])),
        get: (...params: unknown[]) => stmt.get(...(params as never[])),
        all: (...params: unknown[]) => stmt.all(...(params as never[])),
      }
    },
    transaction: (fn: (...args: unknown[]) => unknown) =>
      (...args: unknown[]) => {
        raw.exec('BEGIN')
        try {
          const out = fn(...args)
          raw.exec('COMMIT')
          return out
        } catch (err) {
          raw.exec('ROLLBACK')
          throw err
        }
      },
  }
  return adapter as unknown as Database.Database
}

function agentModels(db: Database.Database): Array<{ id: string; model: string }> {
  return db.prepare('SELECT id, model FROM agents ORDER BY id').all() as Array<{ id: string; model: string }>
}

function maxVersion(db: Database.Database): number {
  return (db.prepare('SELECT MAX(version) v FROM _migrations').get() as { v: number }).v
}

describe('runMigrations — fresh install', () => {
  it('reaches the current schema version and seeds only sanctioned Claude model IDs', () => {
    const db = makeDb()
    runMigrations(db)

    expect(maxVersion(db)).toBeGreaterThanOrEqual(60)

    const sanctioned = new Set<string>(Object.values(CLAUDE_MODEL_IDS))
    const rows = agentModels(db)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(sanctioned.has(row.model), `${row.id} seeded with ${row.model}`).toBe(true)
      expect(row.model in SUPERSEDED_AGENT_MODELS).toBe(false)
    }
  })
})

describe('runMigrations — upgraded install', () => {
  /** Build a DB that looks like a pre-V59 install carrying stale model rows. */
  function makeStaleDb(): Database.Database {
    const db = makeDb()
    runMigrations(db)
    // Rewind the model-refresh migrations, then reintroduce the stale IDs the
    // old releases seeded / offered in pickers.
    db.prepare('DELETE FROM _migrations WHERE version >= 59').run()
    db.prepare('UPDATE agents SET model = ? WHERE id = ?').run('claude-sonnet-4-20250514', 'daemon-debug')
    db.prepare('UPDATE agents SET model = ? WHERE id = ?').run('claude-opus-4-20250514', 'solana-agent')
    const insertStation = db.prepare(
      'INSERT INTO agent_station_configs (id, name, template, plugins, model, status) VALUES (?,?,?,?,?,?)'
    )
    insertStation.run('st-sonnet', 'Old Sonnet Station', 'basic', '[]', 'claude-sonnet-4-5', 'idle')
    insertStation.run('st-opus', 'Old Opus Station', 'basic', '[]', 'claude-opus-4-20250514', 'idle')
    insertStation.run('st-gpt', 'GPT Station', 'basic', '[]', 'gpt-4o', 'idle')
    return db
  }

  it('remaps stale seeded agent models to the current aliases (V59)', () => {
    const db = makeStaleDb()
    runMigrations(db)

    const rows = Object.fromEntries(agentModels(db).map((r) => [r.id, r.model]))
    expect(rows['daemon-debug']).toBe(CLAUDE_MODEL_IDS.sonnet)
    expect(rows['solana-agent']).toBe(CLAUDE_MODEL_IDS.opus)
    expect(maxVersion(db)).toBeGreaterThanOrEqual(60)
  })

  it('remaps stale Agent Station picker models but never non-Claude rows (V60)', () => {
    const db = makeStaleDb()
    runMigrations(db)

    const rows = Object.fromEntries(
      (db.prepare('SELECT id, model FROM agent_station_configs').all() as Array<{ id: string; model: string }>)
        .map((r) => [r.id, r.model]),
    )
    expect(rows['st-sonnet']).toBe(CLAUDE_MODEL_IDS.sonnet)
    expect(rows['st-opus']).toBe(CLAUDE_MODEL_IDS.opus)
    expect(rows['st-gpt']).toBe('gpt-4o')
  })

  it('is idempotent — re-running the full chain changes nothing', () => {
    const db = makeStaleDb()
    runMigrations(db)
    const afterFirst = agentModels(db)
    runMigrations(db)
    expect(agentModels(db)).toEqual(afterFirst)
    expect(maxVersion(db)).toBeGreaterThanOrEqual(60)
  })
})

describe('model refresh maps stay inside the sanctioned set', () => {
  it('every refresh target is a canonical CLAUDE_MODEL_IDS value', () => {
    const sanctioned = new Set<string>(Object.values(CLAUDE_MODEL_IDS))
    for (const target of Object.values({ ...SUPERSEDED_AGENT_MODELS, ...SUPERSEDED_STATION_MODELS })) {
      expect(sanctioned.has(target), `${target} is not a sanctioned model ID`).toBe(true)
    }
  })

  it('no stale key survives as a value and no key maps to itself', () => {
    const merged = { ...SUPERSEDED_AGENT_MODELS, ...SUPERSEDED_STATION_MODELS }
    for (const [stale, current] of Object.entries(merged)) {
      expect(stale).not.toBe(current)
      expect(current in merged).toBe(false)
    }
  })
})

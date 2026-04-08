import Database from 'better-sqlite3'
import { config } from '../config.js'
import type { McpSyncPayload } from '../types.js'

/**
 * Subscription state store.
 *
 * Local dev uses SQLite (WAL). Production swaps to Postgres via a drop-in
 * replacement — the query shapes here intentionally avoid any SQLite-specific
 * features (no JSON1 functions, no partial indexes, no window functions) so
 * the migration to pg is a single-file rewrite.
 *
 * Tables:
 *   subscriptions           one row per (wallet, tier) pair
 *   payment_nonces          replay protection for x402 payment receipts
 *   mcp_sync                server-side copy of each wallet's MCP config
 *   arena_votes             one row per (wallet, submission_id) pair
 *   priority_api_usage      monthly rolling quota tracker per wallet
 */

let dbInstance: Database.Database | null = null

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance
  const db = new Database(config.dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      wallet TEXT PRIMARY KEY,
      tier TEXT NOT NULL DEFAULT 'pro',
      access_source TEXT NOT NULL DEFAULT 'payment',
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      latest_payment_signature TEXT,
      jwt_id TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_nonces (
      nonce TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      consumed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_sync (
      wallet TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arena_submissions (
      id TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      title TEXT NOT NULL,
      pitch TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      theme_week TEXT,
      github_url TEXT,
      demo_url TEXT,
      x_handle TEXT,
      discord_handle TEXT,
      contest_slug TEXT,
      status TEXT NOT NULL DEFAULT 'submitted',
      votes INTEGER NOT NULL DEFAULT 0,
      submitted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arena_votes (
      wallet TEXT NOT NULL,
      submission_id TEXT NOT NULL,
      voted_at INTEGER NOT NULL,
      PRIMARY KEY (wallet, submission_id)
    );

    CREATE TABLE IF NOT EXISTS priority_api_usage (
      wallet TEXT NOT NULL,
      month TEXT NOT NULL,
      calls_used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet, month)
    );
  `)

  ensureArenaSubmissionColumns(db)
  ensureSubscriptionColumns(db)

  dbInstance = db
  return db
}

function ensureArenaSubmissionColumns(db: Database.Database): void {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(arena_submissions)').all() as Array<{ name: string }>).map((column) => column.name),
  )
  const additions: Array<{ name: string; sql: string }> = [
    { name: 'pitch', sql: "ALTER TABLE arena_submissions ADD COLUMN pitch TEXT NOT NULL DEFAULT ''" },
    { name: 'demo_url', sql: 'ALTER TABLE arena_submissions ADD COLUMN demo_url TEXT' },
    { name: 'x_handle', sql: 'ALTER TABLE arena_submissions ADD COLUMN x_handle TEXT' },
    { name: 'discord_handle', sql: 'ALTER TABLE arena_submissions ADD COLUMN discord_handle TEXT' },
    { name: 'contest_slug', sql: "ALTER TABLE arena_submissions ADD COLUMN contest_slug TEXT NOT NULL DEFAULT 'build-week-01'" },
  ]

  for (const addition of additions) {
    if (!columns.has(addition.name)) {
      db.exec(addition.sql)
    }
  }
}

function ensureSubscriptionColumns(db: Database.Database): void {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(subscriptions)').all() as Array<{ name: string }>).map((column) => column.name),
  )
  if (!columns.has('access_source')) {
    db.exec("ALTER TABLE subscriptions ADD COLUMN access_source TEXT NOT NULL DEFAULT 'payment'")
  }
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close()
    dbInstance = null
  }
}

// ---------------------------------------------------------------------------
// Subscription state
// ---------------------------------------------------------------------------

export interface SubscriptionRow {
  wallet: string
  tier: string
  access_source: 'payment' | 'holder'
  started_at: number
  expires_at: number
  latest_payment_signature: string | null
  jwt_id: string | null
  revoked: number
  created_at: number
  updated_at: number
}

export function upsertSubscription(params: {
  wallet: string
  expiresAt: number
  paymentSignature: string | null
  jwtId: string
  accessSource?: 'payment' | 'holder'
}): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(`
    INSERT INTO subscriptions (wallet, tier, access_source, started_at, expires_at, latest_payment_signature, jwt_id, revoked, created_at, updated_at)
    VALUES (?, 'pro', ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(wallet) DO UPDATE SET
      access_source = excluded.access_source,
      expires_at = excluded.expires_at,
      latest_payment_signature = excluded.latest_payment_signature,
      jwt_id = excluded.jwt_id,
      revoked = 0,
      updated_at = excluded.updated_at
  `).run(
    params.wallet,
    params.accessSource ?? 'payment',
    now,
    params.expiresAt,
    params.paymentSignature,
    params.jwtId,
    now,
    now,
  )
}

export function getSubscription(wallet: string): SubscriptionRow | undefined {
  return getDb()
    .prepare('SELECT * FROM subscriptions WHERE wallet = ?')
    .get(wallet) as SubscriptionRow | undefined
}

export function revokeSubscription(wallet: string): void {
  getDb()
    .prepare('UPDATE subscriptions SET revoked = 1, updated_at = ? WHERE wallet = ?')
    .run(Date.now(), wallet)
}

// ---------------------------------------------------------------------------
// Payment nonces (replay protection)
// ---------------------------------------------------------------------------

export function consumeNonce(nonce: string, wallet: string): boolean {
  const db = getDb()
  try {
    db.prepare('INSERT INTO payment_nonces (nonce, wallet, consumed_at) VALUES (?, ?, ?)')
      .run(nonce, wallet, Date.now())
    return true
  } catch (err) {
    // UNIQUE constraint violation = nonce already used
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return false
    throw err
  }
}

// ---------------------------------------------------------------------------
// MCP sync
// ---------------------------------------------------------------------------

export function putMcpSync(wallet: string, payload: McpSyncPayload): void {
  getDb()
    .prepare(`
      INSERT INTO mcp_sync (wallet, payload, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(wallet) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
    `)
    .run(wallet, JSON.stringify(payload), Date.now())
}

export function getMcpSync(wallet: string): McpSyncPayload | null {
  const row = getDb()
    .prepare('SELECT payload FROM mcp_sync WHERE wallet = ?')
    .get(wallet) as { payload: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.payload) as McpSyncPayload
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Arena submissions
// ---------------------------------------------------------------------------

export interface ArenaSubmissionRow {
  id: string
  wallet: string
  title: string
  pitch: string
  description: string
  category: string
  theme_week: string | null
  github_url: string | null
  demo_url: string | null
  x_handle: string | null
  discord_handle: string | null
  contest_slug: string | null
  status: string
  votes: number
  submitted_at: number
}

export function listArenaSubmissions(limit = 50): ArenaSubmissionRow[] {
  return getDb()
    .prepare('SELECT * FROM arena_submissions ORDER BY submitted_at DESC LIMIT ?')
    .all(limit) as ArenaSubmissionRow[]
}

export function insertArenaSubmission(row: Omit<ArenaSubmissionRow, 'votes' | 'status'>): void {
  getDb()
    .prepare(`
      INSERT INTO arena_submissions (id, wallet, title, pitch, description, category, theme_week, github_url, demo_url, x_handle, discord_handle, contest_slug, status, votes, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', 0, ?)
    `)
    .run(
      row.id,
      row.wallet,
      row.title,
      row.pitch,
      row.description,
      row.category,
      row.theme_week,
      row.github_url,
      row.demo_url,
      row.x_handle,
      row.discord_handle,
      row.contest_slug,
      row.submitted_at,
    )
}

export type ArenaVoteResult = 'voted' | 'already-voted' | 'not-found'

export function voteForArenaSubmission(wallet: string, submissionId: string): ArenaVoteResult {
  const db = getDb()
  try {
    const tx = db.transaction((): ArenaVoteResult => {
      db.prepare('INSERT INTO arena_votes (wallet, submission_id, voted_at) VALUES (?, ?, ?)')
        .run(wallet, submissionId, Date.now())
      const updated = db.prepare('UPDATE arena_submissions SET votes = votes + 1 WHERE id = ?').run(submissionId)
      if (updated.changes === 0) {
        throw new Error('ARENA_SUBMISSION_NOT_FOUND')
      }
      return 'voted'
    })
    return tx()
  } catch (err) {
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return 'already-voted'
    if ((err as Error).message === 'ARENA_SUBMISSION_NOT_FOUND') return 'not-found'
    throw err
  }
}

// ---------------------------------------------------------------------------
// Priority API usage (monthly rolling quota)
// ---------------------------------------------------------------------------

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export function incrementPriorityApiUsage(wallet: string): number {
  const db = getDb()
  const month = currentMonthKey()
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO priority_api_usage (wallet, month, calls_used) VALUES (?, ?, 1)
      ON CONFLICT(wallet, month) DO UPDATE SET calls_used = calls_used + 1
    `).run(wallet, month)
    return db.prepare('SELECT calls_used FROM priority_api_usage WHERE wallet = ? AND month = ?')
      .get(wallet, month) as { calls_used: number }
  })
  return tx().calls_used
}

export function getPriorityApiUsage(wallet: string): number {
  const row = getDb()
    .prepare('SELECT calls_used FROM priority_api_usage WHERE wallet = ? AND month = ?')
    .get(wallet, currentMonthKey()) as { calls_used: number } | undefined
  return row?.calls_used ?? 0
}

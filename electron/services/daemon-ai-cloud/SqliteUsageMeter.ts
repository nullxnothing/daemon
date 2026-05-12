import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  DaemonAiCloudEntitlement,
  DaemonAiCloudUsageMeter,
} from './types'

function monthBounds(now = Date.now()): { start: number; resetAt: number } {
  const date = new Date(now)
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
    resetAt: new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime(),
  }
}

function usageOwner(entitlement: DaemonAiCloudEntitlement): string {
  return entitlement.userId || entitlement.walletAddress || 'anonymous'
}

function normalizeCredits(input: unknown): number {
  const value = Number(input)
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0
}

export class DaemonAiCreditsError extends Error {
  status = 402

  constructor(message = 'DAEMON AI credits exhausted') {
    super(message)
    this.name = 'DaemonAiCreditsError'
  }
}

export class SqliteDaemonAIUsageMeter implements DaemonAiCloudUsageMeter {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
    this.migrate()
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daemon_ai_cloud_usage_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        wallet_address TEXT,
        owner_key TEXT NOT NULL,
        plan TEXT NOT NULL,
        access_source TEXT,
        feature TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        request_id TEXT UNIQUE,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER,
        provider_cost_usd REAL NOT NULL DEFAULT 0,
        daemon_credits_charged INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_daemon_ai_cloud_usage_owner_created
        ON daemon_ai_cloud_usage_ledger(owner_key, created_at);
    `)
  }

  private ledgerUsedCredits(entitlement: DaemonAiCloudEntitlement, now = Date.now()): number {
    const { start } = monthBounds(now)
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(daemon_credits_charged), 0) AS used
      FROM daemon_ai_cloud_usage_ledger
      WHERE owner_key = ? AND created_at >= ?
    `).get(usageOwner(entitlement), start) as { used: number } | undefined
    return Math.max(0, Number(row?.used ?? 0))
  }

  async getUsage(entitlement: DaemonAiCloudEntitlement): Promise<{ usedCredits: number; monthlyCredits: number; resetAt: number }> {
    const { resetAt } = monthBounds()
    return {
      monthlyCredits: entitlement.monthlyCredits,
      usedCredits: Math.max(entitlement.usedCredits, this.ledgerUsedCredits(entitlement)),
      resetAt,
    }
  }

  async assertCredits(entitlement: DaemonAiCloudEntitlement, estimatedCredits: number): Promise<void> {
    const usage = await this.getUsage(entitlement)
    const remaining = Math.max(usage.monthlyCredits - usage.usedCredits, 0)
    if (remaining < normalizeCredits(estimatedCredits)) {
      throw new DaemonAiCreditsError('DAEMON AI credits exhausted for this billing period')
    }
  }

  async record(event: Parameters<DaemonAiCloudUsageMeter['record']>[0]): Promise<void> {
    const charge = normalizeCredits(event.usage.daemonCreditsCharged)
    const ownerKey = usageOwner(event.entitlement)
    const now = Date.now()
    const insert = this.db.transaction(() => {
      if (event.requestId) {
        const existing = this.db.prepare(`
          SELECT id FROM daemon_ai_cloud_usage_ledger WHERE request_id = ?
        `).get(event.requestId) as { id: string } | undefined
        if (existing) return
      }

      const usedCredits = Math.max(event.entitlement.usedCredits, this.ledgerUsedCredits(event.entitlement, now))
      const remaining = Math.max(event.entitlement.monthlyCredits - usedCredits, 0)
      if (remaining < charge) {
        throw new DaemonAiCreditsError('DAEMON AI credits exhausted before usage could be recorded')
      }

      this.db.prepare(`
        INSERT INTO daemon_ai_cloud_usage_ledger (
          id, user_id, wallet_address, owner_key, plan, access_source, feature, provider, model, request_id,
          input_tokens, output_tokens, cached_input_tokens, provider_cost_usd, daemon_credits_charged, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        event.entitlement.userId,
        event.entitlement.walletAddress ?? null,
        ownerKey,
        event.entitlement.plan,
        event.entitlement.accessSource,
        event.feature,
        event.provider,
        event.model,
        event.requestId ?? null,
        event.usage.inputTokens,
        event.usage.outputTokens,
        event.usage.cachedInputTokens ?? null,
        event.usage.providerCostUsd,
        charge,
        now,
      )
    })
    insert()
  }
}

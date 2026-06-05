import { describe, expect, it } from 'vitest'
import { SCHEMA_V41, SCHEMA_V43, SCHEMA_V45, SCHEMA_V1 } from '../../electron/db/schema'

describe('database migration schemas', () => {
  it('defines ProofPool custody hardening fields for fresh and upgraded databases', () => {
    expect(SCHEMA_V41).toContain('min_backing_lamports INTEGER NOT NULL DEFAULT 0')
    expect(SCHEMA_V41).toContain('current_backing_lamports INTEGER NOT NULL DEFAULT 0')
    expect(SCHEMA_V41).toContain('amount_lamports INTEGER NOT NULL DEFAULT 0')
    expect(SCHEMA_V41).toContain('claimable_fees_lamports INTEGER NOT NULL DEFAULT 0')
    expect(SCHEMA_V41).toContain('total_claimed_lamports INTEGER NOT NULL DEFAULT 0')

    expect(SCHEMA_V43).toContain('ALTER TABLE proof_pools ADD COLUMN min_backing_lamports')
    expect(SCHEMA_V43).toContain('ALTER TABLE proof_pools ADD COLUMN current_backing_lamports')
    expect(SCHEMA_V43).toContain('ALTER TABLE proof_backings ADD COLUMN amount_lamports')
    expect(SCHEMA_V43).toContain('ALTER TABLE proof_backings ADD COLUMN claimable_fees_lamports')
    expect(SCHEMA_V43).toContain('ALTER TABLE proof_backings ADD COLUMN total_claimed_lamports')
  })

  it('defines replay-safe ProofPool payout and webhook tables', () => {
    expect(SCHEMA_V41).toContain('CREATE TABLE IF NOT EXISTS proof_payout_intents')
    expect(SCHEMA_V41).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_payout_intents_backing_kind')
    expect(SCHEMA_V41).toContain('CREATE TABLE IF NOT EXISTS proof_webhook_receipts')
    expect(SCHEMA_V41).toContain('receipt_hash TEXT NOT NULL UNIQUE')

    expect(SCHEMA_V43).toContain('CREATE TABLE IF NOT EXISTS proof_payout_intents')
    expect(SCHEMA_V43).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_proof_payout_intents_backing_kind')
    expect(SCHEMA_V43).toContain('CREATE TABLE IF NOT EXISTS proof_webhook_receipts')
    expect(SCHEMA_V43).toContain('receipt_hash TEXT NOT NULL UNIQUE')
  })

  it('defines project pin/branch fields for fresh and upgraded databases', () => {
    expect(SCHEMA_V1).toContain('pinned INTEGER NOT NULL DEFAULT 0')
    expect(SCHEMA_V1).toContain('branch TEXT')

    expect(SCHEMA_V45).toContain('ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
    expect(SCHEMA_V45).toContain('ALTER TABLE projects ADD COLUMN branch TEXT')
    expect(SCHEMA_V45).toContain('idx_projects_pinned')
  })
})

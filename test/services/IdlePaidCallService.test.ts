import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkPolicy,
  executePaidCall,
  listReceipts,
  listResources,
  refreshRegistry,
} from '../../electron/services/IdlePaidCallService'
import type { IdleBudgetPolicy } from '../../electron/shared/types'

const SOLANA_MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'

type ResourceRow = Record<string, unknown> & { id: string; score: number; last_seen_at: number }
type ReceiptRow = Record<string, unknown> & {
  id: string
  task_id: string | null
  project_id: string | null
  resource_id: string
  amount_usdc: number
  status: string
  created_at: number
}

class MemoryIdleDb {
  private resources = new Map<string, ResourceRow>()
  private receipts = new Map<string, ReceiptRow>()

  exec() {
    return this
  }

  transaction<T extends unknown[]>(fn: (...args: T) => unknown) {
    return (...args: T) => fn(...args)
  }

  prepare(sql: string) {
    const normalized = sql.replace(/\s+/g, ' ').trim()
    return {
      run: (...args: unknown[]) => this.run(normalized, args),
      get: (...args: unknown[]) => this.get(normalized, args),
      all: (...args: unknown[]) => this.all(normalized, args),
    }
  }

  private run(sql: string, args: unknown[]) {
    if (sql.startsWith('INSERT INTO idle_resource_cache')) {
      this.resources.set(String(args[0]), {
        id: String(args[0]),
        provider: String(args[1]),
        type: String(args[2]),
        name: String(args[3]),
        endpoint: String(args[4]),
        method: String(args[5]),
        price_usdc: Number(args[6]),
        asset: String(args[7]),
        network: String(args[8]),
        payee: String(args[9]),
        score: Number(args[10]),
        status: String(args[11]),
        schema_json: String(args[12]),
        raw_json: String(args[13]),
        registry_url: args[14] as string | null,
        last_seen_at: Number(args[15]),
      })
      return { changes: 1 }
    }

    if (sql.startsWith('INSERT INTO idle_paid_call_receipts')) {
      this.receipts.set(String(args[0]), {
        id: String(args[0]),
        resource_id: String(args[1]),
        project_id: args[2] as string | null,
        task_id: args[3] as string | null,
        agent_id: args[4] as string | null,
        endpoint: String(args[5]),
        method: String(args[6]),
        amount_usdc: Number(args[7]),
        asset: String(args[8]),
        network: String(args[9]),
        payee: String(args[10]),
        status: String(args[11]),
        payment_id: args[12] as string | null,
        facilitator: args[13] as string | null,
        request_hash: String(args[14]),
        response_hash: args[15] as string | null,
        response_status: args[16] as number | null,
        response_content_type: args[17] as string | null,
        response_bytes: args[18] as number | null,
        error_message: args[19] as string | null,
        metadata_json: String(args[20]),
        created_at: Number(args[21]),
        updated_at: Number(args[22]),
      })
      return { changes: 1 }
    }

    throw new Error(`Unsupported test SQL: ${sql}`)
  }

  private get(sql: string, args: unknown[]) {
    if (sql === 'SELECT * FROM idle_resource_cache WHERE id = ?') {
      return this.resources.get(String(args[0]))
    }
    if (sql === 'SELECT * FROM idle_paid_call_receipts WHERE id = ?') {
      return this.receipts.get(String(args[0]))
    }
    if (sql.includes('SELECT COALESCE(SUM(amount_usdc), 0) AS total FROM idle_paid_call_receipts WHERE task_id = ?')) {
      return { total: this.sumReceipts((row) => row.task_id === args[0]) }
    }
    if (sql.includes('SELECT COALESCE(SUM(amount_usdc), 0) AS total FROM idle_paid_call_receipts WHERE project_id = ?')) {
      return { total: this.sumReceipts((row) => row.project_id === args[0]) }
    }
    if (sql === 'SELECT COUNT(*) AS count FROM idle_resource_cache') {
      return { count: this.resources.size }
    }
    if (sql === 'SELECT COUNT(*) AS count FROM idle_paid_call_receipts') {
      return { count: this.receipts.size }
    }
    if (sql === 'SELECT * FROM idle_paid_call_receipts ORDER BY created_at DESC LIMIT 1') {
      return this.sortedReceipts()[0]
    }
    throw new Error(`Unsupported test SQL: ${sql}`)
  }

  private all(sql: string, args: unknown[]) {
    if (sql === 'SELECT * FROM idle_resource_cache ORDER BY score DESC, last_seen_at DESC LIMIT ?') {
      return [...this.resources.values()]
        .sort((a, b) => b.score - a.score || b.last_seen_at - a.last_seen_at)
        .slice(0, Number(args[0]))
    }
    if (sql === 'SELECT * FROM idle_paid_call_receipts ORDER BY created_at DESC LIMIT ?') {
      return this.sortedReceipts().slice(0, Number(args[0]))
    }
    throw new Error(`Unsupported test SQL: ${sql}`)
  }

  private sortedReceipts() {
    return [...this.receipts.values()].sort((a, b) => b.created_at - a.created_at)
  }

  private sumReceipts(predicate: (row: ReceiptRow) => boolean) {
    return [...this.receipts.values()]
      .filter((row) => row.status === 'settled' && predicate(row))
      .reduce((total, row) => total + row.amount_usdc, 0)
  }
}

describe('IdlePaidCallService', () => {
  let db: MemoryIdleDb | null = null

  afterEach(() => {
    db = null
  })

  function createDb() {
    db = new MemoryIdleDb()
    return db
  }

  function policy(overrides: Partial<IdleBudgetPolicy> = {}): IdleBudgetPolicy {
    return {
      maxPerCallUsdc: 0.05,
      maxPerTaskUsdc: 0.1,
      allowedDomains: ['gateway.earnidle.com'],
      allowedNetworks: [SOLANA_MAINNET_CAIP2],
      allowedAssets: ['USDC'],
      allowedPayees: ['7Y12wallet9AbC'],
      receiptRequired: true,
      humanApproved: true,
      ...overrides,
    }
  }

  async function seedResource() {
    const database = createDb()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      resources: [
        {
          id: 'idle-dex-feed',
          provider: 'idle-protocol',
          type: 'api',
          name: 'dex-feed',
          endpoint: 'https://gateway.earnidle.com/v1/dex-feed',
          method: 'POST',
          priceUsdc: 0.01,
          asset: 'USDC',
          network: 'solana:mainnet',
          payee: '7Y12wallet9AbC',
          score: 91,
        },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const resources = await refreshRegistry(
      { registryUrl: 'https://gateway.earnidle.com/resources.json' },
      { db: database, fetchImpl, now: () => 1 },
    )
    return { database, resource: resources[0] }
  }

  it('imports a configured IDLE resource registry into the local cache', async () => {
    const { database, resource } = await seedResource()

    expect(resource).toMatchObject({
      id: 'idle-dex-feed',
      endpoint: 'https://gateway.earnidle.com/v1/dex-feed',
      priceUsdc: 0.01,
      network: SOLANA_MAINNET_CAIP2,
      payee: '7Y12wallet9AbC',
    })
    expect(listResources(10, { db: database })).toHaveLength(1)
  })

  it('imports PayAI discovery resources from x402 accepts', async () => {
    const database = createDb()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      x402Version: 2,
      items: [
        {
          resource: 'https://api.payai.example/v1/signal',
          type: 'http',
          accepts: [{
            scheme: 'exact',
            network: SOLANA_MAINNET_CAIP2,
            amount: '10000',
            asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            payTo: '7Y12wallet9AbC',
          }],
          metadata: { provider: 'PayAI Test', title: 'Signal Feed' },
        },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const resources = await refreshRegistry(
      { registryUrl: 'https://facilitator.payai.network/discovery/resources?type=http' },
      { db: database, fetchImpl, now: () => 1 },
    )

    expect(resources[0]).toMatchObject({
      provider: 'PayAI Test',
      type: 'api',
      name: 'Signal Feed',
      endpoint: 'https://api.payai.example/v1/signal',
      priceUsdc: 0.01,
      network: SOLANA_MAINNET_CAIP2,
      payee: '7Y12wallet9AbC',
    })
  })

  it('denies over-budget and unknown-domain resources before execution', async () => {
    const { database, resource } = await seedResource()

    const overBudget = checkPolicy({
      resourceId: resource.id,
      taskId: 'task-1',
      policy: policy({ maxPerCallUsdc: 0.005 }),
    }, { db: database })
    expect(overBudget.allowed).toBe(false)
    expect(overBudget.reasons).toContain('Resource price exceeds per-call budget.')

    const wrongDomain = checkPolicy({
      resourceId: resource.id,
      taskId: 'task-1',
      policy: policy({ allowedDomains: ['api.example.com'] }),
    }, { db: database })
    expect(wrongDomain.allowed).toBe(false)
    expect(wrongDomain.reasons).toContain('Endpoint host is not on the route allowlist.')
  })

  it('requires human approval and stores a blocked receipt without payment signatures', async () => {
    const { database, resource } = await seedResource()

    const receipt = await executePaidCall({
      resourceId: resource.id,
      taskId: 'task-1',
      policy: policy({ humanApproved: false }),
      paymentSignature: 'signature-secret',
      requestBody: { prompt: 'test' },
    }, { db: database, now: () => 2 })

    expect(receipt.status).toBe('blocked')
    expect(receipt.errorMessage).toContain('Human approval is required.')
    expect(JSON.stringify(receipt)).not.toContain('signature-secret')
  })

  it('performs a 402 preflight, paid retry, and stores a redacted settled receipt', async () => {
    const { database, resource } = await seedResource()
    const paymentRequirement = Buffer.from(JSON.stringify({
      x402Version: 2,
      accepts: [{ payTo: '7Y12wallet9AbC', asset: 'USDC', network: SOLANA_MAINNET_CAIP2, amount: '10000' }],
    })).toString('base64url')
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'payment required' }), {
        status: 402,
        headers: { 'payment-required': paymentRequirement, 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))

    const receipt = await executePaidCall({
      resourceId: resource.id,
      projectId: 'project-1',
      taskId: 'task-1',
      policy: policy(),
      paymentSignature: 'paid-signature-secret',
      requestBody: { query: 'markets' },
      approvedBy: 'tester',
    }, { db: database, fetchImpl, now: () => 3 })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(receipt).toMatchObject({
      status: 'settled',
      responseStatus: 200,
      responseContentType: 'application/json',
      projectId: 'project-1',
    })
    expect(JSON.stringify(listReceipts(5, { db: database }))).not.toContain('paid-signature-secret')
  })
})

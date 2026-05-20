import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA_V37 } from '../../electron/db/schema'
import {
  checkPolicy,
  executePaidCall,
  listReceipts,
  listResources,
  refreshRegistry,
} from '../../electron/services/IdlePaidCallService'
import type { IdleBudgetPolicy } from '../../electron/shared/types'

describe('IdlePaidCallService', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function createDb() {
    db = new Database(':memory:')
    db.exec(SCHEMA_V37)
    return db
  }

  function policy(overrides: Partial<IdleBudgetPolicy> = {}): IdleBudgetPolicy {
    return {
      maxPerCallUsdc: 0.05,
      maxPerTaskUsdc: 0.1,
      allowedDomains: ['gateway.earnidle.com'],
      allowedNetworks: ['solana:mainnet'],
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
      payee: '7Y12wallet9AbC',
    })
    expect(listResources(10, { db: database })).toHaveLength(1)
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
      x402Version: 1,
      accepts: [{ payTo: '7Y12wallet9AbC', asset: 'USDC', network: 'solana:mainnet', maxAmountRequired: 0.01 }],
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

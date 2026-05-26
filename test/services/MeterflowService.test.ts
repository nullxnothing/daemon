import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'

const x402Mocks = vi.hoisted(() => {
  const makePaymentRequired = () => ({
    x402Version: 2,
    resource: {
      url: 'https://meterflow.fun/proxy/mcp/agent-readiness',
      description: 'agent readiness preflight via Meterflow',
    },
    accepts: [{
      scheme: 'exact',
      network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      amount: '14000',
      asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      payTo: '6ybgqYcvbKkhPCfRg76naKY2gjUUgyx4HHR3FqTa2GYR',
      maxTimeoutSeconds: 300,
      extra: {
        token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        feePayer: '2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4',
      },
    }],
    extensions: {
      'payment-identifier': {
        info: { required: true },
      },
      bazaar: {
        info: {
          input: { type: 'mcp' },
        },
      },
    },
  })

  const state = {
    paymentRequired: makePaymentRequired(),
    createPaymentPayload: vi.fn(async (paymentRequired: Record<string, unknown>) => ({
      x402Version: 2,
      payload: { transaction: 'signed-wire-transaction' },
      resource: paymentRequired.resource,
      accepted: (paymentRequired.accepts as unknown[])[0],
      extensions: paymentRequired.extensions,
    })),
    encodePaymentSignatureHeader: vi.fn(() => ({ 'PAYMENT-SIGNATURE': 'signed-payment-header' })),
    getPaymentRequiredResponse: vi.fn(() => null as unknown),
    createKeyPairSignerFromBytes: vi.fn(async () => ({ address: 'EFVWWyKiW7PyUnKrsd3vauimVsTEBb44jTxx1LGcJn2c' })),
    registerExactSvmScheme: vi.fn((client: unknown) => client),
    toClientSvmSigner: vi.fn((signer: unknown) => signer),
    withKeypair: vi.fn(async (_walletId: string, fn: (keypair: unknown) => Promise<unknown>) => fn({
      publicKey: { toBase58: () => 'EFVWWyKiW7PyUnKrsd3vauimVsTEBb44jTxx1LGcJn2c' },
      secretKey: new Uint8Array(64),
    })),
    secureGetKey: vi.fn(() => 'encrypted-wallet-key'),
    reset() {
      this.paymentRequired = makePaymentRequired()
      this.createPaymentPayload.mockClear()
      this.encodePaymentSignatureHeader.mockClear()
      this.getPaymentRequiredResponse.mockClear()
      this.createKeyPairSignerFromBytes.mockClear()
      this.registerExactSvmScheme.mockClear()
      this.toClientSvmSigner.mockClear()
      this.withKeypair.mockClear()
      this.secureGetKey.mockClear()
    },
  }
  state.getPaymentRequiredResponse.mockImplementation(() => state.paymentRequired)
  return state
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => process.cwd()),
  },
  safeStorage: {
    encryptString: vi.fn((value: string) => Buffer.from(value)),
    decryptString: vi.fn((value: Buffer) => value.toString()),
    isEncryptionAvailable: vi.fn(() => true),
  },
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: x402Mocks.secureGetKey,
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
  listKeys: vi.fn(() => []),
  isEncryptionAvailable: vi.fn(() => true),
}))

vi.mock('../../electron/services/SolanaService', () => ({
  withKeypair: x402Mocks.withKeypair,
}))

vi.mock('@solana/kit', () => ({
  createKeyPairSignerFromBytes: x402Mocks.createKeyPairSignerFromBytes,
}))

vi.mock('@x402/svm', () => ({
  toClientSvmSigner: x402Mocks.toClientSvmSigner,
}))

vi.mock('@x402/svm/exact/client', () => ({
  registerExactSvmScheme: x402Mocks.registerExactSvmScheme,
}))

vi.mock('@x402/core/client', () => ({
  x402Client: vi.fn(function x402Client() {
    return {}
  }),
  x402HTTPClient: vi.fn(function x402HTTPClient() {
    return {
      getPaymentRequiredResponse: x402Mocks.getPaymentRequiredResponse,
      createPaymentPayload: x402Mocks.createPaymentPayload,
      encodePaymentSignatureHeader: x402Mocks.encodePaymentSignatureHeader,
    }
  }),
}))

import {
  callPaidAgentReadiness,
  exportReceiptsCsv,
  getOverview,
  getStatus,
  ingestReceipt,
  listReceipts,
  storeApiKey,
} from '../../electron/services/MeterflowService'

function secureKey(value: string | null) {
  return {
    getKey: vi.fn(() => value),
    storeKey: vi.fn(),
    deleteKey: vi.fn(),
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function testDb() {
  const rows = new Map<string, Record<string, unknown>>()
  return {
    prepare(sql: string) {
      return {
        run(input: Record<string, unknown>) {
          if (sql.includes('INSERT INTO meterflow_receipts')) rows.set(String(input.id), { ...input })
          return {}
        },
        get(id: string) {
          if (sql.includes('SELECT * FROM meterflow_receipts')) return rows.get(id)
          if (sql.includes('SELECT raw_json FROM meterflow_receipts')) {
            const row = rows.get(id)
            return row ? { raw_json: row.raw_json } : undefined
          }
          return undefined
        },
        all(status: string | null, _statusAgain: string | null, limit: number) {
          return [...rows.values()]
            .filter((row) => !status || row.status === status)
            .sort((a, b) => Number(b.created_at) - Number(a.created_at))
            .slice(0, limit)
        },
      }
    },
  }
  return db as unknown as Database.Database
}

function paymentDb() {
  const rows = new Map<string, Record<string, unknown>>()
  const wallet = {
    id: 'wallet-1',
    name: 'Meterflow Demo Payer',
    address: 'EFVWWyKiW7PyUnKrsd3vauimVsTEBb44jTxx1LGcJn2c',
    wallet_type: 'agent',
    created_at: 123,
  }
  return {
    prepare(sql: string) {
      return {
        run(input: Record<string, unknown>) {
          if (sql.includes('INSERT INTO meterflow_receipts')) rows.set(String(input.id), { ...input })
          return {}
        },
        get(id: string) {
          if (sql.includes('SELECT value FROM app_settings')) return { value: 'wallet-1' }
          if (sql.includes('FROM wallets')) return wallet
          if (sql.includes('SELECT * FROM meterflow_receipts')) return rows.get(id)
          if (sql.includes('SELECT raw_json FROM meterflow_receipts')) {
            const row = rows.get(id)
            return row ? { raw_json: row.raw_json } : undefined
          }
          return undefined
        },
        all(status: string | null, _statusAgain: string | null, limit: number) {
          return [...rows.values()]
            .filter((row) => !status || row.status === status)
            .sort((a, b) => Number(b.created_at) - Number(a.created_at))
            .slice(0, limit)
        },
      }
    },
  } as unknown as Database.Database
}

describe('MeterflowService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    x402Mocks.reset()
  })

  it('reports missing API key without calling Meterflow', async () => {
    const fetchImpl = vi.fn()
    const status = await getStatus({
      secureKey: secureKey(null),
      env: {},
      fetchImpl,
    })

    expect(status).toMatchObject({
      configured: false,
      keySource: 'none',
      executionReady: true,
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('prefers the secure key over env and sends bearer auth', async () => {
    const fetchImpl = vi.fn(async () => json({ tier: 'pro', balanceUsd: 12.5 }))
    const status = await getStatus({
      secureKey: secureKey('secure-meterflow-key'),
      env: { METERFLOW_API_KEY: 'env-meterflow-key' },
      fetchImpl,
    })

    const init = fetchImpl.mock.calls[0][1] as RequestInit
    expect(status).toMatchObject({
      configured: true,
      keySource: 'secure',
      tier: 'pro',
      balanceUsd: 12.5,
    })
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://www.meterflow.fun/proxy/auth/status')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secure-meterflow-key')
  })

  it('stores API keys in secure storage', async () => {
    const keys = secureKey('stored-key')
    const fetchImpl = vi.fn(async () => json({ tier: 'operator' }))

    await storeApiKey('  new-meterflow-key  ', { secureKey: keys, fetchImpl })

    expect(keys.storeKey).toHaveBeenCalledWith('METERFLOW_API_KEY', 'new-meterflow-key')
  })

  it('lists locally ingested receipts with query filters', async () => {
    const db = testDb()
    await ingestReceipt({
      id: 'rcpt_1',
      status: 'settled',
      route: '/mcp/token-risk',
      amountUsd: 0.006,
    }, { db, now: () => 123 })

    const receipts = await listReceipts(
      { meterId: 'mtr_1', status: 'settled', limit: 500 },
      { db, secureKey: secureKey('meterflow-key') },
    )

    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({ id: 'rcpt_1', route: '/mcp/token-risk', amountUsd: 0.006 })
  })

  it('builds overview with optional endpoint failures captured', async () => {
    const db = testDb()
    await ingestReceipt({ id: 'rcpt_1', status: 'settled' }, { db, now: () => 123 })
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const text = String(url)
      if (text.includes('/auth/status')) return json({ tier: 'pro' })
      if (text.includes('/v1/meters')) return json({ meters: [{ id: 'mtr_1', route: '/mcp/token-risk' }] })
      if (text.includes('/v1/budgets')) return json({ budgets: [] })
      if (text.includes('/v1/agent-sessions')) return json({ agentSessions: [] })
      if (text.includes('/v1/webhooks')) return json({ webhooks: [] }, 500)
      if (text.includes('/v1/providers/revenue')) return json({ revenue: [] })
      return json({ providers: 1 })
    })

    const overview = await getOverview({
      db,
      secureKey: secureKey('meterflow-key'),
      fetchImpl,
      now: () => 123,
    })

    expect(overview.receipts).toHaveLength(1)
    expect(overview.meters[0].route).toBe('/mcp/token-risk')
    expect(overview.errors[0]).toContain('/v1/webhooks')
    expect(overview.fetchedAt).toBe(123)
  })

  it('exports receipts as CSV text', async () => {
    const db = testDb()
    await ingestReceipt({ id: 'rcpt_1', status: 'settled', amountUsd: 0.006 }, { db, now: () => 123 })

    const exported = await exportReceiptsCsv({
      db,
      secureKey: secureKey('meterflow-key'),
    })

    expect(exported).toMatchObject({
      filename: 'meterflow-receipts.csv',
      contentType: 'text/csv',
    })
    expect(exported.content).toContain('rcpt_1')
    expect(exported.content).toContain('0.006')
  })

  it('uses Meterflow v2 x402 retry headers without mutating the payment requirement', async () => {
    const db = paymentDb()
    const paymentResponse = Buffer.from(JSON.stringify({
      success: true,
      transaction: 'settled-tx-signature',
      payer: 'EFVWWyKiW7PyUnKrsd3vauimVsTEBb44jTxx1LGcJn2c',
    })).toString('base64')
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      if (!headers?.['PAYMENT-SIGNATURE']) {
        return new Response('{}', {
          status: 402,
          headers: {
            'payment-required': Buffer.from(JSON.stringify(x402Mocks.paymentRequired)).toString('base64'),
          },
        })
      }
      return new Response(JSON.stringify({
        receipt: {
          id: 'rcpt_live',
          status: 'verified',
          paymentState: 'verified',
          publicVerifyUrl: 'https://www.meterflow.fun/receipts/rcpt_live',
        },
        result: { ok: true },
      }), {
        status: 200,
        headers: {
          'payment-response': paymentResponse,
          'x-meterflow-receipt-id': 'rcpt_live',
          'x-meterflow-receipt-url': 'https://www.meterflow.fun/receipts/rcpt_live',
        },
      })
    })

    const result = await callPaidAgentReadiness(
      { idempotencyKey: 'idem_meterflow_test_123' },
      { db, fetchImpl, now: () => 456 },
    )

    const paidHeaders = fetchImpl.mock.calls[1][1]?.headers as Record<string, string>
    expect(paidHeaders['Idempotency-Key']).toBe('idem_meterflow_test_123')
    expect(paidHeaders['X-Payment-Wallet']).toBe('EFVWWyKiW7PyUnKrsd3vauimVsTEBb44jTxx1LGcJn2c')
    expect(paidHeaders['X-Payment-Id']).toBe('idem_meterflow_test_123')
    expect(paidHeaders['PAYMENT-SIGNATURE']).toBe('signed-payment-header')
    expect(paidHeaders).not.toHaveProperty('X-PAYMENT')
    expect(x402Mocks.createPaymentPayload.mock.calls[0][0].resource.url).toBe('https://meterflow.fun/proxy/mcp/agent-readiness')
    expect(x402Mocks.createPaymentPayload.mock.calls[0][0].extensions['payment-identifier'].info.id).toBe('idem_meterflow_test_123')
    expect(x402Mocks.createPaymentPayload.mock.calls[0][0].extensions.bazaar).toBeUndefined()
    expect(result.txSignature).toBe('settled-tx-signature')
    expect(result.receipt.id).toBe('rcpt_live')
  })
})

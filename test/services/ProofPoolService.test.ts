import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { createHmac } from 'node:crypto'
import bs58 from 'bs58'

class FakeDb {
  pools: Record<string, Record<string, any>> = {}
  backings: Record<string, Record<string, any>> = {}
  events: Record<string, Record<string, any>> = {}
  vanityMints: Record<string, Record<string, any>> = {}
  partnerSessions: Record<string, Record<string, any>> = {}
  webhookReceipts: Record<string, Record<string, any>> = {}
  payoutIntents: Record<string, Record<string, any>> = {}

  prepare(sql: string) {
    return {
      run: (...args: any[]) => this.run(sql, args),
      get: (...args: any[]) => this.get(sql, args),
      all: (...args: any[]) => this.all(sql, args),
    }
  }

  close() {}

  private normalized(sql: string) {
    return sql.replace(/\s+/g, ' ').trim()
  }

  private clone<T>(value: T): T {
    return value ? JSON.parse(JSON.stringify(value)) : value
  }

  private run(sql: string, args: any[]) {
    const query = this.normalized(sql)
    if (query.startsWith('INSERT INTO proof_pools')) {
      const [
        id, name, symbol, description, image_path, twitter, telegram, website,
        creator_wallet, pool_wallet, pool_key_name, creator_subescrow, creator_key_name,
        total_slots, min_backing_sol, min_backing_lamports, backing_deadline, created_at, updated_at,
      ] = args
      this.pools[id] = {
        id, name, symbol, description, image_path, twitter, telegram, website,
        creator_wallet, pool_wallet, pool_key_name, creator_subescrow, creator_key_name,
        mint: null,
        mint_key_name: null,
        metadata_uri: null,
        launch_signature: null,
        proof_level: null,
        total_slots,
        min_backing_sol,
        min_backing_lamports,
        current_backing_sol: 0,
        current_backing_lamports: 0,
        pool_token_balance: null,
        status: 'backing',
        backing_deadline,
        launched_at: null,
        distributed_at: null,
        created_at,
        updated_at,
        error_message: null,
      }
      return { changes: 1 }
    }
    if (query.startsWith('INSERT INTO proof_pool_events')) {
      const [id, pool_id, kind, message, signature, metadata_json, created_at] = args
      this.events[id] = { id, pool_id, kind, message, signature, metadata_json, created_at }
      return { changes: 1 }
    }
    if (query.startsWith('INSERT INTO proof_backings')) {
      const [id, pool_id, backer_wallet, amount_sol, amount_lamports, deposit_signature, slot_number, created_at, updated_at] = args
      this.backings[id] = {
        id,
        pool_id,
        backer_wallet,
        amount_sol,
        amount_lamports,
        deposit_signature,
        slot_number,
        status: 'confirmed',
        tokens_allocated: null,
        distribution_signature: null,
        refund_signature: null,
        claimable_fees_sol: 0,
        claimable_fees_lamports: 0,
        total_claimed_sol: 0,
        total_claimed_lamports: 0,
        last_claim_signature: null,
        distributed_at: null,
        refunded_at: null,
        created_at,
        updated_at,
      }
      return { changes: 1 }
    }
    if (query.startsWith('UPDATE proof_pools SET current_backing_lamports')) {
      const [current_backing_lamports, current_backing_sol, status, updated_at, id] = args
      Object.assign(this.pools[id], { current_backing_lamports, current_backing_sol, status, updated_at })
      return { changes: 1 }
    }
    if (query.startsWith('INSERT INTO proof_webhook_receipts')) {
      const [id, provider, receipt_hash, received_at] = args
      if (Object.values(this.webhookReceipts).some((receipt) => receipt.receipt_hash === receipt_hash)) {
        throw new Error('UNIQUE constraint failed: proof_webhook_receipts.receipt_hash')
      }
      this.webhookReceipts[id] = { id, provider, receipt_hash, received_at }
      return { changes: 1 }
    }
    if (query.startsWith('UPDATE proof_pools SET status = ?')) {
      const [status, updated_at, id] = args
      Object.assign(this.pools[id], { status, updated_at })
      return { changes: 1 }
    }
    if (query.startsWith("UPDATE proof_pools SET status = 'refunding'")) {
      const [updated_at, id] = args
      if (!['backing', 'funded', 'failed'].includes(this.pools[id]?.status)) return { changes: 0 }
      Object.assign(this.pools[id], { status: 'refunding', updated_at })
      return { changes: 1 }
    }
    if (query.startsWith('UPDATE proof_backings SET status = ?')) {
      const [status, updated_at, id, expectedStatus] = args
      if (this.backings[id]?.status !== expectedStatus) return { changes: 0 }
      Object.assign(this.backings[id], { status, updated_at })
      return { changes: 1 }
    }
    if (query.startsWith('UPDATE proof_backings SET status = \'refunded\'')) {
      const [refund_signature, refunded_at, updated_at, id] = args
      if (this.backings[id]?.status !== 'refunding') return { changes: 0 }
      Object.assign(this.backings[id], { status: 'refunded', refund_signature, refunded_at, updated_at })
      return { changes: 1 }
    }
    if (query.startsWith('INSERT OR REPLACE INTO proof_payout_intents')) {
      const [id, pool_id, backing_id, kind, recipient, mint, lamports, token_amount, created_at, updated_at] = args
      this.payoutIntents[id] = {
        id, pool_id, backing_id, kind, recipient, mint, lamports, token_amount,
        status: 'pending',
        signature: null,
        error_message: null,
        created_at,
        updated_at,
      }
      return { changes: 1 }
    }
    if (query.startsWith('UPDATE proof_payout_intents')) {
      const [status, signature, error_message, updated_at, id] = args
      Object.assign(this.payoutIntents[id], { status, signature: signature ?? this.payoutIntents[id]?.signature, error_message, updated_at })
      return { changes: 1 }
    }
    if (query.startsWith('INSERT INTO proof_vanity_mints')) {
      const [id, address, key_name, created_at] = args
      this.vanityMints[id] = { id, address, key_name, used_pool_id: null, used_at: null, created_at }
      return { changes: 1 }
    }
    if (query.startsWith('INSERT OR REPLACE INTO proof_partner_sessions')) {
      const [
        id, partner_reference, name, symbol, description, image_url, creator_wallet,
        total_slots, min_backing_sol, metadata_json, return_url, checkout_url, status,
        meme_id, meme_url, request_json, response_json, created_at, updated_at,
      ] = args
      this.partnerSessions[id] = {
        id,
        partner_reference,
        name,
        symbol,
        description,
        image_url,
        creator_wallet,
        total_slots,
        min_backing_sol,
        metadata_json,
        return_url,
        checkout_url,
        status,
        meme_id,
        meme_url,
        prefill_json: null,
        request_json,
        response_json,
        created_at,
        updated_at,
        last_polled_at: null,
        error_message: null,
      }
      return { changes: 1 }
    }
    if (query.startsWith('UPDATE proof_partner_sessions SET checkout_url')) {
      const [checkout_url, status, meme_id, meme_url, response_json, updated_at, last_polled_at, id] = args
      Object.assign(this.partnerSessions[id], {
        checkout_url,
        status,
        meme_id,
        meme_url,
        response_json,
        updated_at,
        last_polled_at,
        error_message: null,
      })
      return { changes: 1 }
    }
    if (query.startsWith('UPDATE proof_partner_sessions SET prefill_json')) {
      const [prefill_json, updated_at, id] = args
      Object.assign(this.partnerSessions[id], { prefill_json, updated_at })
      return { changes: 1 }
    }
    return { changes: 0 }
  }

  private get(sql: string, args: any[]) {
    const query = this.normalized(sql)
    if (query === 'SELECT * FROM proof_pools WHERE id = ?') return this.clone(this.pools[args[0]])
    if (query === 'SELECT * FROM proof_backings WHERE id = ?') return this.clone(this.backings[args[0]])
    if (query === 'SELECT * FROM proof_partner_sessions WHERE id = ?') return this.clone(this.partnerSessions[args[0]])
    if (query.startsWith('SELECT id FROM proof_backings WHERE deposit_signature')) {
      return this.clone(Object.values(this.backings).find((backing) => backing.deposit_signature === args[0]))
    }
    if (query.startsWith('SELECT id FROM proof_backings WHERE pool_id = ? AND backer_wallet = ?')) {
      return this.clone(Object.values(this.backings).find((backing) => backing.pool_id === args[0] && backing.backer_wallet === args[1] && backing.status === 'confirmed'))
    }
    if (query.startsWith('SELECT COUNT(*) AS count, COALESCE(SUM(amount_lamports), 0) AS total')) {
      const rows = Object.values(this.backings).filter((backing) => backing.pool_id === args[0] && backing.status === 'confirmed')
      return { count: rows.length, total: rows.reduce((sum, backing) => sum + Number(backing.amount_lamports), 0) }
    }
    if (query.startsWith('SELECT COALESCE(SUM(amount_lamports), 0) AS total')) {
      const rows = Object.values(this.backings).filter((backing) => (
        backing.pool_id === args[0]
        && ['confirmed', 'distributing', 'distributed', 'refunding'].includes(backing.status)
      ))
      return { total: rows.reduce((sum, backing) => sum + Number(backing.amount_lamports), 0) }
    }
    if (query.startsWith('SELECT COUNT(*) AS count FROM proof_backings')) {
      const rows = Object.values(this.backings).filter((backing) => (
        backing.pool_id === args[0]
        && ['confirmed', 'refunding'].includes(backing.status)
      ))
      return { count: rows.length }
    }
    return undefined
  }

  private all(sql: string, args: any[]) {
    const query = this.normalized(sql)
    if (query === 'SELECT * FROM proof_pools ORDER BY created_at DESC') {
      return this.clone(Object.values(this.pools).sort((a, b) => b.created_at - a.created_at))
    }
    if (query.startsWith('SELECT * FROM proof_backings WHERE pool_id = ? AND status IN')) {
      return this.clone(Object.values(this.backings)
        .filter((backing) => backing.pool_id === args[0] && ['confirmed', 'distributing', 'distributed', 'refunding'].includes(backing.status))
        .sort((a, b) => a.slot_number - b.slot_number || a.created_at - b.created_at))
    }
    if (query.startsWith('SELECT * FROM proof_backings WHERE pool_id = ? ORDER BY')) {
      return this.clone(Object.values(this.backings)
        .filter((backing) => backing.pool_id === args[0])
        .sort((a, b) => a.slot_number - b.slot_number || a.created_at - b.created_at))
    }
    if (query.startsWith('SELECT * FROM proof_pool_events WHERE pool_id = ?')) {
      return this.clone(Object.values(this.events)
        .filter((event) => event.pool_id === args[0])
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 100))
    }
    if (query === 'SELECT * FROM proof_partner_sessions ORDER BY created_at DESC') {
      return this.clone(Object.values(this.partnerSessions).sort((a, b) => b.created_at - a.created_at))
    }
    return []
  }
}

const {
  mockState,
  mockGetConnection,
  mockExecuteInstructions,
  secureKeys,
} = vi.hoisted(() => ({
  mockState: {
    db: null as FakeDb | null,
    connection: {
      getParsedTransaction: vi.fn(),
      getBalance: vi.fn(),
    },
  },
  mockGetConnection: vi.fn(),
  mockExecuteInstructions: vi.fn(),
  secureKeys: new Map<string, string>(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => {
    if (!mockState.db) throw new Error('test db not initialized')
    return mockState.db
  },
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: (keyName: string) => secureKeys.get(keyName) ?? null,
  storeKey: (keyName: string, value: string) => {
    secureKeys.set(keyName, value)
  },
  deleteKey: (keyName: string) => {
    secureKeys.delete(keyName)
  },
  listKeys: () => [...secureKeys.keys()].map((key_name) => ({ key_name, hint: '****' })),
  isEncryptionAvailable: () => true,
}))

vi.mock('../../electron/services/SolanaService', () => ({
  getConnection: mockGetConnection,
  executeInstructions: mockExecuteInstructions,
}))

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
}))

import {
  configurePartnerCredentials,
  configureEscrow,
  createPartnerSession,
  createPool,
  exportEscrowPrivateKey,
  getPartnerCredentialStatus,
  getEscrowStatus,
  importVanityMint,
  listPools,
  pollPartnerSession,
  refundPool,
  verifyProofLaunchWebhookSignature,
  verifyBacking,
} from '../../electron/services/ProofPoolService'

function setupDb() {
  const db = new FakeDb()
  mockState.db = db
  return db
}

function parsedTransferTx(source: string, destination: string, lamports: number) {
  return {
    meta: { err: null },
    transaction: {
      message: {
        instructions: [{
          program: 'system',
          parsed: {
            type: 'transfer',
            info: { source, destination, lamports },
          },
        }],
      },
    },
  }
}

function mockJsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response
}

describe('ProofPoolService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    secureKeys.clear()
    mockState.db?.close()
    setupDb()
    mockGetConnection.mockReturnValue(mockState.connection)
    mockExecuteInstructions.mockResolvedValue({ signature: 'sig', transport: 'rpc' })
    mockState.connection.getBalance.mockResolvedValue(1_000_000_000)
    vi.stubGlobal('fetch', vi.fn())
  })

  it('generates and reports a dedicated Proof escrow', () => {
    const status = configureEscrow()

    expect(status.configured).toBe(true)
    expect(status.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    expect(getEscrowStatus().address).toBe(status.address)
  })

  it('exports the Proof escrow key with a cooldown', () => {
    const status = configureEscrow()
    const exported = exportEscrowPrivateKey()

    expect(exported.address).toBe(status.address)
    expect(exported.privateKeyBase58).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
    expect(() => exportEscrowPrivateKey()).toThrow(/cooldown/i)
  })

  it('creates a pool with isolated pool and creator sub-escrow keys', () => {
    const creator = Keypair.generate().publicKey.toBase58()

    const detail = createPool({
      name: 'Daemon Proof',
      symbol: 'DPRF',
      description: 'Pooled launch',
      creatorWallet: creator,
      totalSlots: 4,
      minBackingSol: 0.05,
      backingDays: 3,
    })

    expect(detail.pool.status).toBe('backing')
    expect(detail.pool.total_slots).toBe(4)
    expect(detail.pool.creator_wallet).toBe(creator)
    expect(detail.pool.pool_wallet).not.toBe(detail.pool.creator_subescrow)
    expect(secureKeys.has(detail.pool.pool_key_name)).toBe(true)
    expect(secureKeys.has(detail.pool.creator_key_name)).toBe(true)
    expect(listPools()).toHaveLength(1)
  })

  it('verifies deposit signatures and marks the pool funded when slots fill', async () => {
    const creator = Keypair.generate().publicKey.toBase58()
    const backerA = Keypair.generate().publicKey.toBase58()
    const backerB = Keypair.generate().publicKey.toBase58()
    const pool = createPool({
      name: 'Fund Me',
      symbol: 'FUND',
      description: 'Pool funding',
      creatorWallet: creator,
      totalSlots: 2,
      minBackingSol: 0.05,
      backingDays: 3,
    }).pool

    mockState.connection.getParsedTransaction
      .mockResolvedValueOnce(parsedTransferTx(backerA, pool.pool_wallet, 0.05 * LAMPORTS_PER_SOL))
      .mockResolvedValueOnce(parsedTransferTx(backerB, pool.pool_wallet, 0.06 * LAMPORTS_PER_SOL))

    const first = await verifyBacking({
      poolId: pool.id,
      backerWallet: backerA,
      amountSol: 0.05,
      depositSignature: 'sig-a',
    })
    const second = await verifyBacking({
      poolId: pool.id,
      backerWallet: backerB,
      amountSol: 0.06,
      depositSignature: 'sig-b',
    })

    expect(first.pool.status).toBe('backing')
    expect(second.pool.status).toBe('funded')
    expect(second.pool.current_backing_sol).toBeCloseTo(0.11)
    expect(second.pool.current_backing_lamports).toBe(110_000_000)
    expect(second.backings.map((backing) => backing.slot_number)).toEqual([1, 2])
  })

  it('records the actual verified transfer lamports instead of the submitted amount', async () => {
    const creator = Keypair.generate().publicKey.toBase58()
    const backer = Keypair.generate().publicKey.toBase58()
    const pool = createPool({
      name: 'Overpaid',
      symbol: 'OVR',
      description: 'Pool funding',
      creatorWallet: creator,
      totalSlots: 2,
      minBackingSol: 0.05,
      backingDays: 3,
    }).pool

    mockState.connection.getParsedTransaction.mockResolvedValueOnce(
      parsedTransferTx(backer, pool.pool_wallet, 0.08 * LAMPORTS_PER_SOL),
    )

    const detail = await verifyBacking({
      poolId: pool.id,
      backerWallet: backer,
      amountSol: 0.05,
      depositSignature: 'sig-overpaid',
    })

    expect(detail.backings[0].amount_sol).toBeCloseTo(0.08)
    expect(detail.backings[0].amount_lamports).toBe(80_000_000)
  })

  it('refunds funded pools after the backing deadline without platform top-up', async () => {
    const db = mockState.db!
    const creator = Keypair.generate().publicKey.toBase58()
    const backerA = Keypair.generate().publicKey.toBase58()
    const backerB = Keypair.generate().publicKey.toBase58()
    const pool = createPool({
      name: 'Refundable',
      symbol: 'RFND',
      description: 'Expired funded pool',
      creatorWallet: creator,
      totalSlots: 2,
      minBackingSol: 0.05,
      backingDays: 3,
    }).pool

    mockState.connection.getParsedTransaction
      .mockResolvedValueOnce(parsedTransferTx(backerA, pool.pool_wallet, 0.05 * LAMPORTS_PER_SOL))
      .mockResolvedValueOnce(parsedTransferTx(backerB, pool.pool_wallet, 0.06 * LAMPORTS_PER_SOL))
    await verifyBacking({ poolId: pool.id, backerWallet: backerA, amountSol: 0.05, depositSignature: 'sig-r-a' })
    await verifyBacking({ poolId: pool.id, backerWallet: backerB, amountSol: 0.06, depositSignature: 'sig-r-b' })
    db.pools[pool.id].backing_deadline = Date.now() - 1

    const detail = await refundPool(pool.id)

    expect(detail.pool.status).toBe('failed')
    expect(detail.pool.current_backing_lamports).toBe(0)
    expect(detail.backings.map((backing) => backing.status)).toEqual(['refunded', 'refunded'])
    expect(mockExecuteInstructions).toHaveBeenCalledTimes(2)
  })

  it('rejects a deposit signature that does not pay the pool wallet', async () => {
    const creator = Keypair.generate().publicKey.toBase58()
    const backer = Keypair.generate().publicKey.toBase58()
    const wrongDestination = Keypair.generate().publicKey.toBase58()
    const pool = createPool({
      name: 'Reject',
      symbol: 'RJCT',
      description: 'Bad tx',
      creatorWallet: creator,
      totalSlots: 2,
      minBackingSol: 0.05,
      backingDays: 3,
    }).pool

    mockState.connection.getParsedTransaction.mockResolvedValueOnce(
      parsedTransferTx(backer, wrongDestination, 0.05 * LAMPORTS_PER_SOL),
    )

    await expect(verifyBacking({
      poolId: pool.id,
      backerWallet: backer,
      amountSol: 0.05,
      depositSignature: 'sig-wrong',
    })).rejects.toThrow(/must transfer at least/i)
  })

  it('requires imported vanity mints to end with pooL', () => {
    const keypair = Keypair.generate()
    expect(keypair.publicKey.toBase58().endsWith('pooL')).toBe(false)

    expect(() => importVanityMint({
      privateKeyBase58: bs58.encode(keypair.secretKey),
    })).toThrow('Vanity mint must end with pooL')
  })

  it('stores ProofLaunch partner credentials without exposing values', () => {
    const status = configurePartnerCredentials({
      apiKey: 'pl_test_local',
      webhookSecret: 'webhook_secret',
    })

    expect(status.apiKeyConfigured).toBe(true)
    expect(status.webhookSecretConfigured).toBe(true)
    expect(getPartnerCredentialStatus()).toMatchObject({
      apiKeyConfigured: true,
      webhookSecretConfigured: true,
      partnerSlug: 'daemon',
    })
    expect(secureKeys.has('PROOFLAUNCH_PARTNER_API_KEY')).toBe(true)
    expect(secureKeys.has('PROOFLAUNCH_PARTNER_WEBHOOK_SECRET')).toBe(true)
  })

  it('creates a ProofLaunch hosted checkout session with partner auth', async () => {
    const creator = Keypair.generate().publicKey.toBase58()
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(mockJsonResponse({
      checkout_url: 'https://prooflaunch.fun/submit?session=pls_test',
      status: 'created',
    }))
    configurePartnerCredentials({ apiKey: 'pl_test_local' })

    const session = await createPartnerSession({
      name: 'DAEMON Test',
      symbol: 'DTEST',
      description: 'Integration smoke test',
      creatorWallet: creator,
      totalSlots: 4,
      minBackingSol: 0.1,
      metadata: { twitter: 'https://x.com/daemon' },
      returnUrl: 'daemonide.tech/launch-complete',
    })

    const [, init] = fetchMock.mock.calls[0]
    const headers = init?.headers as Headers
    const body = JSON.parse(init?.body as string)
    expect(headers.get('Authorization')).toBe('Bearer pl_test_local')
    expect(body.creator_wallet).toBe(creator)
    expect(body.return_url).toBe('https://daemonide.tech/launch-complete')
    expect(session.id).toBe('pls_test')
    expect(session.checkout_url).toBe('https://prooflaunch.fun/submit?session=pls_test')
  })

  it('polls a ProofLaunch session and stores meme details', async () => {
    const creator = Keypair.generate().publicKey.toBase58()
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(mockJsonResponse({
        id: 'pls_test',
        checkout_url: 'https://prooflaunch.fun/submit?session=pls_test',
        status: 'created',
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        id: 'pls_test',
        status: 'submitted',
        meme_id: 'meme_123',
        meme_url: 'https://prooflaunch.fun/meme/meme_123',
      }))
    configurePartnerCredentials({ apiKey: 'pl_test_local' })
    await createPartnerSession({
      name: 'DAEMON Test',
      symbol: 'DTEST',
      description: 'Integration smoke test',
      creatorWallet: creator,
      totalSlots: 4,
      minBackingSol: 0.1,
    })

    const session = await pollPartnerSession('pls_test')

    expect(session.status).toBe('submitted')
    expect(session.meme_id).toBe('meme_123')
    expect(session.meme_url).toBe('https://prooflaunch.fun/meme/meme_123')
    expect(session.last_polled_at).toBeGreaterThan(0)
  })

  it('verifies ProofLaunch webhook signatures and rejects replay drift', () => {
    configurePartnerCredentials({ webhookSecret: 'webhook_secret' })
    const timestamp = String(Date.now())
    const body = '{"event":"submitted"}'
    const signature = createHmac('sha256', 'webhook_secret')
      .update(`${timestamp}.${body}`)
      .digest('hex')
    const staleTimestamp = String(Date.now() - 10 * 60 * 1000)
    const staleSignature = createHmac('sha256', 'webhook_secret')
      .update(`${staleTimestamp}.${body}`)
      .digest('hex')

    const invalidSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`

    expect(verifyProofLaunchWebhookSignature(body, timestamp, signature)).toBe(true)
    expect(verifyProofLaunchWebhookSignature(body, timestamp, invalidSignature)).toBe(false)
    expect(verifyProofLaunchWebhookSignature(body, timestamp, signature)).toBe(false)
    expect(verifyProofLaunchWebhookSignature(body, staleTimestamp, staleSignature)).toBe(false)
  })
})

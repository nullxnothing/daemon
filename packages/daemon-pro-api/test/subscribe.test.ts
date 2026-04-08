import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Integration tests for the Daemon Pro API subscribe + gated-route flow.
 *
 * Uses an in-memory-ish SQLite DB by pointing DAEMON_PRO_DB_PATH at a temp
 * file that's deleted between tests. Since `getDb()` memoizes the instance,
 * we import the module dynamically after setting env vars so each test file
 * gets a fresh DB + config.
 */

const TEST_DB = path.join(process.cwd(), 'test-subscribe.db')

function clearTestDb() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = TEST_DB + suffix
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
}

clearTestDb()
process.env.PORT = '0'
process.env.NODE_ENV = 'test'
process.env.DAEMON_PRO_DB_PATH = TEST_DB
process.env.DAEMON_PRO_JWT_SECRET = 'test-secret-for-integration-suite-xxxxxxxxxx'
process.env.DAEMON_PRO_PRICE_USDC = '5'
process.env.DAEMON_PRO_DURATION_DAYS = '30'
process.env.DAEMON_PRO_PAY_TO = 'FeeW4lLet1111111111111111111111111111111111'
process.env.DAEMON_PRO_NETWORK = 'solana:devnet'
process.env.DAEMON_PRO_SKILLS_DIR = path.join(process.cwd(), 'content/pro-skills')

// Import AFTER env is set so config.ts picks up the test values.
const { createApp } = await import('../src/index.js')
const { closeDb } = await import('../src/lib/db.js')

const app = createApp()

function buildPaymentHeader(overrides: Record<string, string> = {}): string {
  const payload = {
    wallet: 'TestWallet11111111111111111111111111111111',
    signature: 'test-signature',
    nonce: `nonce-${Math.random().toString(36).slice(2)}`,
    amount: '5000000',
    network: 'solana:devnet',
    ...overrides,
  }
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

afterAll(() => {
  closeDb()
  clearTestDb()
})

describe('GET /v1/health', () => {
  it('returns service metadata without auth', async () => {
    const res = await request(app).get('/v1/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.service).toBe('daemon-pro-api')
    expect(res.body.data.priceUsdc).toBe(5)
  })
})

describe('GET /v1/subscribe/price', () => {
  it('returns price, duration, network, payTo without auth', async () => {
    const res = await request(app).get('/v1/subscribe/price')
    expect(res.status).toBe(200)
    expect(res.body.data.priceUsdc).toBe(5)
    expect(res.body.data.durationDays).toBe(30)
    expect(res.body.data.network).toBe('solana:devnet')
    expect(res.body.data.payTo).toBeTruthy()
  })
})

describe('POST /v1/subscribe — x402 handshake', () => {
  it('returns 402 with x402 challenge body when X-Payment is absent', async () => {
    const res = await request(app).post('/v1/subscribe')
    expect(res.status).toBe(402)
    expect(res.body.x402Version).toBe(1)
    expect(Array.isArray(res.body.accepts)).toBe(true)
    expect(res.body.accepts[0].scheme).toBe('exact')
    expect(res.body.accepts[0].network).toBe('solana:devnet')
    expect(res.body.accepts[0].asset).toBe('USDC')
    expect(res.body.accepts[0].payTo).toBe('FeeW4lLet1111111111111111111111111111111111')
    // 5 USDC in µUSDC
    expect(res.body.accepts[0].maxAmountRequired).toBe('5000000')
  })

  it('returns 200 + JWT when a well-formed X-Payment header is supplied', async () => {
    const res = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader())
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.jwt).toBe('string')
    expect(res.body.jwt.split('.')).toHaveLength(3) // JWT has 3 dot-separated parts
    expect(res.body.tier).toBe('pro')
    expect(res.body.features).toEqual(['arena', 'pro-skills', 'mcp-sync', 'priority-api'])
    expect(res.body.expiresAt).toBeGreaterThan(Date.now())
  })

  it('rejects a replayed nonce with 409', async () => {
    const header = buildPaymentHeader({ nonce: 'replay-nonce-xyz' })
    const first = await request(app).post('/v1/subscribe').set('X-Payment', header)
    expect(first.status).toBe(200)

    const second = await request(app).post('/v1/subscribe').set('X-Payment', header)
    expect(second.status).toBe(409)
    expect(second.body.error).toMatch(/already consumed/i)
  })

  it('rejects a payment below the minimum amount', async () => {
    const res = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ amount: '1000000', nonce: 'below-min' })) // 1 USDC
    expect(res.status).toBe(402)
    expect(res.body.error).toMatch(/below required amount/i)
  })

  it('rejects a payment on the wrong network', async () => {
    const res = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ network: 'ethereum:mainnet', nonce: 'wrong-net' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/network mismatch/i)
  })

  it('rejects a malformed X-Payment header', async () => {
    const res = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', 'not-base64url-json')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/malformed/i)
  })
})

describe('GET /v1/subscribe/status', () => {
  it('returns active:false for a wallet that has never subscribed', async () => {
    const res = await request(app)
      .get('/v1/subscribe/status')
      .query({ wallet: 'NotASubscriber111111111111111111111111111111' })
    expect(res.status).toBe(200)
    expect(res.body.data.active).toBe(false)
    expect(res.body.data.expiresAt).toBeNull()
    expect(res.body.data.features).toEqual([])
  })

  it('returns active:true after a successful subscribe', async () => {
    const wallet = 'StatusTestWallet11111111111111111111111111'
    await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ wallet, nonce: 'status-nonce' }))

    const res = await request(app).get('/v1/subscribe/status').query({ wallet })
    expect(res.status).toBe(200)
    expect(res.body.data.active).toBe(true)
    expect(res.body.data.expiresAt).toBeGreaterThan(Date.now())
    expect(res.body.data.tier).toBe('pro')
  })
})

describe('Gated routes — requireSubscription middleware', () => {
  async function getJwt(wallet: string, nonce: string): Promise<string> {
    const res = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ wallet, nonce }))
    return res.body.jwt as string
  }

  it('401s on GET /v1/sync/mcp without a JWT', async () => {
    const res = await request(app).get('/v1/sync/mcp')
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/missing|subscription/i)
  })

  it('401s on GET /v1/arena/submissions without a JWT', async () => {
    const res = await request(app).get('/v1/arena/submissions')
    expect(res.status).toBe(401)
  })

  it('401s with a forged JWT', async () => {
    const res = await request(app)
      .get('/v1/sync/mcp')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.fake.fake')
    expect(res.status).toBe(401)
  })

  it('accepts a valid JWT on GET /v1/sync/mcp', async () => {
    const jwt = await getJwt('SyncGatedTest1111111111111111111111111111', 'sync-nonce-1')
    const res = await request(app)
      .get('/v1/sync/mcp')
      .set('Authorization', `Bearer ${jwt}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data).toBeNull() // no MCP config saved yet
  })
})

describe('POST /v1/sync/mcp — MCP config roundtrip', () => {
  it('stores + retrieves the MCP config for a wallet', async () => {
    const wallet = 'McpSyncTestWallet11111111111111111111111111'
    const subscribe = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ wallet, nonce: 'mcp-nonce-1' }))
    const jwt = subscribe.body.jwt as string

    const put = await request(app)
      .post('/v1/sync/mcp')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        version: 1,
        updatedAt: Date.now(),
        mcpServers: {
          'helius-mcp': {
            command: 'npx',
            args: ['-y', '@helius/mcp-server'],
          },
        },
      })
    expect(put.status).toBe(200)
    expect(put.body.ok).toBe(true)

    const get = await request(app)
      .get('/v1/sync/mcp')
      .set('Authorization', `Bearer ${jwt}`)
    expect(get.status).toBe(200)
    expect(get.body.data.version).toBe(1)
    expect(get.body.data.mcpServers['helius-mcp'].command).toBe('npx')
  })

  it('rejects an unsupported version', async () => {
    const wallet = 'McpVersionTest111111111111111111111111111111'
    const subscribe = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ wallet, nonce: 'mcp-ver' }))
    const jwt = subscribe.body.jwt as string

    const res = await request(app)
      .post('/v1/sync/mcp')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ version: 99, mcpServers: {} })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/version/i)
  })
})

describe('Arena — submission + voting', () => {
  let jwt: string
  const wallet = 'ArenaTestWallet11111111111111111111111111111'

  beforeEach(async () => {
    // Fresh subscription per test (fresh nonce)
    const subscribe = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({
        wallet,
        nonce: `arena-${Math.random().toString(36).slice(2)}`,
      }))
    jwt = subscribe.body.jwt as string
  })

  it('lists submissions (empty initially)', async () => {
    const res = await request(app)
      .get('/v1/arena/submissions')
      .set('Authorization', `Bearer ${jwt}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('accepts a valid submission and lists it', async () => {
    const submit = await request(app)
      .post('/v1/arena/submit')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        title: 'Test Tool',
        description: 'A well-formed test submission for the integration suite',
        category: 'tool',
        githubUrl: 'https://github.com/test/test-repo',
      })
    expect(submit.status).toBe(201)
    expect(submit.body.data.id).toBeTruthy()

    const list = await request(app)
      .get('/v1/arena/submissions')
      .set('Authorization', `Bearer ${jwt}`)
    const found = list.body.data.find((s: { id: string }) => s.id === submit.body.data.id)
    expect(found).toBeTruthy()
    expect(found.title).toBe('Test Tool')
    expect(found.votes).toBe(0)
  })

  it('rejects an invalid category', async () => {
    const res = await request(app)
      .post('/v1/arena/submit')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        title: 'Bad',
        description: 'x'.repeat(20),
        category: 'nonsense',
        githubUrl: 'https://github.com/test/test',
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/category/i)
  })

  it('rejects a non-github URL', async () => {
    const res = await request(app)
      .post('/v1/arena/submit')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        title: 'Bad URL',
        description: 'x'.repeat(20),
        category: 'tool',
        githubUrl: 'https://gitlab.com/not/github',
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/github/i)
  })

  it('enforces one-vote-per-wallet-per-submission', async () => {
    const submit = await request(app)
      .post('/v1/arena/submit')
      .set('Authorization', `Bearer ${jwt}`)
      .send({
        title: 'Vote Target',
        description: 'submission to vote against twice',
        category: 'tool',
        githubUrl: 'https://github.com/test/vote-target',
      })
    const id = submit.body.data.id

    const vote1 = await request(app)
      .post(`/v1/arena/vote/${id}`)
      .set('Authorization', `Bearer ${jwt}`)
    expect(vote1.status).toBe(200)

    const vote2 = await request(app)
      .post(`/v1/arena/vote/${id}`)
      .set('Authorization', `Bearer ${jwt}`)
    expect(vote2.status).toBe(409)
    expect(vote2.body.error).toMatch(/already voted/i)
  })
})

describe('Pro skills — manifest + file download', () => {
  let jwt: string

  beforeEach(async () => {
    const subscribe = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({
        wallet: 'ProSkillsTestWallet11111111111111111111111',
        nonce: `skills-${Math.random().toString(36).slice(2)}`,
      }))
    jwt = subscribe.body.jwt as string
  })

  it('returns the manifest with the two sample skills', async () => {
    const res = await request(app)
      .get('/v1/pro-skills/manifest')
      .set('Authorization', `Bearer ${jwt}`)
    expect(res.status).toBe(200)
    expect(res.body.data.version).toBe(1)
    expect(Array.isArray(res.body.data.skills)).toBe(true)
    const ids = res.body.data.skills.map((s: { id: string }) => s.id)
    expect(ids).toContain('sample-audit-pipeline')
    expect(ids).toContain('sample-codama-pro')
  })

  it('reads description + version from skill.json', async () => {
    const res = await request(app)
      .get('/v1/pro-skills/manifest')
      .set('Authorization', `Bearer ${jwt}`)
    const audit = res.body.data.skills.find((s: { id: string }) => s.id === 'sample-audit-pipeline')
    expect(audit.version).toBe('0.1.0')
    expect(audit.description).toMatch(/audit/i)
  })

  it('downloads files for a skill', async () => {
    const res = await request(app)
      .get('/v1/pro-skills/sample-audit-pipeline/files')
      .set('Authorization', `Bearer ${jwt}`)
    expect(res.status).toBe(200)
    expect(res.body.data.skillId).toBe('sample-audit-pipeline')
    expect(Array.isArray(res.body.data.files)).toBe(true)
    const paths = res.body.data.files.map((f: { path: string }) => f.path)
    expect(paths).toContain('SKILL.md')
    expect(paths).toContain('skill.json')
  })

  it('rejects a path-traversal skill id', async () => {
    const res = await request(app)
      .get('/v1/pro-skills/..%2F..%2Fetc/files')
      .set('Authorization', `Bearer ${jwt}`)
    expect(res.status).toBe(400)
  })

  it('404s on an unknown skill id', async () => {
    const res = await request(app)
      .get('/v1/pro-skills/does-not-exist/files')
      .set('Authorization', `Bearer ${jwt}`)
    expect(res.status).toBe(404)
  })
})

describe('Priority API — quota enforcement', () => {
  it('returns quota status', async () => {
    const wallet = 'PriorityQuotaTest11111111111111111111111111'
    const subscribe = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ wallet, nonce: 'quota-nonce' }))
    const jwt = subscribe.body.jwt as string

    const res = await request(app)
      .get('/v1/priority/quota')
      .set('Authorization', `Bearer ${jwt}`)
    expect(res.status).toBe(200)
    expect(res.body.data.quota).toBe(500)
    expect(res.body.data.used).toBe(0)
    expect(res.body.data.remaining).toBe(500)
  })

  it('increments usage on explain-tx call', async () => {
    const wallet = 'ExplainTxTest111111111111111111111111111111'
    const subscribe = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ wallet, nonce: 'explain-nonce' }))
    const jwt = subscribe.body.jwt as string

    const call = await request(app)
      .post('/v1/priority/explain-tx')
      .set('Authorization', `Bearer ${jwt}`)
      .send({ signature: 'testSig123' })
    expect(call.status).toBe(200)
    expect(call.body.data.kind).toBe('stub')

    const quota = await request(app)
      .get('/v1/priority/quota')
      .set('Authorization', `Bearer ${jwt}`)
    expect(quota.body.data.used).toBe(1)
  })

  it('rejects explain-tx without a signature', async () => {
    const wallet = 'ExplainTxNoSig11111111111111111111111111111'
    const subscribe = await request(app)
      .post('/v1/subscribe')
      .set('X-Payment', buildPaymentHeader({ wallet, nonce: 'explain-nosig' }))
    const jwt = subscribe.body.jwt as string

    const res = await request(app)
      .post('/v1/priority/explain-tx')
      .set('Authorization', `Bearer ${jwt}`)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/signature required/i)
  })
})

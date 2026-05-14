import type { Server } from 'node:http'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createDaemonSubscriptionGateway,
  verifyDaemonAiJwt,
  type DaemonProHolderVerifier,
  type DaemonProPaymentVerifier,
} from '../../electron/services/daemon-ai-cloud'

const jwtSecret = 'subscription-test-secret'

describe('Daemon subscription gateway', () => {
  let server: Server | null = null
  let db: ReturnType<typeof createFakeDb> | null = null

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) return resolve()
      server.close((error) => error ? reject(error) : resolve())
    })
    server = null
    db = null
  })

  function createFakeDb() {
    const subscriptions = new Map<string, {
      wallet_address: string
      plan: string
      access_source: string
      payment_id: string | null
      expires_at: number
      features_json: string
      revoked_at: number | null
    }>()
    const challenges = new Map<string, {
      wallet_address: string
      nonce: string
      message: string
      expires_at: number
      used_at: number | null
    }>()
    const auditRows: Array<{
      wallet_address: string | null
      action: string
      actor: string | null
      plan: string | null
      access_source: string | null
      payment_id: string | null
    }> = []

    return {
      auditRows,
      exec: vi.fn(),
      transaction: vi.fn((fn: () => void) => fn),
      prepare: vi.fn((sql: string) => ({
        get: vi.fn((...args: unknown[]) => {
          if (sql.includes('FROM daemon_subscriptions') && sql.includes('payment_id = ?')) {
            const paymentId = String(args[0])
            return [...subscriptions.values()].find((row) => row.payment_id === paymentId)
          }
          if (sql.includes('FROM daemon_subscriptions') && sql.includes('wallet_address = ?')) {
            const wallet = String(args[0])
            const now = Number(args[1])
            const row = subscriptions.get(wallet)
            return row && row.expires_at > now && row.revoked_at === null ? row : undefined
          }
          if (sql.includes('FROM daemon_holder_challenges')) {
            return challenges.get(String(args[0]))
          }
          return undefined
        }),
        run: vi.fn((...args: unknown[]) => {
          if (sql.includes('INSERT INTO daemon_subscriptions')) {
            subscriptions.set(String(args[0]), {
              wallet_address: String(args[0]),
              plan: String(args[1]),
              access_source: String(args[2]),
              payment_id: args[3] == null ? null : String(args[3]),
              expires_at: Number(args[4]),
              features_json: String(args[5]),
              revoked_at: null,
            })
          }
          if (sql.includes('INSERT INTO daemon_holder_challenges')) {
            challenges.set(String(args[0]), {
              nonce: String(args[0]),
              wallet_address: String(args[1]),
              message: String(args[2]),
              expires_at: Number(args[3]),
              used_at: null,
            })
          }
          if (sql.includes('UPDATE daemon_holder_challenges SET used_at')) {
            const nonce = String(args[1])
            const challenge = challenges.get(nonce)
            if (challenge) challenges.set(nonce, { ...challenge, used_at: Number(args[0]) })
          }
          if (sql.includes('UPDATE daemon_subscriptions') && sql.includes('revoked_at')) {
            const wallet = String(args[2])
            const row = subscriptions.get(wallet)
            if (row) subscriptions.set(wallet, { ...row, revoked_at: Number(args[0]) })
          }
          if (sql.includes('INSERT INTO daemon_subscription_audit')) {
            auditRows.push({
              wallet_address: args[1] == null ? null : String(args[1]),
              action: String(args[2]),
              actor: args[3] == null ? null : String(args[3]),
              plan: args[4] == null ? null : String(args[4]),
              access_source: args[5] == null ? null : String(args[5]),
              payment_id: args[6] == null ? null : String(args[6]),
            })
          }
        }),
      })),
    }
  }

  async function listen(options: {
    paymentVerifier?: DaemonProPaymentVerifier
    holderVerifier?: DaemonProHolderVerifier
    env?: NodeJS.ProcessEnv
  } = {}) {
    db = createFakeDb()
    const app = createDaemonSubscriptionGateway({
      db: db as never,
      jwtSecret,
      paymentVerifier: options.paymentVerifier,
      holderVerifier: options.holderVerifier,
      env: {
        DAEMON_PRO_PAY_TO: Keypair.generate().publicKey.toBase58(),
        ...options.env,
      } as NodeJS.ProcessEnv,
    })
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
    const address = server!.address()
    if (!address || typeof address === 'string') throw new Error('server failed to bind')
    return `http://127.0.0.1:${address.port}`
  }

  it('returns a 402 payment requirement before granting a paid plan', async () => {
    const baseUrl = await listen()

    const response = await fetch(`${baseUrl}/v1/subscribe`, { method: 'POST' })
    const body = await response.json()

    expect(response.status).toBe(402)
    expect(response.headers.get('payment-required')).toBeTruthy()
    expect(body).toMatchObject({
      ok: false,
      code: 'daemon_pro_payment_required',
    })
  })

  it('verifies payment, persists subscription status, and issues a signed entitlement JWT', async () => {
    const walletAddress = Keypair.generate().publicKey.toBase58()
    const paymentVerifier: DaemonProPaymentVerifier = {
      verifyPayment: vi.fn(async (_header, price) => ({
        walletAddress,
        paymentId: 'tx-paid-1',
        plan: price.plan,
        paidUsdc: price.priceUsdc,
      })),
    }
    const baseUrl = await listen({ paymentVerifier })

    const paymentHeader = Buffer.from(JSON.stringify({ txSignature: 'tx-paid-1' })).toString('base64url')
    const response = await fetch(`${baseUrl}/v1/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-payment': paymentHeader },
      body: JSON.stringify({ plan: 'operator' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      tier: 'operator',
      plan: 'operator',
      paymentId: 'tx-paid-1',
    })
    expect(verifyDaemonAiJwt(body.jwt, jwtSecret)).toMatchObject({
      walletAddress,
      plan: 'operator',
      accessSource: 'payment',
      allowedLanes: expect.arrayContaining(['reasoning']),
    })

    const statusResponse = await fetch(`${baseUrl}/v1/subscribe/status?wallet=${walletAddress}`)
    const status = await statusResponse.json()
    expect(status.data).toMatchObject({
      active: true,
      plan: 'operator',
      accessSource: 'payment',
      tier: 'operator',
    })
  })

  it('rejects replaying a settled payment for a different wallet', async () => {
    const firstWallet = Keypair.generate().publicKey.toBase58()
    const secondWallet = Keypair.generate().publicKey.toBase58()
    const paymentVerifier: DaemonProPaymentVerifier = {
      verifyPayment: vi.fn()
        .mockResolvedValueOnce({ walletAddress: firstWallet, paymentId: 'tx-replay', plan: 'pro', paidUsdc: 20 })
        .mockResolvedValueOnce({ walletAddress: secondWallet, paymentId: 'tx-replay', plan: 'pro', paidUsdc: 20 }),
    }
    const baseUrl = await listen({ paymentVerifier })
    const paymentHeader = Buffer.from(JSON.stringify({ txSignature: 'tx-replay' })).toString('base64url')

    await fetch(`${baseUrl}/v1/subscribe`, { method: 'POST', headers: { 'x-payment': paymentHeader } })
    const replay = await fetch(`${baseUrl}/v1/subscribe`, { method: 'POST', headers: { 'x-payment': paymentHeader } })
    const body = await replay.json()

    expect(replay.status).toBe(409)
    expect(body.code).toBe('daemon_pro_payment_replayed')
  })

  it('returns the existing entitlement without extending access when the same payment is retried', async () => {
    const walletAddress = Keypair.generate().publicKey.toBase58()
    const paymentVerifier: DaemonProPaymentVerifier = {
      verifyPayment: vi.fn(async () => ({
        walletAddress,
        paymentId: 'tx-idempotent',
        plan: 'pro',
        paidUsdc: 20,
      })),
    }
    const baseUrl = await listen({ paymentVerifier })
    const paymentHeader = Buffer.from(JSON.stringify({ txSignature: 'tx-idempotent' })).toString('base64url')

    const first = await fetch(`${baseUrl}/v1/subscribe`, { method: 'POST', headers: { 'x-payment': paymentHeader } })
    const firstBody = await first.json()
    const second = await fetch(`${baseUrl}/v1/subscribe`, { method: 'POST', headers: { 'x-payment': paymentHeader } })
    const secondBody = await second.json()

    expect(second.status).toBe(200)
    expect(secondBody).toMatchObject({ ok: true, idempotent: true, paymentId: 'tx-idempotent' })
    expect(secondBody.expiresAt).toBe(firstBody.expiresAt)
  })

  it('claims holder access with a nonce signature and balance check', async () => {
    const wallet = Keypair.generate()
    const holderVerifier: DaemonProHolderVerifier = {
      getHolderBalance: vi.fn(async () => 1_500_000),
    }
    const baseUrl = await listen({
      holderVerifier,
      env: { DAEMON_HOLDER_MINT: Keypair.generate().publicKey.toBase58() } as NodeJS.ProcessEnv,
    })

    const challengeResponse = await fetch(`${baseUrl}/v1/subscribe/holder/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: wallet.publicKey.toBase58() }),
    })
    const challenge = await challengeResponse.json()
    const signature = bs58.encode(nacl.sign.detached(Buffer.from(challenge.data.message, 'utf8'), wallet.secretKey))

    const claimResponse = await fetch(`${baseUrl}/v1/subscribe/holder/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        wallet: wallet.publicKey.toBase58(),
        nonce: challenge.data.nonce,
        signature,
      }),
    })
    const claim = await claimResponse.json()

    expect(claimResponse.status).toBe(200)
    expect(verifyDaemonAiJwt(claim.data.jwt, jwtSecret)).toMatchObject({
      walletAddress: wallet.publicKey.toBase58(),
      plan: 'pro',
      accessSource: 'holder',
    })
  })

  it('supports admin grants and revocations with audit records', async () => {
    const wallet = Keypair.generate().publicKey.toBase58()
    const baseUrl = await listen({
      env: { DAEMON_PRO_ADMIN_SECRET: 'admin-secret' } as NodeJS.ProcessEnv,
    })

    const denied = await fetch(`${baseUrl}/v1/admin/subscriptions/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': 'wrong' },
      body: JSON.stringify({ walletAddress: wallet, plan: 'ultra' }),
    })
    expect(denied.status).toBe(401)

    const grant = await fetch(`${baseUrl}/v1/admin/subscriptions/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': 'admin-secret' },
      body: JSON.stringify({ walletAddress: wallet, plan: 'ultra', durationDays: 7 }),
    })
    const grantBody = await grant.json()
    expect(grant.status).toBe(200)
    expect(verifyDaemonAiJwt(grantBody.data.jwt, jwtSecret)).toMatchObject({
      walletAddress: wallet,
      plan: 'ultra',
      accessSource: 'admin',
      allowedLanes: expect.arrayContaining(['premium']),
    })

    const active = await fetch(`${baseUrl}/v1/subscribe/status?wallet=${wallet}`)
    await expect(active.json()).resolves.toMatchObject({ data: { active: true, plan: 'ultra' } })

    const revoke = await fetch(`${baseUrl}/v1/admin/subscriptions/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-secret': 'admin-secret' },
      body: JSON.stringify({ walletAddress: wallet, reason: 'test revoke' }),
    })
    expect(revoke.status).toBe(200)

    const inactive = await fetch(`${baseUrl}/v1/subscribe/status?wallet=${wallet}`)
    await expect(inactive.json()).resolves.toMatchObject({ data: { active: false, plan: 'light' } })
    expect(db?.auditRows.map((row) => row.action)).toEqual(expect.arrayContaining(['admin_grant', 'admin_revoke']))
  })
})

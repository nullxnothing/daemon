import http, { type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import {
  startRelayServer,
  stopRelayServer,
  createPairingSession,
  getRelayStatus,
} from '../../electron/services/SeekerRelayService'

async function request(
  port: number,
  path: string,
  init: { method?: string; token?: string; origin?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.token) headers['authorization'] = `Bearer ${init.token}`
  if (init.origin) headers['origin'] = init.origin
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) as { ok?: boolean } | null }
}

function tokenFromDeepLink(deepLink: string): string {
  return new URL(deepLink).searchParams.get('token') ?? ''
}

describe('SeekerRelayService', () => {
  let external: Server | null = null

  afterEach(async () => {
    await stopRelayServer()
    await new Promise<void>((resolve) => {
      if (!external) return resolve()
      external.close(() => resolve())
      external = null
    })
  })

  it('reuses an existing DAEMON seeker relay instead of logging a port conflict', async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    await stopRelayServer()

    external = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        data: {
          running: true,
          port: 0,
          relayUrl: 'http://127.0.0.1:0',
          lanUrl: 'http://127.0.0.1:0',
          sessionCount: 2,
        },
      }))
    })
    await new Promise<void>((resolve) => external!.listen(0, '0.0.0.0', resolve))
    const address = external.address()
    if (!address || typeof address === 'string') throw new Error('external server failed to bind')

    const status = await startRelayServer(address.port)

    expect(status.running).toBe(true)
    expect(status.port).toBe(address.port)
    expect(status.sessionCount).toBe(2)
  })

  describe('session authorization', () => {
    it('requires a bearer token on session-scoped endpoints and rejects browser origins', async () => {
      // Bind an ephemeral port so the test never collides with a DAEMON dev
      // instance already holding the default relay port (which would make
      // createPairingSession reuse that external relay and 404 our lookups).
      await stopRelayServer()
      await startRelayServer(0)

      const snapshot = await createPairingSession({ projectName: 'Sec Test', seedDemoApprovals: false })
      const code = snapshot.session.pairingCode
      const token = tokenFromDeepLink(snapshot.session.deepLink)
      const port = getRelayStatus().port

      expect(token).toMatch(/^[0-9a-f]{64}$/)

      // No token → 404 (does not confirm the code exists).
      const noToken = await request(port, `/api/seeker/session/${encodeURIComponent(code)}`)
      expect(noToken.status).toBe(404)

      // Wrong token → 404.
      const wrongToken = await request(port, `/api/seeker/session/${encodeURIComponent(code)}`, { token: 'deadbeef'.repeat(8) })
      expect(wrongToken.status).toBe(404)

      // Correct token → 200 with the mobile snapshot shape.
      const ok = await request(port, `/api/seeker/session/${encodeURIComponent(code)}`, { token })
      expect(ok.status).toBe(200)
      expect((ok.json as { session?: unknown } | null)?.session).toBeTruthy()

      // A browser Origin is forbidden even with the right token.
      const browser = await request(port, `/api/seeker/session/${encodeURIComponent(code)}`, { token, origin: 'https://evil.example.com' })
      expect(browser.status).toBe(403)

      // Approving an approval without the token is rejected.
      const unauth = await request(port, `/api/seeker/session/${encodeURIComponent(code)}/approvals`, {
        method: 'POST',
        body: { title: 'x', description: 'y', risk: 'low', source: 'agent' },
      })
      expect(unauth.status).toBe(404)
    })
  })
})

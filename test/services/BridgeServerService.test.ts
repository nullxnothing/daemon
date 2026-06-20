import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BridgeCallResult, BridgeToolDescriptor } from '../../electron/shared/types'

// The server only pulls getApprovalTimeoutMs from the gateway; mock it so this
// test never loads the AriaAgentService import chain.
vi.mock('../../electron/services/bridge/BridgeToolGateway', () => ({
  getApprovalTimeoutMs: () => 120_000,
}))

import {
  getBridgeStatus,
  startBridgeServer,
  stopBridgeServer,
  type BridgeServerOptions,
} from '../../electron/services/bridge/BridgeServerService'

const TOKEN = 'a'.repeat(64)
const TOOLS: BridgeToolDescriptor[] = [
  { name: 'read_wallet', description: 'Read wallets', risk: 'read', inputSchema: { type: 'object', properties: {} } },
]

function makeOptions(overrides: Partial<BridgeServerOptions> = {}): BridgeServerOptions {
  return {
    port: 0,
    token: TOKEN,
    tokenFile: 'C:/tmp/bridge.json',
    version: '0.0.0-test',
    listTools: () => TOOLS,
    executeCall: async () => ({ status: 'done', summary: 'ok' } satisfies BridgeCallResult),
    ...overrides,
  }
}

async function request(
  port: number,
  pathname: string,
  init: { method?: string; token?: string; origin?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.token) headers['authorization'] = `Bearer ${init.token}`
  if (init.origin) headers['origin'] = init.origin
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: string } | null }
}

describe('BridgeServerService', () => {
  afterEach(async () => {
    await stopBridgeServer()
  })

  it('answers ping without auth and reports status', async () => {
    const status = await startBridgeServer(makeOptions())
    expect(status.running).toBe(true)
    expect(status.toolCount).toBe(1)

    const res = await request(status.port, '/bridge/ping')
    expect(res.status).toBe(200)
    expect((res.json?.data as { app?: string })?.app).toBe('daemon')
  })

  it('returns a generic 404 for missing or wrong bearer tokens', async () => {
    const { port } = await startBridgeServer(makeOptions())

    const missing = await request(port, '/bridge/tools')
    expect(missing.status).toBe(404)

    const wrong = await request(port, '/bridge/tools', { token: 'b'.repeat(64) })
    expect(wrong.status).toBe(404)

    const right = await request(port, '/bridge/tools', { token: TOKEN })
    expect(right.status).toBe(200)
    expect(right.json?.data).toEqual(TOOLS)
  })

  it('rejects any request carrying a browser Origin header', async () => {
    const { port } = await startBridgeServer(makeOptions())
    const res = await request(port, '/bridge/tools', { token: TOKEN, origin: 'http://localhost:5173' })
    expect(res.status).toBe(403)
  })

  it('round-trips a call through the executor', async () => {
    const executeCall = vi.fn(async () => ({ status: 'done', summary: 'balance: 1 SOL', result: { sol: 1 } } satisfies BridgeCallResult))
    const { port } = await startBridgeServer(makeOptions({ executeCall }))

    const res = await request(port, '/bridge/call', {
      method: 'POST',
      token: TOKEN,
      body: { toolName: 'read_wallet', input: {}, cwd: 'C:/work/project' },
    })
    expect(res.status).toBe(200)
    expect((res.json?.data as BridgeCallResult).summary).toBe('balance: 1 SOL')
    expect(executeCall).toHaveBeenCalledWith({ toolName: 'read_wallet', input: {}, cwd: 'C:/work/project' })
  })

  it('rejects malformed call bodies with 400', async () => {
    const { port } = await startBridgeServer(makeOptions())
    const res = await request(port, '/bridge/call', { method: 'POST', token: TOKEN, body: { input: {} } })
    expect(res.status).toBe(400)
  })

  it('caps concurrent calls at 4 with 429', async () => {
    let release: () => void = () => {}
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const executeCall = vi.fn(async () => {
      await blocked
      return { status: 'done', summary: 'ok' } satisfies BridgeCallResult
    })
    const { port } = await startBridgeServer(makeOptions({ executeCall }))

    const body = { toolName: 'read_wallet', input: {} }
    const pending = Array.from({ length: 4 }, () =>
      request(port, '/bridge/call', { method: 'POST', token: TOKEN, body }))
    // Give the four in-flight requests time to register before the fifth.
    await vi.waitFor(() => expect(executeCall).toHaveBeenCalledTimes(4))

    const fifth = await request(port, '/bridge/call', { method: 'POST', token: TOKEN, body })
    expect(fifth.status).toBe(429)

    release()
    const results = await Promise.all(pending)
    for (const res of results) expect(res.status).toBe(200)
  })

  it('responds 503 to in-flight calls on shutdown', async () => {
    const executeCall = vi.fn(() => new Promise<BridgeCallResult>(() => {})) // never resolves
    const { port } = await startBridgeServer(makeOptions({ executeCall }))

    const hanging = request(port, '/bridge/call', { method: 'POST', token: TOKEN, body: { toolName: 'read_wallet', input: {} } })
    await vi.waitFor(() => expect(executeCall).toHaveBeenCalled())

    await stopBridgeServer()
    const res = await hanging
    expect(res.status).toBe(503)
    expect(getBridgeStatus().running).toBe(false)
  })
})

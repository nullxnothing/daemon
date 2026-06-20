/**
 * Bridge HTTP server — the loopback endpoint the MCP shim talks to.
 *
 * Modeled on SeekerRelayService with two deliberate deltas: it binds
 * 127.0.0.1 (never the LAN), and it has no import-side-effect auto-start —
 * main/index.ts starts it explicitly. Auth failures return a generic 404 so
 * the server doesn't advertise itself to local port scanners.
 */
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import crypto from 'node:crypto'
import type { BridgeCallResult, BridgeStatus, BridgeToolDescriptor } from '../../shared/types'
import type { BridgeCallRequest } from './BridgeToolGateway'
import { getApprovalTimeoutMs } from './BridgeToolGateway'

export interface BridgeServerOptions {
  port?: number
  token: string
  tokenFile: string
  version?: string
  listTools: () => BridgeToolDescriptor[]
  executeCall: (req: BridgeCallRequest) => Promise<BridgeCallResult>
}

const DEFAULT_PORT = Number(process.env.DAEMON_BRIDGE_PORT ?? 7337)
const MAX_BODY_BYTES = 512 * 1024
const MAX_IN_FLIGHT = 4
/** Headroom past the approval timeout for the tool handler itself to run. */
const EXECUTION_ALLOWANCE_MS = 180_000

let server: http.Server | null = null
let boundPort = DEFAULT_PORT
let options: BridgeServerOptions | null = null
let lastError: string | null = null
const inFlight = new Set<ServerResponse>()

function json(res: ServerResponse, statusCode: number, payload: unknown) {
  if (res.writableEnded) return
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!body.trim()) return resolve({})
      try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON')) }
    })
    req.on('error', reject)
  })
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

/** Web pages must not reach the bridge even from localhost; the shim sends no Origin. */
function hasBrowserOrigin(req: IncomingMessage): boolean {
  const origin = req.headers['origin']
  return typeof origin === 'string' && origin.length > 0
}

/** Constant-time bearer check against the bridge token. */
function isAuthorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers['authorization']
  const presented = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : ''
  if (!presented || presented.length !== token.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(token))
  } catch {
    return false
  }
}

function parseCallRequest(body: unknown): BridgeCallRequest | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  if (typeof record.toolName !== 'string' || !record.toolName.trim()) return null
  const input = record.input
  if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input))) return null
  return {
    toolName: record.toolName.trim(),
    input: (input as Record<string, unknown>) ?? {},
    cwd: typeof record.cwd === 'string' ? record.cwd : undefined,
  }
}

async function handleCall(req: IncomingMessage, res: ServerResponse, opts: BridgeServerOptions) {
  if (inFlight.size >= MAX_IN_FLIGHT) {
    return json(res, 429, { ok: false, error: 'Too many concurrent bridge calls' })
  }
  let body: unknown
  try {
    body = await readBody(req)
  } catch (error) {
    return json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid request' })
  }
  const call = parseCallRequest(body)
  if (!call) return json(res, 400, { ok: false, error: 'Expected { toolName, input?, cwd? }' })

  inFlight.add(res)
  const timeoutMs = getApprovalTimeoutMs() + EXECUTION_ALLOWANCE_MS
  const timer = setTimeout(() => {
    json(res, 504, { ok: false, error: 'Bridge call timed out' })
    inFlight.delete(res)
  }, timeoutMs)
  try {
    const result = await opts.executeCall(call)
    clearTimeout(timer)
    json(res, 200, { ok: true, data: result })
  } catch (error) {
    clearTimeout(timer)
    json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Bridge call failed' })
  } finally {
    inFlight.delete(res)
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, opts: BridgeServerOptions) {
  if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'Forbidden' })
  if (hasBrowserOrigin(req)) return json(res, 403, { ok: false, error: 'Forbidden' })
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)

  if (req.method === 'GET' && url.pathname === '/bridge/ping') {
    return json(res, 200, { ok: true, data: { app: 'daemon', version: opts.version ?? '0.0.0', running: true } })
  }

  // Auth failures fall through to a generic 404: don't confirm the bridge exists.
  if (!isAuthorized(req, opts.token)) return json(res, 404, { ok: false, error: 'Not found' })

  if (req.method === 'GET' && url.pathname === '/bridge/tools') {
    return json(res, 200, { ok: true, data: opts.listTools() })
  }
  if (req.method === 'POST' && url.pathname === '/bridge/call') {
    return handleCall(req, res, opts)
  }
  return json(res, 404, { ok: false, error: 'Not found' })
}

async function probeExistingBridge(port: number): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 600)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/bridge/ping`, { signal: controller.signal })
    const body = await res.json().catch(() => null) as { ok?: boolean; data?: { app?: string } } | null
    return Boolean(res.ok && body?.ok && body.data?.app === 'daemon')
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

function isAddressInUse(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'EADDRINUSE')
}

export async function startBridgeServer(opts: BridgeServerOptions): Promise<BridgeStatus> {
  if (server?.listening) return getBridgeStatus()
  options = opts
  lastError = null
  const port = opts.port ?? DEFAULT_PORT

  try {
    await new Promise<void>((resolve, reject) => {
      const nextServer = http.createServer((req, res) => {
        void handleRequest(req, res, opts).catch((error) => {
          json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Bridge error' })
        })
      })
      nextServer.once('error', reject)
      nextServer.listen(port, '127.0.0.1', () => {
        server = nextServer
        const address = nextServer.address()
        boundPort = address && typeof address === 'object' ? address.port : port
        resolve()
      })
    })
  } catch (error) {
    if (isAddressInUse(error)) {
      const isOurs = await probeExistingBridge(port)
      lastError = isOurs
        ? `Port ${port} is already served by another DAEMON instance`
        : `Port ${port} is in use by another process — set DAEMON_BRIDGE_PORT`
      return getBridgeStatus()
    }
    lastError = error instanceof Error ? error.message : String(error)
    return getBridgeStatus()
  }
  return getBridgeStatus()
}

export async function stopBridgeServer(): Promise<void> {
  if (!server) return
  const current = server
  server = null
  for (const res of inFlight) {
    json(res, 503, { ok: false, error: 'DAEMON is shutting down' })
  }
  inFlight.clear()
  await new Promise<void>((resolve) => current.close(() => resolve()))
}

export function getBridgeStatus(): BridgeStatus {
  return {
    running: Boolean(server?.listening),
    port: boundPort,
    tokenFile: options?.tokenFile ?? '',
    toolCount: options ? options.listTools().length : 0,
    ...(lastError ? { error: lastError } : {}),
  }
}

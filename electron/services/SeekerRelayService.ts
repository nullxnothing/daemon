import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import os from 'node:os'
import crypto from 'node:crypto'

export type SeekerApprovalRisk = 'low' | 'medium' | 'high'
export type SeekerApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface SeekerProjectSnapshot {
  name: string
  readiness: number
  framework?: string
  validatorOnline?: boolean
  enabledIntegrations?: number
  pendingApprovals?: number
  lastDeploy?: string
  walletBalance?: string
}

export interface SeekerApprovalRequest {
  id: string
  title: string
  description: string
  risk: SeekerApprovalRisk
  status: SeekerApprovalStatus
  source: 'agent' | 'deploy' | 'wallet' | 'system'
  command?: string
  diffSummary?: string
  createdAt: number
}

export interface SeekerRelayEvent {
  type: 'pair' | 'approval.approve' | 'approval.reject' | 'wallet.connected' | 'wallet.sign-request' | 'notification.register'
  sessionCode: string
  payload?: Record<string, unknown>
  receivedAt?: number
}

export interface SeekerSession {
  id: string
  pairingCode: string
  /** High-entropy bearer secret delivered to the paired device via the deep link/QR. */
  accessToken: string
  relayUrl: string
  deepLink: string
  projectId: string | null
  projectPath: string | null
  projectName: string
  status: 'pairing' | 'paired' | 'expired'
  createdAt: number
  expiresAt: number
  updatedAt: number
  pairedAt: number | null
  pairedDevice: string | null
  project: SeekerProjectSnapshot
  approvals: SeekerApprovalRequest[]
  events: SeekerRelayEvent[]
}

export interface SeekerRelayStatus {
  running: boolean
  port: number
  relayUrl: string
  lanUrl: string
  sessionCount: number
}

const DEFAULT_PORT = Number(process.env.DAEMON_SEEKER_RELAY_PORT ?? 7778)
const SESSION_TTL_MS = 1000 * 60 * 30
const MAX_BODY_BYTES = 512 * 1024

let server: http.Server | null = null
let boundPort = DEFAULT_PORT
let autoStartAttempted = false
let externalRelayStatus: SeekerRelayStatus | null = null
const sessions = new Map<string, SeekerSession>()

function json(res: ServerResponse, statusCode: number, payload: unknown) {
  // No CORS allow-origin: the relay serves the native app, not browsers. Browser
  // preflight will fail by design (see hasBrowserOrigin guard).
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(payload))
}

function notFound(res: ServerResponse) {
  json(res, 404, { ok: false, error: 'Not found' })
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

function getLanAddress() {
  const nets = os.networkInterfaces()
  for (const entries of Object.values(nets)) {
    for (const net of entries ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
}

function getRelayUrls(port = boundPort) {
  const lanHost = getLanAddress()
  return {
    relayUrl: `http://127.0.0.1:${port}`,
    lanUrl: `http://${lanHost}:${port}`,
  }
}

function isAddressInUse(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE')
}

async function probeExistingRelay(port: number): Promise<SeekerRelayStatus | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 600)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/seeker/status`, { signal: controller.signal })
    const body = await res.json().catch(() => null) as { ok?: boolean; data?: SeekerRelayStatus } | null
    if (res.ok && body?.ok && body.data?.relayUrl) {
      return { ...body.data, running: true, port }
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
  return null
}

function makePairingCode() {
  const segment = crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase()
  const suffix = String(10 + crypto.randomInt(89))
  return `DMN-${segment}-${suffix}`
}

function makeAccessToken() {
  return crypto.randomBytes(32).toString('hex')
}

function makeDeepLink(pairingCode: string, accessToken: string, relayUrl: string, projectName: string) {
  const params = new URLSearchParams({ code: pairingCode, token: accessToken, relay: relayUrl, project: projectName })
  return `daemonseeker://pair?${params.toString()}`
}

/** Constant-time bearer check against the session token. */
function isAuthorizedForSession(req: IncomingMessage, session: SeekerSession): boolean {
  const header = req.headers['authorization']
  const presented = typeof header === 'string' && header.startsWith('Bearer ')
    ? header.slice('Bearer '.length).trim()
    : ''
  if (!presented || presented.length !== session.accessToken.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(session.accessToken))
  } catch {
    return false
  }
}

/**
 * Reject requests that carry a browser Origin header. The relay is for the
 * native Seeker app (which sends no Origin); a web page must not reach it even
 * if it learns the LAN address.
 */
function hasBrowserOrigin(req: IncomingMessage): boolean {
  const origin = req.headers['origin']
  return typeof origin === 'string' && origin.length > 0
}

function defaultProjectSnapshot(projectName: string): SeekerProjectSnapshot {
  return {
    name: projectName,
    readiness: 87,
    framework: 'Solana project',
    validatorOnline: false,
    enabledIntegrations: 0,
    pendingApprovals: 0,
    lastDeploy: 'Not deployed yet',
    walletBalance: 'Not connected',
  }
}

function demoApprovals(): SeekerApprovalRequest[] {
  const now = Date.now()
  return [
    {
      id: crypto.randomUUID(),
      title: 'Agent file diff',
      description: 'Review generated changes before the desktop agent writes to disk.',
      risk: 'medium',
      status: 'pending',
      source: 'agent',
      diffSummary: '+ Seeker tab, + desktop relay, + mobile pairing flow',
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      title: 'Devnet deploy approval',
      description: 'Approve the build command and hand the deploy signature to Seeker.',
      risk: 'high',
      status: 'pending',
      source: 'deploy',
      command: 'anchor build && anchor deploy --provider.cluster devnet',
      createdAt: now + 1,
    },
    {
      id: crypto.randomUUID(),
      title: 'Wallet signing test',
      description: 'Use Seeker as the secure approval device for a wallet signing request.',
      risk: 'low',
      status: 'pending',
      source: 'wallet',
      createdAt: now + 2,
    },
  ]
}

function publicSession(session: SeekerSession) {
  return {
    id: session.id,
    pairingCode: session.pairingCode,
    relayUrl: session.relayUrl,
    deepLink: session.deepLink,
    projectId: session.projectId,
    projectPath: session.projectPath,
    projectName: session.projectName,
    status: session.status,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    updatedAt: session.updatedAt,
    pairedAt: session.pairedAt,
    pairedDevice: session.pairedDevice,
  }
}

function snapshotForMobile(session: SeekerSession) {
  const pending = session.approvals.filter((approval) => approval.status === 'pending').length
  return {
    session: publicSession(session),
    project: { ...session.project, pendingApprovals: pending },
    approvals: session.approvals,
    events: session.events.slice(-20),
  }
}

function pruneExpiredSessions() {
  const now = Date.now()
  for (const [code, session] of sessions) {
    if (session.expiresAt <= now) {
      session.status = 'expired'
      sessions.delete(code)
    }
  }
}

function getSessionOrNull(pairingCode: string) {
  pruneExpiredSessions()
  return sessions.get(pairingCode) ?? null
}

function isApprovalStatus(value: unknown): value is SeekerApprovalStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

function recordMobileEvent(event: SeekerRelayEvent) {
  const session = getSessionOrNull(event.sessionCode)
  if (!session) return null

  const nextEvent = { ...event, receivedAt: Date.now() }
  session.events.unshift(nextEvent)
  session.events = session.events.slice(0, 80)
  session.updatedAt = Date.now()

  if (event.type === 'pair') {
    session.status = 'paired'
    session.pairedAt = Date.now()
    session.pairedDevice = typeof event.payload?.device === 'string' ? event.payload.device : 'Seeker mobile'
  }

  if (event.type === 'approval.approve' || event.type === 'approval.reject') {
    const approvalId = event.payload?.approvalId
    if (typeof approvalId === 'string') {
      updateApprovalStatus(event.sessionCode, approvalId, event.type === 'approval.approve' ? 'approved' : 'rejected')
    }
  }

  if (event.type === 'wallet.connected') {
    const address = event.payload?.address
    if (typeof address === 'string' && address.length > 0) {
      session.project.walletBalance = `${address.slice(0, 4)}...${address.slice(-4)}`
    }
  }

  return session
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // Block web pages outright — the native app sends no Origin.
  if (hasBrowserOrigin(req)) return json(res, 403, { ok: false, error: 'Forbidden' })
  if (req.method === 'OPTIONS') return json(res, 204, {})
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)

  if (req.method === 'GET' && (url.pathname === '/api/seeker/ping' || url.pathname === '/api/seeker/status')) {
    return json(res, 200, { ok: true, data: getRelayStatus() })
  }

  // The session LIST exposes every session's snapshot — keep it to the desktop
  // (loopback) only; the LAN-reachable phone uses the token-scoped endpoints.
  if (req.method === 'GET' && url.pathname === '/api/seeker/sessions') {
    if (!isLoopbackRequest(req)) return json(res, 403, { ok: false, error: 'Forbidden' })
    return json(res, 200, { ok: true, data: listSessions() })
  }

  if (req.method === 'POST' && url.pathname === '/api/seeker/sessions') {
    try {
      const body = await readBody(req) as Parameters<typeof createPairingSession>[0]
      const session = await createPairingSession(body ?? {})
      return json(res, 200, { ok: true, data: session })
    } catch (error) {
      return json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Could not create pairing session' })
    }
  }

  const sessionMatch = url.pathname.match(/^\/api\/seeker\/session\/([^/]+)$/)
  if (req.method === 'GET' && sessionMatch) {
    const pairingCode = decodeURIComponent(sessionMatch[1])
    const session = getSessionOrNull(pairingCode)
    // Generic 404 (not 401/403) so the token-gated endpoints don't reveal which
    // pairing codes exist to a brute-forcing LAN client.
    if (!session || !isAuthorizedForSession(req, session)) {
      return json(res, 404, { ok: false, error: 'Pairing session not found or expired' })
    }
    return json(res, 200, snapshotForMobile(session))
  }

  const approvalAddMatch = url.pathname.match(/^\/api\/seeker\/session\/([^/]+)\/approvals$/)
  if (req.method === 'POST' && approvalAddMatch) {
    try {
      const pairingCode = decodeURIComponent(approvalAddMatch[1])
      const session = getSessionOrNull(pairingCode)
      if (!session || !isAuthorizedForSession(req, session)) {
        return json(res, 404, { ok: false, error: 'Pairing session not found or expired' })
      }
      const body = await readBody(req) as Omit<SeekerApprovalRequest, 'id' | 'status' | 'createdAt'> & Partial<Pick<SeekerApprovalRequest, 'id' | 'status' | 'createdAt'>>
      return json(res, 200, { ok: true, data: addApproval(pairingCode, body) })
    } catch (error) {
      return json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Could not add approval' })
    }
  }

  const approvalStatusMatch = url.pathname.match(/^\/api\/seeker\/session\/([^/]+)\/approvals\/([^/]+)$/)
  if ((req.method === 'POST' || req.method === 'PATCH') && approvalStatusMatch) {
    try {
      const pairingCode = decodeURIComponent(approvalStatusMatch[1])
      const session = getSessionOrNull(pairingCode)
      if (!session || !isAuthorizedForSession(req, session)) {
        return json(res, 404, { ok: false, error: 'Pairing session not found or expired' })
      }
      const approvalId = decodeURIComponent(approvalStatusMatch[2])
      const body = await readBody(req) as { status?: unknown }
      if (!isApprovalStatus(body.status)) return json(res, 400, { ok: false, error: 'Invalid approval status' })
      return json(res, 200, { ok: true, data: updateApprovalStatus(pairingCode, approvalId, body.status) })
    } catch (error) {
      return json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Could not update approval' })
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/seeker/events') {
    try {
      const body = await readBody(req) as Partial<SeekerRelayEvent>
      if (!body.type || !body.sessionCode) return json(res, 400, { ok: false, error: 'Missing event type or sessionCode' })
      const session = getSessionOrNull(body.sessionCode)
      if (!session || !isAuthorizedForSession(req, session)) {
        return json(res, 404, { ok: false, error: 'Pairing session not found or expired' })
      }
      const updated = recordMobileEvent(body as SeekerRelayEvent)
      if (!updated) return json(res, 404, { ok: false, error: 'Pairing session not found or expired' })
      return json(res, 200, { ok: true, data: snapshotForMobile(updated) })
    } catch (error) {
      return json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Invalid request' })
    }
  }

  return notFound(res)
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? ''
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}

export async function startRelayServer(port = DEFAULT_PORT): Promise<SeekerRelayStatus> {
  if (server?.listening) return getRelayStatus()
  externalRelayStatus = null

  try {
    await new Promise<void>((resolve, reject) => {
      const nextServer = http.createServer((req, res) => {
        void handleRequest(req, res).catch((error) => {
          json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Relay error' })
        })
      })
      nextServer.once('error', reject)
      nextServer.listen(port, '0.0.0.0', () => {
        server = nextServer
        boundPort = port
        resolve()
      })
    })
  } catch (error) {
    if (isAddressInUse(error)) {
      const existing = await probeExistingRelay(port)
      if (existing) {
        boundPort = port
        externalRelayStatus = existing
        return getRelayStatus()
      }
    }
    throw error
  }

  return getRelayStatus()
}

export async function ensureRelayServer(): Promise<SeekerRelayStatus> {
  if (server?.listening) return getRelayStatus()
  try {
    return await startRelayServer()
  } catch (error) {
    console.warn('[seeker-relay] failed to auto-start:', error instanceof Error ? error.message : String(error))
    return getRelayStatus()
  }
}

export async function stopRelayServer() {
  externalRelayStatus = null
  if (!server) return { stopped: true }
  const current = server
  server = null
  await new Promise<void>((resolve) => current.close(() => resolve()))
  return { stopped: true }
}

export function getRelayStatus(): SeekerRelayStatus {
  if (!server?.listening && externalRelayStatus) {
    return externalRelayStatus
  }
  const urls = getRelayUrls(boundPort)
  return {
    running: Boolean(server?.listening),
    port: boundPort,
    relayUrl: urls.relayUrl,
    lanUrl: urls.lanUrl,
    sessionCount: sessions.size,
  }
}

export async function createPairingSession(input: {
  projectId?: string | null
  projectPath?: string | null
  projectName?: string | null
  project?: Partial<SeekerProjectSnapshot> | null
  seedDemoApprovals?: boolean
} = {}) {
  const status = await startRelayServer()
  const projectName = input.projectName?.trim() || input.project?.name || 'Daemon Project'
  const pairingCode = makePairingCode()
  const accessToken = makeAccessToken()
  const relayUrl = status.lanUrl
  const now = Date.now()
  const session: SeekerSession = {
    id: crypto.randomUUID(),
    pairingCode,
    accessToken,
    relayUrl,
    deepLink: makeDeepLink(pairingCode, accessToken, relayUrl, projectName),
    projectId: input.projectId ?? null,
    projectPath: input.projectPath ?? null,
    projectName,
    status: 'pairing',
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    updatedAt: now,
    pairedAt: null,
    pairedDevice: null,
    project: { ...defaultProjectSnapshot(projectName), ...(input.project ?? {}), name: projectName },
    approvals: input.seedDemoApprovals === false ? [] : demoApprovals(),
    events: [],
  }
  sessions.set(pairingCode, session)
  return snapshotForMobile(session)
}

export function getSessionSnapshot(pairingCode: string) {
  const session = getSessionOrNull(pairingCode)
  return session ? snapshotForMobile(session) : null
}

export function listSessions() {
  pruneExpiredSessions()
  return [...sessions.values()].map(snapshotForMobile)
}

export function updateProjectSnapshot(pairingCode: string, project: Partial<SeekerProjectSnapshot>) {
  const session = getSessionOrNull(pairingCode)
  if (!session) throw new Error('Pairing session not found or expired')
  session.project = { ...session.project, ...project }
  session.updatedAt = Date.now()
  return snapshotForMobile(session)
}

export function addApproval(pairingCode: string, approval: Omit<SeekerApprovalRequest, 'id' | 'status' | 'createdAt'> & Partial<Pick<SeekerApprovalRequest, 'id' | 'status' | 'createdAt'>>) {
  const session = getSessionOrNull(pairingCode)
  if (!session) throw new Error('Pairing session not found or expired')
  const nextApproval: SeekerApprovalRequest = {
    ...approval,
    id: approval.id ?? crypto.randomUUID(),
    status: approval.status ?? 'pending',
    createdAt: approval.createdAt ?? Date.now(),
  }
  session.approvals.unshift(nextApproval)
  session.updatedAt = Date.now()
  return snapshotForMobile(session)
}

export function updateApprovalStatus(pairingCode: string, approvalId: string, status: SeekerApprovalStatus) {
  const session = getSessionOrNull(pairingCode)
  if (!session) throw new Error('Pairing session not found or expired')
  session.approvals = session.approvals.map((approval) => approval.id === approvalId ? { ...approval, status } : approval)
  session.updatedAt = Date.now()
  return snapshotForMobile(session)
}

export function clearSession(pairingCode: string) {
  sessions.delete(pairingCode)
  return { cleared: true }
}

if (!autoStartAttempted) {
  autoStartAttempted = true
  void ensureRelayServer()
}

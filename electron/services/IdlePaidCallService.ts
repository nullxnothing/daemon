import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import { getDb } from '../db/db'
import type {
  IdleBudgetPolicy,
  IdlePaidCallInput,
  IdlePaidCallReceipt,
  IdlePolicyCheckInput,
  IdlePolicyCheckResult,
  IdleReceiptStatus,
  IdleRegistryRefreshInput,
  IdleRegistryStatus,
  IdleResource,
  IdleResourceStatus,
  IdleResourceType,
} from '../shared/types'

type FetchLike = typeof fetch

interface ServiceDeps {
  db?: Database.Database
  fetchImpl?: FetchLike
  now?: () => number
  env?: NodeJS.ProcessEnv
}

interface IdleResourceRow {
  id: string
  provider: string
  type: IdleResourceType
  name: string
  endpoint: string
  method: string
  price_usdc: number
  asset: string
  network: string
  payee: string
  score: number
  status: IdleResourceStatus
  schema_json: string
  registry_url: string | null
  last_seen_at: number
}

interface IdleReceiptRow {
  id: string
  resource_id: string
  project_id: string | null
  task_id: string | null
  agent_id: string | null
  endpoint: string
  method: string
  amount_usdc: number
  asset: string
  network: string
  payee: string
  status: IdleReceiptStatus
  payment_id: string | null
  facilitator: string | null
  response_status: number | null
  response_content_type: string | null
  response_bytes: number | null
  error_message: string | null
  metadata_json: string
  created_at: number
  updated_at: number
}

const DEFAULT_ASSET = 'USDC'
const DEFAULT_NETWORK = 'solana:mainnet'
const DEFAULT_METHOD = 'POST'
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/

function dbFrom(deps?: ServiceDeps) {
  return deps?.db ?? getDb()
}

function nowFrom(deps?: ServiceDeps) {
  return deps?.now ? deps.now() : Date.now()
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const normalized = value.replace(/^\$/, '').trim()
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function arrayFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['resources', 'data', 'items', 'endpoints']) {
      if (Array.isArray(record[key])) return record[key] as unknown[]
    }
  }
  return []
}

function normalizeMethod(value: unknown): 'GET' | 'POST' {
  const method = optionalString(value)?.toUpperCase()
  return method === 'GET' ? 'GET' : DEFAULT_METHOD
}

function normalizeType(value: unknown): IdleResourceType {
  const type = optionalString(value)?.toLowerCase()
  if (type === 'gpu' || type === 'agent' || type === 'api' || type === 'pc' || type === 'wallet' || type === 'data') return type
  return 'unknown'
}

function normalizeStatus(value: unknown): IdleResourceStatus {
  const status = optionalString(value)?.toLowerCase()
  if (status === 'disabled' || status === 'inactive') return 'disabled'
  if (status === 'degraded' || status === 'warning') return 'degraded'
  return 'available'
}

function stableResourceId(endpoint: string, provider: string, name: string) {
  return crypto.createHash('sha256').update(`${provider}:${name}:${endpoint}`).digest('hex').slice(0, 32)
}

function assertHttpsEndpoint(endpoint: string) {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error(`Invalid IDLE resource endpoint: ${endpoint}`)
  }
  if (url.protocol !== 'https:') throw new Error(`IDLE resource endpoint must use https: ${endpoint}`)
  return url
}

function normalizeResource(input: unknown, registryUrl: string | null, index: number, now: number): IdleResource {
  if (!input || typeof input !== 'object') throw new Error(`Invalid IDLE resource at index ${index}`)
  const record = input as Record<string, unknown>
  const endpoint = optionalString(record.endpoint) ?? optionalString(record.url) ?? optionalString(record.resource) ?? ''
  assertHttpsEndpoint(endpoint)
  const provider = optionalString(record.provider) ?? optionalString(record.owner) ?? 'idle-protocol'
  const name = optionalString(record.name) ?? optionalString(record.id) ?? `idle-resource-${index + 1}`
  const priceUsdc = numberValue(record.priceUsdc)
    ?? numberValue(record.price_usdc)
    ?? numberValue(record.maxAmountRequired)
    ?? numberValue(record.amount)
    ?? 0
  const payee = optionalString(record.payee) ?? optionalString(record.payTo) ?? optionalString(record.recipient) ?? ''
  const score = Math.max(0, Math.min(100, Math.round(numberValue(record.score) ?? 70)))

  return {
    id: optionalString(record.id) ?? stableResourceId(endpoint, provider, name),
    provider,
    type: normalizeType(record.type ?? record.resourceType),
    name,
    endpoint,
    method: normalizeMethod(record.method),
    priceUsdc,
    asset: optionalString(record.asset) ?? DEFAULT_ASSET,
    network: optionalString(record.network) ?? DEFAULT_NETWORK,
    payee,
    score,
    status: normalizeStatus(record.status),
    schema: (record.schema && typeof record.schema === 'object' ? record.schema : {}) as Record<string, unknown>,
    registryUrl,
    lastSeenAt: now,
  }
}

function rowToResource(row: IdleResourceRow): IdleResource {
  return {
    id: row.id,
    provider: row.provider,
    type: row.type,
    name: row.name,
    endpoint: row.endpoint,
    method: row.method === 'GET' ? 'GET' : 'POST',
    priceUsdc: Number(row.price_usdc),
    asset: row.asset,
    network: row.network,
    payee: row.payee,
    score: Number(row.score),
    status: row.status,
    schema: parseJson<Record<string, unknown>>(row.schema_json, {}),
    registryUrl: row.registry_url,
    lastSeenAt: Number(row.last_seen_at),
  }
}

function rowToReceipt(row: IdleReceiptRow): IdlePaidCallReceipt {
  return {
    id: row.id,
    resourceId: row.resource_id,
    projectId: row.project_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    endpoint: row.endpoint,
    method: row.method,
    amountUsdc: Number(row.amount_usdc),
    asset: row.asset,
    network: row.network,
    payee: row.payee,
    status: row.status,
    paymentId: row.payment_id,
    facilitator: row.facilitator,
    responseStatus: row.response_status,
    responseContentType: row.response_content_type,
    responseBytes: row.response_bytes,
    errorMessage: row.error_message,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function writeResource(db: Database.Database, resource: IdleResource, raw: unknown) {
  db.prepare(`
    INSERT INTO idle_resource_cache (
      id, provider, type, name, endpoint, method, price_usdc, asset, network, payee,
      score, status, schema_json, raw_json, registry_url, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      type = excluded.type,
      name = excluded.name,
      endpoint = excluded.endpoint,
      method = excluded.method,
      price_usdc = excluded.price_usdc,
      asset = excluded.asset,
      network = excluded.network,
      payee = excluded.payee,
      score = excluded.score,
      status = excluded.status,
      schema_json = excluded.schema_json,
      raw_json = excluded.raw_json,
      registry_url = excluded.registry_url,
      last_seen_at = excluded.last_seen_at
  `).run(
    resource.id,
    resource.provider,
    resource.type,
    resource.name,
    resource.endpoint,
    resource.method,
    resource.priceUsdc,
    resource.asset,
    resource.network,
    resource.payee,
    resource.score,
    resource.status,
    JSON.stringify(resource.schema),
    JSON.stringify(raw ?? {}),
    resource.registryUrl,
    resource.lastSeenAt,
  )
}

function getResource(db: Database.Database, resourceId: string): IdleResource | null {
  const row = db.prepare('SELECT * FROM idle_resource_cache WHERE id = ?').get(resourceId) as IdleResourceRow | undefined
  return row ? rowToResource(row) : null
}

export function listResources(limit = 50, deps?: ServiceDeps): IdleResource[] {
  const safeLimit = Math.min(Math.max(1, limit), 100)
  const rows = dbFrom(deps).prepare('SELECT * FROM idle_resource_cache ORDER BY score DESC, last_seen_at DESC LIMIT ?').all(safeLimit) as IdleResourceRow[]
  return rows.map(rowToResource)
}

export async function refreshRegistry(input: IdleRegistryRefreshInput = {}, deps?: ServiceDeps): Promise<IdleResource[]> {
  const env = deps?.env ?? process.env
  const registryUrl = optionalString(input.registryUrl) ?? optionalString(env.IDLE_REGISTRY_URL)
  if (!registryUrl) throw new Error('IDLE_REGISTRY_URL is required before DAEMON can import live resources.')
  assertHttpsEndpoint(registryUrl)

  const fetchImpl = deps?.fetchImpl ?? fetch
  const response = await fetchImpl(registryUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'manual',
  })
  if (response.status >= 300 && response.status < 400) throw new Error('IDLE registry redirects are not allowed.')
  if (!response.ok) throw new Error(`IDLE registry fetch failed: ${response.status}`)
  const payload = await response.json()
  const resources = arrayFromPayload(payload).map((item, index) => normalizeResource(item, registryUrl, index, nowFrom(deps)))
  if (resources.length === 0) throw new Error('IDLE registry returned no resources.')

  const db = dbFrom(deps)
  const write = db.transaction((items: IdleResource[]) => {
    for (let index = 0; index < items.length; index += 1) {
      writeResource(db, items[index], arrayFromPayload(payload)[index])
    }
  })
  write(resources)
  return resources
}

function hostAllowed(endpoint: string, allowedDomains: string[]) {
  const host = new URL(endpoint).hostname.toLowerCase()
  return allowedDomains.map((item) => item.toLowerCase()).includes(host)
}

function valueAllowed(value: string, allowed: string[]) {
  return allowed.map((item) => item.toLowerCase()).includes(value.toLowerCase())
}

function spentForTask(db: Database.Database, taskId?: string | null, projectId?: string | null) {
  if (taskId) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount_usdc), 0) AS total
      FROM idle_paid_call_receipts
      WHERE task_id = ? AND status = 'settled'
    `).get(taskId) as { total: number }
    return Number(row.total)
  }
  if (projectId) {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount_usdc), 0) AS total
      FROM idle_paid_call_receipts
      WHERE project_id = ? AND status = 'settled'
    `).get(projectId) as { total: number }
    return Number(row.total)
  }
  return 0
}

export function checkPolicy(input: IdlePolicyCheckInput, deps?: ServiceDeps): IdlePolicyCheckResult {
  const db = dbFrom(deps)
  const resource = getResource(db, input.resourceId)
  if (!resource) {
    return {
      allowed: false,
      reasons: ['IDLE resource was not found in the local registry cache.'],
      resource: null,
      spentThisTaskUsdc: 0,
      remainingTaskBudgetUsdc: Math.max(0, input.policy.maxPerTaskUsdc),
    }
  }

  const reasons: string[] = []
  const policy = input.policy
  if (resource.status !== 'available') reasons.push(`Resource status is ${resource.status}.`)
  if (resource.priceUsdc <= 0) reasons.push('Resource price is missing or zero.')
  if (!policy.allowedDomains.length || !hostAllowed(resource.endpoint, policy.allowedDomains)) reasons.push('Endpoint host is not on the route allowlist.')
  if (!policy.allowedNetworks.length || !valueAllowed(resource.network, policy.allowedNetworks)) reasons.push('Network is not allowed by policy.')
  if (!policy.allowedAssets.length || !valueAllowed(resource.asset, policy.allowedAssets)) reasons.push('Payment asset is not allowed by policy.')
  if (!policy.allowedPayees.length || !valueAllowed(resource.payee, policy.allowedPayees)) reasons.push('Payee is not allowed by policy.')
  if (resource.payee && BASE58_RE.test(resource.payee) === false && resource.payee.length < 8) reasons.push('Payee identifier is not specific enough.')
  if (!Number.isFinite(policy.maxPerCallUsdc) || policy.maxPerCallUsdc <= 0) reasons.push('Per-call budget must be greater than zero.')
  if (!Number.isFinite(policy.maxPerTaskUsdc) || policy.maxPerTaskUsdc <= 0) reasons.push('Task budget must be greater than zero.')
  if (resource.priceUsdc > policy.maxPerCallUsdc) reasons.push('Resource price exceeds per-call budget.')
  if (!policy.receiptRequired) reasons.push('Receipt storage must be required for IDLE paid calls.')

  const spentThisTaskUsdc = spentForTask(db, input.taskId ?? null, input.projectId ?? null)
  const remainingTaskBudgetUsdc = Math.max(0, policy.maxPerTaskUsdc - spentThisTaskUsdc)
  if (resource.priceUsdc > remainingTaskBudgetUsdc) reasons.push('Resource price exceeds remaining task budget.')

  return {
    allowed: reasons.length === 0,
    reasons,
    resource,
    spentThisTaskUsdc,
    remainingTaskBudgetUsdc,
  }
}

function hashPayload(value: unknown) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value ?? null)).digest('hex')
}

function parsePaymentPayload(value: string | null): Record<string, unknown> | null {
  if (!value) return null
  const candidates = [
    value,
    Buffer.from(value, 'base64url').toString('utf8'),
    Buffer.from(value, 'base64').toString('utf8'),
  ]
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    } catch {
      // try next encoding
    }
  }
  return null
}

function extractRequirement(response: Response, bodyText: string): Record<string, unknown> {
  const header = response.headers.get('payment-required') ?? response.headers.get('x-payment-required')
  const payload = parsePaymentPayload(header) ?? parsePaymentPayload(bodyText) ?? {}
  const accepts = Array.isArray(payload.accepts) ? payload.accepts[0] as Record<string, unknown> | undefined : undefined
  return accepts ?? payload
}

function requirementMismatch(resource: IdleResource, requirement: Record<string, unknown>) {
  const reasons: string[] = []
  const payTo = optionalString(requirement.payTo)
  const asset = optionalString(requirement.asset)
  const network = optionalString(requirement.network)
  const amount = numberValue(requirement.maxAmountRequired) ?? numberValue(requirement.amount)
  if (payTo && payTo !== resource.payee) reasons.push('Payment requirement payee does not match selected resource.')
  if (asset && asset.toLowerCase() !== resource.asset.toLowerCase()) reasons.push('Payment requirement asset does not match selected resource.')
  if (network && network.toLowerCase() !== resource.network.toLowerCase()) reasons.push('Payment requirement network does not match selected resource.')
  if (amount !== null && amount > resource.priceUsdc) reasons.push('Payment requirement exceeds selected resource price.')
  return reasons
}

function writeReceipt(
  db: Database.Database,
  input: {
    resource: IdleResource
    request: IdlePaidCallInput
    status: IdleReceiptStatus
    errorMessage?: string | null
    paymentId?: string | null
    facilitator?: string | null
    responseStatus?: number | null
    responseContentType?: string | null
    responseBytes?: number | null
    responseHash?: string | null
    metadata?: Record<string, unknown>
  },
  deps?: ServiceDeps,
) {
  const now = nowFrom(deps)
  const id = crypto.randomUUID()
  db.prepare(`
    INSERT INTO idle_paid_call_receipts (
      id, resource_id, project_id, task_id, agent_id, endpoint, method, amount_usdc,
      asset, network, payee, status, payment_id, facilitator, request_hash, response_hash,
      response_status, response_content_type, response_bytes, error_message, metadata_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.resource.id,
    input.request.projectId ?? null,
    input.request.taskId ?? null,
    input.request.agentId ?? null,
    input.resource.endpoint,
    input.resource.method,
    input.resource.priceUsdc,
    input.resource.asset,
    input.resource.network,
    input.resource.payee,
    input.status,
    input.paymentId ?? null,
    input.facilitator ?? null,
    hashPayload(input.request.requestBody ?? null),
    input.responseHash ?? null,
    input.responseStatus ?? null,
    input.responseContentType ?? null,
    input.responseBytes ?? null,
    input.errorMessage ?? null,
    JSON.stringify(input.metadata ?? {}),
    now,
    now,
  )
  return rowToReceipt(db.prepare('SELECT * FROM idle_paid_call_receipts WHERE id = ?').get(id) as IdleReceiptRow)
}

export async function executePaidCall(input: IdlePaidCallInput, deps?: ServiceDeps): Promise<IdlePaidCallReceipt> {
  const db = dbFrom(deps)
  const policy = checkPolicy(input, deps)
  const resource = policy.resource
  if (!resource) throw new Error(policy.reasons[0])
  if (!policy.allowed || !input.policy.humanApproved) {
    return writeReceipt(db, {
      resource,
      request: input,
      status: 'blocked',
      errorMessage: [...policy.reasons, ...(!input.policy.humanApproved ? ['Human approval is required.'] : [])].join(' '),
      metadata: { policyReasons: policy.reasons },
    }, deps)
  }
  if (!optionalString(input.paymentSignature)) {
    return writeReceipt(db, {
      resource,
      request: input,
      status: 'blocked',
      errorMessage: 'Payment signature is required before retrying a paid IDLE call.',
      metadata: { approvedBy: input.approvedBy ?? null },
    }, deps)
  }

  const fetchImpl = deps?.fetchImpl ?? fetch
  const init: RequestInit = {
    method: resource.method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: resource.method === 'POST' ? JSON.stringify(input.requestBody ?? {}) : undefined,
    redirect: 'manual',
  }

  try {
    const preflight = await fetchImpl(resource.endpoint, init)
    if (preflight.status >= 300 && preflight.status < 400) throw new Error('IDLE resource redirects are not allowed.')
    const preflightText = await preflight.text()
    if (preflight.status !== 402) throw new Error(`IDLE resource did not return HTTP 402 before payment: ${preflight.status}`)
    const requirement = extractRequirement(preflight, preflightText)
    const requirementReasons = requirementMismatch(resource, requirement)
    if (requirementReasons.length > 0) throw new Error(requirementReasons.join(' '))

    const paid = await fetchImpl(resource.endpoint, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        'PAYMENT-SIGNATURE': input.paymentSignature!,
        'X-Payment': input.paymentSignature!,
      },
    })
    if (paid.status >= 300 && paid.status < 400) throw new Error('IDLE paid call redirected after payment.')
    const contentType = paid.headers.get('content-type')
    const buffer = Buffer.from(await paid.arrayBuffer())
    const receipt = writeReceipt(db, {
      resource,
      request: input,
      status: paid.ok ? 'settled' : 'failed',
      errorMessage: paid.ok ? null : `Paid IDLE call failed with HTTP ${paid.status}`,
      paymentId: hashPayload(input.paymentSignature).slice(0, 16),
      facilitator: optionalString(requirement.facilitator) ?? 'x402',
      responseStatus: paid.status,
      responseContentType: contentType,
      responseBytes: buffer.byteLength,
      responseHash: hashPayload(buffer.toString('base64')),
      metadata: {
        approvedBy: input.approvedBy ?? null,
        x402Version: requirement.x402Version ?? null,
        requirementHash: hashPayload(requirement),
      },
    }, deps)
    return receipt
  } catch (error) {
    return writeReceipt(db, {
      resource,
      request: input,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
      metadata: { approvedBy: input.approvedBy ?? null },
    }, deps)
  }
}

export function listReceipts(limit = 25, deps?: ServiceDeps): IdlePaidCallReceipt[] {
  const safeLimit = Math.min(Math.max(1, limit), 100)
  const rows = dbFrom(deps).prepare('SELECT * FROM idle_paid_call_receipts ORDER BY created_at DESC LIMIT ?').all(safeLimit) as IdleReceiptRow[]
  return rows.map(rowToReceipt)
}

export function getStatus(registryUrl?: string | null, deps?: ServiceDeps): IdleRegistryStatus {
  const db = dbFrom(deps)
  const configuredUrl = optionalString(registryUrl) ?? optionalString(deps?.env?.IDLE_REGISTRY_URL) ?? optionalString(process.env.IDLE_REGISTRY_URL)
  const resourceCount = Number((db.prepare('SELECT COUNT(*) AS count FROM idle_resource_cache').get() as { count: number }).count)
  const receiptCount = Number((db.prepare('SELECT COUNT(*) AS count FROM idle_paid_call_receipts').get() as { count: number }).count)
  const latestRow = db.prepare('SELECT * FROM idle_paid_call_receipts ORDER BY created_at DESC LIMIT 1').get() as IdleReceiptRow | undefined
  const blockers: string[] = []
  if (!configuredUrl) blockers.push('IDLE_REGISTRY_URL is not configured.')
  if (resourceCount === 0) blockers.push('No IDLE resources have been imported.')
  return {
    registryConfigured: Boolean(configuredUrl),
    registryUrl: configuredUrl,
    resourceCount,
    receiptCount,
    latestReceipt: latestRow ? rowToReceipt(latestRow) : null,
    executionReady: blockers.length === 0,
    blockers,
  }
}

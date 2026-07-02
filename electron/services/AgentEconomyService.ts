import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import { getDb } from '../db/db'
import type {
  AgentEconomyExecutePaidCallInput,
  AgentEconomyExecutePaidCallResult,
  AgentEconomyListReceiptsInput,
  AgentEconomyPolicyCheckInput,
  AgentEconomyPolicyCheckResult,
  AgentEconomyProfile,
  AgentEconomyReadAgentIdentityInput,
  AgentEconomyReadAgentIdentityResult,
  AgentEconomyRegisterDevnetAgentInput,
  AgentEconomyRegisterDevnetAgentResult,
  AgentEconomySetPolicyInput,
  AgentEconomySpendPolicy,
  AgentEconomyUpsertProfileInput,
  IdleBudgetPolicy,
  IdlePaidCallReceipt,
  IdleResource,
} from '../shared/types'
import * as IdlePaidCallService from './IdlePaidCallService'
import * as MetaplexOperatorService from './MetaplexOperatorService'

type ResourceRow = {
  id: string
  provider: string
  type: IdleResource['type']
  name: string
  endpoint: string
  method: 'GET' | 'POST'
  price_usdc: number
  asset: string
  network: string
  payee: string
  score: number
  status: IdleResource['status']
  schema_json: string
  registry_url: string | null
  last_seen_at: number
}

type ProfileRow = {
  id: string
  project_id: string | null
  agent_id: string | null
  name: string
  wallet_id: string | null
  wallet_address: string | null
  registry_asset: string | null
  agent_identity_pda: string | null
  service_url: string | null
  capabilities_json: string
  created_at: number
  updated_at: number
}

type PolicyRow = {
  id: string
  profile_id: string
  asset: string
  network: string
  allowed_domains_json: string
  allowed_payees_json: string
  max_per_call_usdc: number
  max_per_day_usdc: number
  expires_at: number | null
  enabled: number
  created_at: number
  updated_at: number
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT = 'MINT REGISTERED AGENT'

function dbFrom(db?: Database.Database) {
  return db ?? getDb()
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function cleanArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(cleanString).filter(Boolean) as string[])]
}

function normalizeLimit(limit: unknown): number {
  const parsed = typeof limit === 'number' ? Math.floor(limit) : Number(limit)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.min(Math.max(1, parsed), MAX_LIMIT)
}

function policyFromRow(row: PolicyRow): AgentEconomySpendPolicy {
  return {
    id: row.id,
    profileId: row.profile_id,
    asset: row.asset,
    network: row.network,
    allowedDomains: parseJson<string[]>(row.allowed_domains_json, []),
    allowedPayees: parseJson<string[]>(row.allowed_payees_json, []),
    maxPerCallUsdc: Number(row.max_per_call_usdc),
    maxPerDayUsdc: Number(row.max_per_day_usdc),
    expiresAt: row.expires_at,
    enabled: row.enabled === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function policyForProfile(profileId: string, db?: Database.Database): AgentEconomySpendPolicy | null {
  const row = dbFrom(db).prepare('SELECT * FROM agent_spend_policies WHERE profile_id = ? LIMIT 1').get(profileId) as PolicyRow | undefined
  return row ? policyFromRow(row) : null
}

function profileFromRow(row: ProfileRow, db?: Database.Database): AgentEconomyProfile {
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id,
    name: row.name,
    walletId: row.wallet_id,
    walletAddress: row.wallet_address,
    registryAsset: row.registry_asset,
    agentIdentityPda: row.agent_identity_pda,
    serviceUrl: row.service_url,
    capabilities: parseJson<string[]>(row.capabilities_json, []),
    policy: policyForProfile(row.id, db),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function resourceFromRow(row: ResourceRow): IdleResource {
  return {
    id: row.id,
    provider: row.provider,
    type: row.type,
    name: row.name,
    endpoint: row.endpoint,
    method: row.method,
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

function requireProfile(profileId: string, db?: Database.Database): AgentEconomyProfile {
  const id = cleanString(profileId)
  if (!id) throw new Error('Profile id is required.')
  const row = dbFrom(db).prepare('SELECT * FROM agent_economy_profiles WHERE id = ?').get(id) as ProfileRow | undefined
  if (!row) throw new Error('Agent economy profile was not found.')
  return profileFromRow(row, db)
}

function resourceById(resourceId: string, db?: Database.Database): IdleResource | null {
  const id = cleanString(resourceId)
  if (!id) return null
  const row = dbFrom(db).prepare('SELECT * FROM idle_resource_cache WHERE id = ?').get(id) as ResourceRow | undefined
  return row ? resourceFromRow(row) : null
}

function walletAddressFor(walletId: string | null, db?: Database.Database): string | null {
  if (!walletId) return null
  const row = dbFrom(db).prepare('SELECT address FROM wallets WHERE id = ?').get(walletId) as { address: string } | undefined
  return row?.address ?? null
}

function startOfToday(): number {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function containsValue(values: string[], value: string): boolean {
  return values.some((item) => item.toLowerCase() === value.toLowerCase())
}

function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).hostname.toLowerCase()
  } catch {
    return null
  }
}

function spentToday(profile: AgentEconomyProfile, policy: AgentEconomySpendPolicy, db?: Database.Database): number {
  const since = startOfToday()
  const idle = dbFrom(db).prepare(`
    SELECT COALESCE(SUM(amount_usdc), 0) AS total
    FROM idle_paid_call_receipts
    WHERE (? IS NULL OR project_id = ?)
      AND (? IS NULL OR agent_id = ?)
      AND lower(asset) = lower(?)
      AND lower(network) = lower(?)
      AND status = 'settled'
      AND created_at >= ?
  `).get(profile.projectId, profile.projectId, profile.agentId, profile.agentId, policy.asset, policy.network, since) as { total: number }

  const meterflowIds = [profile.registryAsset, profile.agentId].filter(Boolean)
  if (meterflowIds.length === 0) return Number(idle.total)
  const placeholders = meterflowIds.map(() => '?').join(',')
  const meterflow = dbFrom(db).prepare(`
    SELECT COALESCE(SUM(amount_usd), 0) AS total
    FROM meterflow_receipts
    WHERE agent_id IN (${placeholders})
      AND lower(asset) = lower(?)
      AND status IN ('settled', 'recorded', 'verified', 'success')
      AND created_at >= ?
  `).get(...meterflowIds, policy.asset, since) as { total: number }

  return Number(idle.total) + Number(meterflow.total)
}

function idlePolicy(policy: AgentEconomySpendPolicy): IdleBudgetPolicy {
  return {
    maxPerCallUsdc: policy.maxPerCallUsdc,
    maxPerTaskUsdc: policy.maxPerDayUsdc,
    allowedDomains: policy.allowedDomains,
    allowedNetworks: [policy.network],
    allowedAssets: [policy.asset],
    allowedPayees: policy.allowedPayees,
    receiptRequired: true,
    humanApproved: true,
  }
}

function receiptFromRow(row: Record<string, unknown>): IdlePaidCallReceipt {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    projectId: row.project_id as string | null,
    taskId: row.task_id as string | null,
    agentId: row.agent_id as string | null,
    endpoint: String(row.endpoint),
    method: String(row.method),
    amountUsdc: Number(row.amount_usdc),
    asset: String(row.asset),
    network: String(row.network),
    payee: String(row.payee),
    status: row.status as IdlePaidCallReceipt['status'],
    paymentId: row.payment_id as string | null,
    facilitator: row.facilitator as string | null,
    responseStatus: row.response_status as number | null,
    responseContentType: row.response_content_type as string | null,
    responseBytes: row.response_bytes as number | null,
    errorMessage: row.error_message as string | null,
    metadata: parseJson<Record<string, unknown>>(String(row.metadata_json ?? '{}'), {}),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function listProfiles(projectId?: string | null, db?: Database.Database): AgentEconomyProfile[] {
  const id = cleanString(projectId)
  const rows = id
    ? dbFrom(db).prepare('SELECT * FROM agent_economy_profiles WHERE project_id = ? ORDER BY updated_at DESC').all(id)
    : dbFrom(db).prepare('SELECT * FROM agent_economy_profiles ORDER BY updated_at DESC').all()
  return (rows as ProfileRow[]).map((row) => profileFromRow(row, db))
}

export function getProfile(profileId: string, db?: Database.Database): AgentEconomyProfile {
  return requireProfile(profileId, db)
}

export function upsertProfile(input: AgentEconomyUpsertProfileInput, db?: Database.Database): AgentEconomyProfile {
  const name = cleanString(input.name)
  if (!name) throw new Error('Profile name is required.')

  const id = cleanString(input.id) ?? crypto.randomUUID()
  const walletId = cleanString(input.walletId)
  const now = Date.now()
  dbFrom(db).prepare(`
    INSERT INTO agent_economy_profiles (
      id, project_id, agent_id, name, wallet_id, wallet_address, registry_asset,
      agent_identity_pda, service_url, capabilities_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      agent_id = excluded.agent_id,
      name = excluded.name,
      wallet_id = excluded.wallet_id,
      wallet_address = excluded.wallet_address,
      registry_asset = excluded.registry_asset,
      agent_identity_pda = excluded.agent_identity_pda,
      service_url = excluded.service_url,
      capabilities_json = excluded.capabilities_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    cleanString(input.projectId),
    cleanString(input.agentId),
    name,
    walletId,
    cleanString(input.walletAddress) ?? walletAddressFor(walletId, db),
    cleanString(input.registryAsset),
    cleanString(input.agentIdentityPda),
    cleanString(input.serviceUrl),
    JSON.stringify(cleanArray(input.capabilities)),
    now,
    now,
  )
  return requireProfile(id, db)
}

export function setPolicy(input: AgentEconomySetPolicyInput, db?: Database.Database): AgentEconomySpendPolicy {
  requireProfile(input.profileId, db)
  const asset = cleanString(input.asset)
  const network = cleanString(input.network)
  if (!asset) throw new Error('Policy asset is required.')
  if (!network) throw new Error('Policy network is required.')
  if (!Number.isFinite(input.maxPerCallUsdc) || input.maxPerCallUsdc <= 0) throw new Error('Per-call budget must be greater than zero.')
  if (!Number.isFinite(input.maxPerDayUsdc) || input.maxPerDayUsdc <= 0) throw new Error('Daily budget must be greater than zero.')
  if (input.maxPerCallUsdc > input.maxPerDayUsdc) throw new Error('Per-call budget cannot exceed daily budget.')

  const now = Date.now()
  dbFrom(db).prepare(`
    INSERT INTO agent_spend_policies (
      id, profile_id, asset, network, allowed_domains_json, allowed_payees_json,
      max_per_call_usdc, max_per_day_usdc, expires_at, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      id = excluded.id,
      asset = excluded.asset,
      network = excluded.network,
      allowed_domains_json = excluded.allowed_domains_json,
      allowed_payees_json = excluded.allowed_payees_json,
      max_per_call_usdc = excluded.max_per_call_usdc,
      max_per_day_usdc = excluded.max_per_day_usdc,
      expires_at = excluded.expires_at,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(
    crypto.randomUUID(),
    input.profileId,
    asset,
    network,
    JSON.stringify(cleanArray(input.allowedDomains).map((item) => item.toLowerCase())),
    JSON.stringify(cleanArray(input.allowedPayees)),
    input.maxPerCallUsdc,
    input.maxPerDayUsdc,
    input.expiresAt ?? null,
    input.enabled ? 1 : 0,
    now,
    now,
  )

  const row = dbFrom(db).prepare('SELECT * FROM agent_spend_policies WHERE profile_id = ?').get(input.profileId) as PolicyRow
  return policyFromRow(row)
}

export function checkPolicy(input: AgentEconomyPolicyCheckInput, db?: Database.Database): AgentEconomyPolicyCheckResult {
  const profile = requireProfile(input.profileId, db)
  const resource = resourceById(input.resourceId, db)
  const policy = policyForProfile(profile.id, db)
  const reasons: string[] = []

  if (!resource) reasons.push('Paid resource was not found in the local IDLE registry cache.')
  if (!policy) reasons.push('No spend policy is configured for this profile.')
  if (policy) {
    if (!policy.enabled) reasons.push('Spend policy is disabled.')
    if (policy.expiresAt !== null && policy.expiresAt <= Date.now()) reasons.push('Spend policy is expired.')
  }
  if (resource && policy) {
    const host = endpointHost(resource.endpoint)
    if (resource.status !== 'available') reasons.push(`Resource status is ${resource.status}.`)
    if (resource.asset.toLowerCase() !== policy.asset.toLowerCase()) reasons.push('Payment asset does not match policy.')
    if (resource.network.toLowerCase() !== policy.network.toLowerCase()) reasons.push('Payment network does not match policy.')
    if (!host || !containsValue(policy.allowedDomains, host)) reasons.push('Endpoint host is not allowed by policy.')
    if (!containsValue(policy.allowedPayees, resource.payee)) reasons.push('Payee is not allowed by policy.')
    if (resource.priceUsdc > policy.maxPerCallUsdc) reasons.push('Resource price exceeds per-call budget.')
  }

  const spentTodayUsdc = policy ? spentToday(profile, policy, db) : 0
  const remainingDayBudgetUsdc = policy ? Math.max(0, policy.maxPerDayUsdc - spentTodayUsdc) : 0
  if (resource && policy && resource.priceUsdc > remainingDayBudgetUsdc) {
    reasons.push('Resource price exceeds remaining daily budget.')
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    resource,
    spentThisTaskUsdc: spentTodayUsdc,
    remainingTaskBudgetUsdc: remainingDayBudgetUsdc,
    profile,
    policy,
    spentTodayUsdc,
    remainingDayBudgetUsdc,
  }
}

export async function executePaidCall(input: AgentEconomyExecutePaidCallInput, db?: Database.Database): Promise<AgentEconomyExecutePaidCallResult> {
  const check = checkPolicy(input, db)
  if (!check.allowed || !check.policy || !check.resource) {
    return { status: 'blocked', allowed: false, reasons: check.reasons, requiresSignature: false, check, receipt: null }
  }

  const paymentSignature = cleanString(input.paymentSignature)
  if (!paymentSignature) {
    return {
      status: 'ready',
      allowed: true,
      reasons: ['Payment signature is required before executing this paid call.'],
      requiresSignature: true,
      check,
      receipt: null,
    }
  }

  const receipt = await IdlePaidCallService.executePaidCall({
    resourceId: input.resourceId,
    projectId: check.profile.projectId,
    taskId: input.taskId ?? null,
    agentId: check.profile.agentId,
    requestBody: input.requestBody,
    paymentSignature,
    approvedBy: cleanString(input.approvedBy),
    policy: idlePolicy(check.policy),
  })
  return {
    status: 'executed',
    allowed: receipt.status === 'settled',
    reasons: receipt.errorMessage ? [receipt.errorMessage] : [],
    requiresSignature: false,
    check,
    receipt,
  }
}

export function listReceipts(input: AgentEconomyListReceiptsInput = {}, db?: Database.Database): IdlePaidCallReceipt[] {
  const profile = input.profileId ? requireProfile(input.profileId, db) : null
  const projectId = profile?.projectId ?? cleanString(input.projectId)
  const agentId = profile?.agentId ?? null
  const rows = dbFrom(db).prepare(`
    SELECT *
    FROM idle_paid_call_receipts
    WHERE (? IS NULL OR project_id = ?)
      AND (? IS NULL OR agent_id = ?)
    ORDER BY created_at DESC
    LIMIT ?
  `).all(projectId, projectId, agentId, agentId, normalizeLimit(input.limit)) as Array<Record<string, unknown>>
  return rows.map(receiptFromRow)
}

export async function registerDevnetAgent(input: AgentEconomyRegisterDevnetAgentInput, db?: Database.Database): Promise<AgentEconomyRegisterDevnetAgentResult> {
  const profile = requireProfile(input.profileId, db)
  const walletId = cleanString(input.walletId) ?? profile.walletId
  if (!walletId) throw new Error('Profile wallet id is required before registration.')
  if (input.acknowledgement !== MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT) {
    throw new Error(`Type ${MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT} before registering the devnet agent.`)
  }

  const receipt = await MetaplexOperatorService.mintRegisteredAgent({
    walletId,
    network: 'devnet',
    rpcUrl: input.rpcUrl,
    name: cleanString(input.name) ?? profile.name,
    description: input.description,
    uri: input.uri,
    serviceUrl: input.serviceUrl,
    priceUsdc: input.priceUsdc,
    confirmedAt: input.confirmedAt,
    acknowledgement: input.acknowledgement,
  })
  const identity = await MetaplexOperatorService.readAgentIdentity({
    network: 'devnet',
    rpcUrl: input.rpcUrl,
    assetAddress: receipt.asset,
  })

  dbFrom(db).prepare(`
    UPDATE agent_economy_profiles
    SET wallet_id = ?, registry_asset = ?, agent_identity_pda = ?, service_url = ?, updated_at = ?
    WHERE id = ?
  `).run(walletId, receipt.asset, identity.agentIdentityPda, cleanString(input.serviceUrl), Date.now(), profile.id)
  const updated = requireProfile(profile.id, db)
  return {
    ...updated,
    profile: updated,
    receipt: { ...receipt },
    identity: { ...identity },
  }
}

export async function readAgentIdentity(input: AgentEconomyReadAgentIdentityInput, db?: Database.Database): Promise<AgentEconomyReadAgentIdentityResult> {
  const profile = input.profileId ? requireProfile(input.profileId, db) : null
  const assetAddress = cleanString(input.assetAddress) ?? profile?.registryAsset
  if (!assetAddress) throw new Error('Agent asset address is required.')

  const identity = await MetaplexOperatorService.readAgentIdentity({
    network: input.network,
    rpcUrl: input.rpcUrl,
    assetAddress,
  })
  if (profile && identity.registered) {
    dbFrom(db).prepare('UPDATE agent_economy_profiles SET agent_identity_pda = ?, updated_at = ? WHERE id = ?')
      .run(identity.agentIdentityPda, Date.now(), profile.id)
  }

  return { profile: profile ? requireProfile(profile.id, db) : null, identity: { ...identity } }
}

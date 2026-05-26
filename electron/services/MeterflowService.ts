import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import type Database from 'better-sqlite3'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token'
import { createKeyPairSignerFromBytes } from '@solana/kit'
import { x402Client, x402HTTPClient } from '@x402/core/client'
import { toClientSvmSigner } from '@x402/svm'
import { registerExactSvmScheme } from '@x402/svm/exact/client'
import { appendPaymentIdentifierToExtensions } from '@x402/extensions'
import { getDb } from '../db/db'
import type {
  MeterflowAgentSession,
  MeterflowBudget,
  MeterflowCsvExport,
  MeterflowDemoWallet,
  MeterflowMeter,
  MeterflowOverview,
  MeterflowPaidAgentReadinessInput,
  MeterflowPaidAgentReadinessResult,
  MeterflowReceipt,
  MeterflowReceiptDetail,
  MeterflowReceiptGraph,
  MeterflowReceiptsQuery,
  MeterflowRevenueRow,
  MeterflowStatus,
  MeterflowWalletReadiness,
  MeterflowWatchProjectResult,
  MeterflowWebhook,
} from '../shared/types'
import * as SecureKey from './SecureKeyService'
import * as WalletService from './WalletService'
import { withKeypair } from './SolanaService'

export const METERFLOW_API_KEY_NAME = 'METERFLOW_API_KEY'
export const DEFAULT_METERFLOW_BASE_URL = 'https://www.meterflow.fun/proxy'
export const METERFLOW_AGENT_READINESS_URL = 'https://www.meterflow.fun/proxy/mcp/agent-readiness'

const DEMO_WALLET_SETTING = 'meterflow_demo_wallet_id'
const DEMO_WALLET_AGENT_ID = 'meterflow-demo'
const DEMO_WALLET_NAME = 'Meterflow Demo Payer'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_RECEIPT_LIMIT = 75
const MAX_RECEIPT_LIMIT = 250
const MAINNET_CAIP2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
const DEVNET_CAIP2 = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1'
const MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const DEVNET_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
const METERFLOW_X402_PAY_TO = '6ybgqYcvbKkhPCfRg76naKY2gjUUgyx4HHR3FqTa2GYR'
const METERFLOW_MAINNET_RPC = 'https://api.mainnet-beta.solana.com'
const MAX_X402_USDC_BASE_UNITS = 100_000n
const FUNDING_MESSAGE = 'Fund this dedicated demo wallet with a small amount of SOL for fees and enough USDC for x402 payment testing.'

type FetchLike = typeof fetch

interface SecureKeyLike {
  getKey: (keyName: string) => string | null
  storeKey: (keyName: string, value: string) => void
  deleteKey: (keyName: string) => void
}

interface ServiceDeps {
  fetchImpl?: FetchLike
  secureKey?: SecureKeyLike
  db?: Database.Database
  env?: NodeJS.ProcessEnv
  baseUrl?: string
  timeoutMs?: number
  now?: () => number
}

interface MeterflowAuth {
  apiKey: string | null
  keySource: 'secure' | 'env' | 'none'
}

interface ReceiptRow {
  id: string
  route: string | null
  method: string | null
  status: string | null
  payment_protocol: string | null
  payment_state: string | null
  amount_usd: number | null
  asset: string | null
  tx_signature: string | null
  public_verify_url: string | null
  trust_state: string | null
  trust_score: number | null
  agent_id: string | null
  agent_name: string | null
  payer_wallet: string | null
  provider_name: string | null
  provider_route: string | null
  raw_json: string
  created_at: number
  updated_at: number
}

const projectWatchers = new Map<string, FSWatcher>()

function secureKeyFrom(deps?: ServiceDeps): SecureKeyLike {
  return deps?.secureKey ?? SecureKey
}

function dbFrom(deps?: ServiceDeps): Database.Database {
  return deps?.db ?? getDb()
}

function envFrom(deps?: ServiceDeps): NodeJS.ProcessEnv {
  return deps?.env ?? process.env
}

function fetchFrom(deps?: ServiceDeps): FetchLike {
  return deps?.fetchImpl ?? fetch
}

function nowFrom(deps?: ServiceDeps): number {
  return deps?.now ? deps.now() : Date.now()
}

function cleanBaseUrl(value?: string | null): string {
  const baseUrl = value?.trim() || DEFAULT_METERFLOW_BASE_URL
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new Error('Invalid Meterflow base URL.')
  }
  if (parsed.protocol !== 'https:') throw new Error('Meterflow base URL must use HTTPS.')
  if (parsed.hostname === 'meterflow.fun') parsed.hostname = 'www.meterflow.fun'
  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/$/, '')
}

function readAuth(deps?: ServiceDeps): MeterflowAuth {
  const stored = secureKeyFrom(deps).getKey(METERFLOW_API_KEY_NAME)?.trim()
  if (stored) return { apiKey: stored, keySource: 'secure' }

  const envKey = envFrom(deps).METERFLOW_API_KEY?.trim()
  if (envKey) return { apiKey: envKey, keySource: 'env' }

  return { apiKey: null, keySource: 'none' }
}

function requireAuth(deps?: ServiceDeps): Required<MeterflowAuth> {
  const auth = readAuth(deps)
  if (!auth.apiKey) throw new Error('METERFLOW_API_KEY is required.')
  return auth as Required<MeterflowAuth>
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.replace(/^\$/, '').trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function bigintValue(value: unknown): bigint | null {
  try {
    const raw = typeof value === 'bigint' ? value.toString() : optionalString(value)
    if (!raw || !/^\d+$/.test(raw)) return null
    return BigInt(raw)
  } catch {
    return null
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function arrayPayload<T>(payload: unknown, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[]
  const record = objectValue(payload)
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as T[]
  }
  return []
}

function normalizeLimit(limit: unknown): number {
  const parsed = typeof limit === 'number' ? Math.floor(limit) : Number(limit)
  if (!Number.isFinite(parsed)) return DEFAULT_RECEIPT_LIMIT
  return Math.min(Math.max(1, parsed), MAX_RECEIPT_LIMIT)
}

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const value = search.toString()
  return value ? `?${value}` : ''
}

function parseJson(value: string | null | undefined, fallback: Record<string, unknown>): Record<string, unknown> {
  if (!value) return fallback
  try {
    return objectValue(JSON.parse(value))
  } catch {
    return fallback
  }
}

function rowToReceipt(row: ReceiptRow): MeterflowReceipt {
  return {
    id: row.id,
    route: row.route,
    method: row.method,
    status: row.status,
    paymentProtocol: row.payment_protocol,
    paymentState: row.payment_state,
    amountUsd: row.amount_usd,
    asset: row.asset,
    txSignature: row.tx_signature,
    publicVerifyUrl: row.public_verify_url,
    trustState: row.trust_state,
    trustScore: row.trust_score,
    agentId: row.agent_id,
    agentName: row.agent_name,
    payerWallet: row.payer_wallet,
    providerName: row.provider_name,
    providerRoute: row.provider_route,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    raw: parseJson(row.raw_json, {}),
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const str = optionalString(value)
    if (str) return str
  }
  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const num = numberValue(value)
    if (num !== null) return num
  }
  return null
}

function epoch(value: unknown, fallback: number): number {
  const num = numberValue(value)
  if (num && num > 1_000_000_000) return num < 10_000_000_000 ? num * 1000 : num
  const str = optionalString(value)
  if (!str) return fallback
  const parsed = Date.parse(str)
  return Number.isFinite(parsed) ? parsed : fallback
}

function redactsKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return [
    'authorization',
    'headers',
    'privatekey',
    'secretkey',
    'paymentheader',
    'paymentheaders',
    'paymentsignature',
    'xpayment',
    'xpaymentsignature',
  ].some((blocked) => normalized.includes(blocked))
}

function sanitizeForStorage(value: unknown, depth = 0): unknown {
  if (depth > 8) return null
  if (Array.isArray(value)) return value.map((entry) => sanitizeForStorage(entry, depth + 1))
  if (!value || typeof value !== 'object') return value

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (redactsKey(key)) continue
    out[key] = sanitizeForStorage(entry, depth + 1)
  }
  return out
}

function generatedReceiptId(input: Record<string, unknown>, now: number): string {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(sanitizeForStorage(input)))
    .digest('hex')
    .slice(0, 16)
  return `meterflow_${now}_${hash}`
}

function receiptQuery(input: MeterflowReceiptsQuery | number | undefined): MeterflowReceiptsQuery {
  if (typeof input === 'number') return { limit: input }
  return input ?? {}
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text()
  if (!text) return `Meterflow request failed: ${response.status}`
  try {
    const data = JSON.parse(text) as Record<string, unknown>
    return firstString(data.message, data.error) ?? `Meterflow request failed: ${response.status}`
  } catch {
    return text.slice(0, 500)
  }
}

async function request<T>(requestPath: string, init: RequestInit = {}, deps?: ServiceDeps): Promise<T> {
  const auth = requireAuth(deps)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetchFrom(deps)(`${cleanBaseUrl(deps?.baseUrl)}${requestPath}`, {
      ...init,
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.apiKey}`,
        ...(init.headers ?? {}),
      },
    })

    if (response.status >= 300 && response.status < 400) throw new Error('Meterflow redirects are not allowed.')
    if (!response.ok) throw new Error(await readErrorMessage(response))
    return await response.json() as T
  } finally {
    clearTimeout(timer)
  }
}

async function optionalRequest<T>(requestPath: string, fallback: T, errors: string[], deps?: ServiceDeps): Promise<T> {
  try {
    return await request<T>(requestPath, {}, deps)
  } catch (error) {
    errors.push(`${requestPath}: ${error instanceof Error ? error.message : String(error)}`)
    return fallback
  }
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function getSetting(key: string, deps?: ServiceDeps): string | null {
  const row = dbFrom(deps)
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined
  return row?.value ?? null
}

function setSetting(key: string, value: string, deps?: ServiceDeps): void {
  dbFrom(deps)
    .prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    .run(key, value, nowFrom(deps))
}

function walletRowToDemo(row: Record<string, unknown> | undefined | null): MeterflowDemoWallet | null {
  if (!row) return null
  const walletId = optionalString(row.id)
  const address = optionalString(row.address)
  if (!walletId || !address) return null
  return {
    walletId,
    address,
    name: optionalString(row.name) ?? DEMO_WALLET_NAME,
    walletType: optionalString(row.wallet_type) ?? 'agent',
    createdAt: numberValue(row.created_at) ?? Date.now(),
    hasKeypair: SecureKey.getKey(`WALLET_KEYPAIR_${walletId}`) !== null,
  }
}

function findDemoWallet(deps?: ServiceDeps): MeterflowDemoWallet | null {
  const db = dbFrom(deps)
  const storedId = getSetting(DEMO_WALLET_SETTING, deps)
  if (storedId) {
    const stored = walletRowToDemo(db.prepare('SELECT id, name, address, wallet_type, created_at FROM wallets WHERE id = ?').get(storedId) as Record<string, unknown> | undefined)
    if (stored) return stored
  }

  const row = db.prepare(`
    SELECT id, name, address, wallet_type, created_at
    FROM wallets
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(DEMO_WALLET_AGENT_ID) as Record<string, unknown> | undefined
  const wallet = walletRowToDemo(row)
  if (wallet) setSetting(DEMO_WALLET_SETTING, wallet.walletId, deps)
  return wallet
}

function networkName(): string {
  return 'mainnet-beta'
}

function usdcMintForNetwork(network: string): string | null {
  if (network === 'mainnet-beta') return MAINNET_USDC_MINT
  if (network === 'devnet') return DEVNET_USDC_MINT
  return null
}

function validateMeterflowPaymentRequired(paymentRequired: unknown, deps?: ServiceDeps): void {
  const required = objectValue(paymentRequired)
  const accepts = Array.isArray(required.accepts) ? required.accepts.map(objectValue) : []
  const requirement = accepts[0]
  if (!requirement) throw new Error('Meterflow returned a malformed x402 payment challenge.')

  const scheme = optionalString(requirement.scheme)
  const network = optionalString(requirement.network)
  const asset = optionalString(requirement.asset)
  const payTo = optionalString(requirement.payTo)
  const amount = bigintValue(requirement.amount)
  const expectedPayTo = optionalString(deps?.env?.METERFLOW_X402_PAY_TO) ?? METERFLOW_X402_PAY_TO

  if (scheme !== 'exact') throw new Error(`Unsupported Meterflow x402 scheme: ${scheme ?? 'missing'}.`)
  if (network !== MAINNET_CAIP2 && network !== DEVNET_CAIP2) throw new Error(`Unsupported Meterflow x402 network: ${network ?? 'missing'}.`)
  if (asset !== MAINNET_USDC_MINT && asset !== DEVNET_USDC_MINT) throw new Error(`Unsupported Meterflow x402 asset: ${asset ?? 'missing'}.`)
  if (payTo !== expectedPayTo) throw new Error('Meterflow x402 payee did not match DAEMON policy.')
  if (amount === null || amount <= 0n || amount > MAX_X402_USDC_BASE_UNITS) throw new Error('Meterflow x402 amount exceeded DAEMON policy.')
}

function validateMeterflowPaymentResource(paymentRequired: unknown): void {
  const required = objectValue(paymentRequired)
  const resource = objectValue(required.resource)
  const resourceUrl = optionalString(resource.url)
  if (!resourceUrl) throw new Error('Meterflow x402 challenge did not include a resource URL.')

  const parsed = new URL(resourceUrl)
  const isMeterflowHost = parsed.hostname === 'meterflow.fun' || parsed.hostname === 'www.meterflow.fun'
  if (parsed.protocol !== 'https:' || !isMeterflowHost || parsed.pathname !== '/proxy/mcp/agent-readiness') {
    throw new Error('Meterflow x402 resource did not match DAEMON policy.')
  }
}

function prepareMeterflowPaymentRequired(paymentRequired: unknown, idempotencyKey: string): unknown {
  const required = objectValue(paymentRequired)
  const extensions = { ...objectValue(required.extensions) }
  // PayAI validates signed extensions. Meterflow's Bazaar MCP metadata is discovery-only and currently fails PayAI's HTTP-shaped Bazaar schema.
  delete extensions.bazaar
  required.extensions = appendPaymentIdentifierToExtensions(extensions, idempotencyKey)
  return paymentRequired
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) return {}
  try {
    return objectValue(JSON.parse(text))
  } catch {
    return { text: text.slice(0, 1000) }
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, deps?: ServiceDeps): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    return await fetchFrom(deps)(url, {
      ...init,
      signal: controller.signal,
      redirect: 'manual',
    })
  } finally {
    clearTimeout(timer)
  }
}

function headerValue(headers: Headers, ...names: string[]): string | null {
  for (const name of names) {
    const value = optionalString(headers.get(name))
    if (value) return value
  }
  return null
}

function decodePaymentResponse(headers: Headers): Record<string, unknown> | null {
  const encoded = headerValue(headers, 'PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE')
  if (!encoded) return null
  try {
    return objectValue(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')))
  } catch {
    return null
  }
}

function paymentFailureMessage(headers: Headers): string | null {
  const response = decodePaymentResponse(headers)
  if (!response || response.success !== false) return null
  return firstString(response.errorMessage, response.errorReason, response.message, response.reason)
    ?? 'x402 settlement failed.'
}

export async function storeApiKey(apiKey: string, deps?: ServiceDeps): Promise<MeterflowStatus> {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('Meterflow API key is required.')
  secureKeyFrom(deps).storeKey(METERFLOW_API_KEY_NAME, trimmed)
  return getStatus(deps)
}

export function deleteApiKey(deps?: ServiceDeps): { deleted: boolean } {
  secureKeyFrom(deps).deleteKey(METERFLOW_API_KEY_NAME)
  return { deleted: true }
}

export async function getStatus(deps?: ServiceDeps): Promise<MeterflowStatus> {
  const auth = readAuth(deps)
  const baseUrl = cleanBaseUrl(deps?.baseUrl)
  if (!auth.apiKey) {
    return {
      configured: false,
      keySource: 'none',
      baseUrl,
      tier: null,
      balanceUsd: null,
      executionReady: true,
      error: null,
      raw: null,
    }
  }

  try {
    const raw = objectValue(await request('/auth/status', {}, deps))
    return {
      configured: true,
      keySource: auth.keySource,
      baseUrl,
      tier: firstString(raw.tier, raw.plan),
      balanceUsd: numberValue(raw.balanceUsd ?? raw.balance_usd ?? raw.balance),
      executionReady: true,
      error: null,
      raw,
    }
  } catch (error) {
    return {
      configured: true,
      keySource: auth.keySource,
      baseUrl,
      tier: null,
      balanceUsd: null,
      executionReady: true,
      error: error instanceof Error ? error.message : String(error),
      raw: null,
    }
  }
}

export async function listReceipts(input: MeterflowReceiptsQuery | number = {}, deps?: ServiceDeps): Promise<MeterflowReceipt[]> {
  const params = receiptQuery(input)
  const rows = dbFrom(deps)
    .prepare(`
      SELECT *
      FROM meterflow_receipts
      WHERE (? IS NULL OR status = ?)
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .all(optionalString(params.status), optionalString(params.status), normalizeLimit(params.limit)) as ReceiptRow[]
  return rows.map(rowToReceipt)
}

export async function getReceipt(receiptId: string, deps?: ServiceDeps): Promise<MeterflowReceiptDetail> {
  const id = optionalString(receiptId)
  if (!id) throw new Error('Receipt id is required.')

  const row = dbFrom(deps)
    .prepare('SELECT * FROM meterflow_receipts WHERE id = ?')
    .get(id) as ReceiptRow | undefined
  if (row) {
    return {
      receipt: rowToReceipt(row),
      graph: parseJson(row.raw_json, {}) as MeterflowReceiptGraph,
    }
  }

  const payload = objectValue(await request(`/v1/receipts/${encodeURIComponent(id)}`, {}, deps))
  const receipt = (payload.receipt && typeof payload.receipt === 'object' ? payload.receipt : payload) as MeterflowReceipt
  return {
    receipt,
    graph: payload.graph && typeof payload.graph === 'object' ? payload.graph as MeterflowReceiptGraph : null,
  }
}

export async function getReceiptGraph(receiptId: string, deps?: ServiceDeps): Promise<MeterflowReceiptGraph> {
  const id = optionalString(receiptId)
  if (!id) throw new Error('Receipt id is required.')

  const row = dbFrom(deps)
    .prepare('SELECT raw_json FROM meterflow_receipts WHERE id = ?')
    .get(id) as { raw_json: string } | undefined
  if (row) return parseJson(row.raw_json, {}) as MeterflowReceiptGraph

  return objectValue(await request(`/v1/receipts/${encodeURIComponent(id)}/graph`, {}, deps)) as MeterflowReceiptGraph
}

export async function ingestReceipt(input: unknown, deps?: ServiceDeps): Promise<MeterflowReceipt> {
  const wrapper = objectValue(input)
  const nestedReceipt = objectValue(wrapper.receipt)
  const receipt = Object.keys(nestedReceipt).length > 0 ? nestedReceipt : wrapper
  const meterflow = objectValue(wrapper.meterflow)
  const agent = objectValue(wrapper.agent)
  const result = objectValue(wrapper.result)
  const now = nowFrom(deps)
  const safeInput = sanitizeForStorage(wrapper) as Record<string, unknown>

  const id = firstString(
    receipt.id,
    meterflow.receiptId,
    meterflow.id,
    wrapper.id,
    result.receiptId,
  ) ?? generatedReceiptId(wrapper, now)

  const row = {
    id,
    route: firstString(meterflow.route, receipt.route, receipt.providerRoute, result.route, '/mcp/agent-readiness'),
    method: firstString(receipt.method, result.method, 'POST'),
    status: firstString(receipt.status, result.status, result.paymentStatus) ?? (firstString(meterflow.txSignature, receipt.txSignature) ? 'settled' : 'recorded'),
    payment_protocol: firstString(receipt.paymentProtocol, receipt.payment_protocol, result.paymentProtocol, 'x402'),
    payment_state: firstString(receipt.paymentState, receipt.payment_state, result.paymentState, result.paymentStatus, receipt.status),
    amount_usd: firstNumber(receipt.amountUsd, receipt.amountUSDC, receipt.amount_usd, receipt.amount, result.amountUsd, result.amount),
    asset: firstString(receipt.asset, result.asset, 'USDC'),
    tx_signature: firstString(meterflow.txSignature, receipt.txSignature, receipt.transactionSignature, receipt.transaction, result.txSignature, result.transactionSignature),
    public_verify_url: firstString(meterflow.receiptUrl, receipt.publicVerifyUrl, receipt.receiptUrl, receipt.verifyUrl, result.receiptUrl),
    trust_state: firstString(receipt.trustState, receipt.trust_state, result.trustState),
    trust_score: firstNumber(receipt.trustScore, receipt.trust_score, result.trustScore),
    agent_id: firstString(agent.metaplexAssetAddress, receipt.agentId, receipt.agent_id, result.agentId),
    agent_name: firstString(agent.name, receipt.agentName, receipt.agent_name, result.agentName),
    payer_wallet: firstString(agent.wallet, receipt.payerWallet, receipt.wallet, result.wallet, result.address),
    provider_name: firstString(receipt.providerName, receipt.provider_name, result.providerName, 'Meterflow'),
    provider_route: firstString(receipt.providerRoute, receipt.provider_route, meterflow.route, result.providerRoute),
    raw_json: JSON.stringify(safeInput),
    created_at: epoch(wrapper.createdAt ?? receipt.createdAt ?? result.createdAt, now),
    updated_at: now,
  }

  dbFrom(deps)
    .prepare(`
      INSERT INTO meterflow_receipts (
        id, route, method, status, payment_protocol, payment_state, amount_usd, asset,
        tx_signature, public_verify_url, trust_state, trust_score, agent_id, agent_name,
        payer_wallet, provider_name, provider_route, raw_json, created_at, updated_at
      ) VALUES (
        @id, @route, @method, @status, @payment_protocol, @payment_state, @amount_usd, @asset,
        @tx_signature, @public_verify_url, @trust_state, @trust_score, @agent_id, @agent_name,
        @payer_wallet, @provider_name, @provider_route, @raw_json, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        route = excluded.route,
        method = excluded.method,
        status = excluded.status,
        payment_protocol = excluded.payment_protocol,
        payment_state = excluded.payment_state,
        amount_usd = excluded.amount_usd,
        asset = excluded.asset,
        tx_signature = excluded.tx_signature,
        public_verify_url = excluded.public_verify_url,
        trust_state = excluded.trust_state,
        trust_score = excluded.trust_score,
        agent_id = excluded.agent_id,
        agent_name = excluded.agent_name,
        payer_wallet = excluded.payer_wallet,
        provider_name = excluded.provider_name,
        provider_route = excluded.provider_route,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `)
    .run(row)

  const saved = dbFrom(deps).prepare('SELECT * FROM meterflow_receipts WHERE id = ?').get(id) as ReceiptRow
  return rowToReceipt(saved)
}

function isReceiptFilePayload(value: unknown): boolean {
  const wrapper = objectValue(value)
  const meterflow = objectValue(wrapper.meterflow)
  const receipt = objectValue(wrapper.receipt)
  return Boolean(
    firstString(meterflow.receiptId, meterflow.txSignature, meterflow.route)
    || firstString(receipt.id, receipt.txSignature, receipt.publicVerifyUrl)
    || firstString(wrapper.id, wrapper.receiptId, wrapper.txSignature, wrapper.publicVerifyUrl),
  )
}

async function ingestReceiptFile(filePath: string, deps?: ServiceDeps): Promise<void> {
  try {
    if (path.extname(filePath).toLowerCase() !== '.json') return
    const raw = await fs.readFile(filePath, 'utf8')
    const payload = JSON.parse(raw)
    if (!isReceiptFilePayload(payload)) return
    await ingestReceipt(payload, deps)
  } catch {
    // Bad receipt files should not break the live watcher.
  }
}

export async function watchProjectReceipts(projectPath: string, deps?: ServiceDeps): Promise<MeterflowWatchProjectResult> {
  const resolved = path.resolve(projectPath)
  const receiptDir = path.join(resolved, '.daemon', 'meterflow')

  if (!projectWatchers.has(receiptDir)) {
    await fs.mkdir(receiptDir, { recursive: true })
    const watcher = chokidar.watch(receiptDir, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
    })
    watcher.on('add', (filePath) => void ingestReceiptFile(filePath, deps))
    watcher.on('change', (filePath) => void ingestReceiptFile(filePath, deps))
    projectWatchers.set(receiptDir, watcher)
  }

  return { projectPath: resolved, watchPath: receiptDir, watching: true }
}

export async function createDemoWallet(deps?: ServiceDeps): Promise<MeterflowDemoWallet> {
  const existing = findDemoWallet(deps)
  if (existing?.hasKeypair) return existing

  const created = WalletService.generateWallet(DEMO_WALLET_NAME, 'agent', DEMO_WALLET_AGENT_ID) as Record<string, unknown>
  const wallet = walletRowToDemo(created)
  if (!wallet) throw new Error('Failed to create Meterflow demo wallet.')
  setSetting(DEMO_WALLET_SETTING, wallet.walletId, deps)
  return wallet
}

export async function getDemoWallet(deps?: ServiceDeps): Promise<MeterflowDemoWallet | null> {
  return findDemoWallet(deps)
}

export async function checkDemoWalletReadiness(deps?: ServiceDeps): Promise<MeterflowWalletReadiness> {
  const wallet = findDemoWallet(deps)
  const network = networkName()
  if (!wallet) {
    return {
      wallet: null,
      ready: false,
      network,
      solBalance: null,
      usdcBalance: null,
      fundingMessage: FUNDING_MESSAGE,
      blockers: ['Create a Meterflow demo wallet first.'],
    }
  }

  try {
    const connection = new Connection(METERFLOW_MAINNET_RPC, 'confirmed')
    const owner = new PublicKey(wallet.address)
    const solBalance = await connection.getBalance(owner).then((lamports) => lamports / LAMPORTS_PER_SOL)
    const mint = usdcMintForNetwork(network)
    let usdcBalance: number | null = null
    if (mint) {
      try {
        const ata = await getAssociatedTokenAddress(new PublicKey(mint), owner)
        const account = await getAccount(connection, ata)
        usdcBalance = Number(account.amount) / 1_000_000
      } catch {
        usdcBalance = 0
      }
    }

    const blockers: string[] = []
    if (solBalance <= 0) blockers.push('SOL fee balance is empty.')
    if ((usdcBalance ?? 0) <= 0) blockers.push('USDC balance is empty.')
    return {
      wallet,
      ready: blockers.length === 0,
      network,
      solBalance,
      usdcBalance,
      fundingMessage: blockers.length ? FUNDING_MESSAGE : 'Demo wallet has SOL and USDC available for x402 testing.',
      blockers,
    }
  } catch (error) {
    return {
      wallet,
      ready: false,
      network,
      solBalance: null,
      usdcBalance: null,
      fundingMessage: FUNDING_MESSAGE,
      blockers: [error instanceof Error ? error.message : String(error)],
    }
  }
}

export async function callPaidAgentReadiness(input: MeterflowPaidAgentReadinessInput = {}, deps?: ServiceDeps): Promise<MeterflowPaidAgentReadinessResult> {
  const wallet = findDemoWallet(deps)
  if (!wallet?.hasKeypair) throw new Error('Create a dedicated Meterflow demo wallet before running the x402 test.')

  const idempotencyKey = optionalString(input.idempotencyKey) ?? crypto.randomUUID()
  const requestBody = {
    address: wallet.address,
    action: 'call paid Meterflow MCP tools from DAEMON',
  }
  const body = JSON.stringify(requestBody)
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  }

  const unpaid = await fetchWithTimeout(METERFLOW_AGENT_READINESS_URL, {
    method: 'POST',
    headers,
    body,
  }, deps)

  if (unpaid.status >= 300 && unpaid.status < 400) throw new Error('Meterflow redirects are not allowed.')
  const unpaidText = await unpaid.text()
  let unpaidJson: Record<string, unknown> = {}
  try {
    unpaidJson = objectValue(JSON.parse(unpaidText))
  } catch {
    unpaidJson = {}
  }
  if (unpaid.status !== 402) {
    const message = firstString(unpaidJson.message, unpaidJson.error)
    throw new Error(message ?? `Meterflow route returned HTTP ${unpaid.status} instead of an x402 payment challenge.`)
  }

  const paymentHeaders = await withKeypair(wallet.walletId, async (keypair) => {
    if (keypair.publicKey.toBase58() !== wallet.address) {
      throw new Error('Meterflow demo wallet keypair does not match the stored public address.')
    }
    const signer = toClientSvmSigner(await createKeyPairSignerFromBytes(keypair.secretKey))
    const client = registerExactSvmScheme(new x402Client(), { signer })
    const httpClient = new x402HTTPClient(client)
    const paymentRequired = httpClient.getPaymentRequiredResponse((name) => unpaid.headers.get(name), unpaidJson)
    validateMeterflowPaymentRequired(paymentRequired, deps)
    validateMeterflowPaymentResource(paymentRequired)
    prepareMeterflowPaymentRequired(paymentRequired, idempotencyKey)
    const paymentPayload = await httpClient.createPaymentPayload(paymentRequired)
    return httpClient.encodePaymentSignatureHeader(paymentPayload)
  })

  const paid = await fetchWithTimeout(METERFLOW_AGENT_READINESS_URL, {
    method: 'POST',
    headers: {
      ...headers,
      'X-Payment-Wallet': wallet.address,
      'X-Payment-Id': idempotencyKey,
      ...paymentHeaders,
    },
    body,
  }, deps)

  if (paid.status >= 300 && paid.status < 400) throw new Error('Meterflow redirects are not allowed.')
  const result = await jsonResponse(paid)
  if (!paid.ok) {
    const settleMessage = paymentFailureMessage(paid.headers)
    const challengeMessage = paid.status === 402 && headerValue(paid.headers, 'PAYMENT-REQUIRED')
      ? 'Meterflow returned a fresh 402 challenge after the paid retry; the payment signature was not accepted.'
      : null
    throw new Error(firstString(result.message, result.error, settleMessage, challengeMessage)
      ?? `Meterflow paid retry failed: HTTP ${paid.status}.`)
  }

  const settlement = decodePaymentResponse(paid.headers)
  const receiptId = headerValue(paid.headers, 'X-Meterflow-Receipt-Id', 'x-meterflow-receipt-id')
    ?? firstString(result.receiptId, objectValue(result.meterflow).receiptId, objectValue(result.receipt).id)
  const receiptUrl = headerValue(paid.headers, 'X-Meterflow-Receipt-Url', 'x-meterflow-receipt-url')
    ?? firstString(result.receiptUrl, objectValue(result.meterflow).receiptUrl, objectValue(result.receipt).publicVerifyUrl)
  const txSignature = firstString(settlement?.transaction)
    ?? headerValue(paid.headers, 'X-Payment-Transaction', 'x-payment-transaction')
    ?? firstString(result.txSignature, objectValue(result.receipt).txSignature)
  const wrapper = {
    agent: {
      name: optionalString(input.agentName) ?? 'DAEMON Meterflow Demo',
      wallet: wallet.address,
      metaplexAssetAddress: optionalString(input.metaplexAssetAddress),
    },
    meterflow: {
      route: '/mcp/agent-readiness',
      receiptId,
      receiptUrl,
      txSignature,
      idempotencyKey,
    },
    receipt: objectValue(result.receipt),
    result,
    createdAt: new Date(nowFrom(deps)).toISOString(),
  }

  const receipt = await ingestReceipt(wrapper, deps)
  return {
    wallet,
    idempotencyKey,
    status: paid.status,
    ok: paid.ok,
    receipt,
    receiptId,
    receiptUrl,
    txSignature,
    result: sanitizeForStorage(result) as Record<string, unknown>,
  }
}

export async function listMeters(deps?: ServiceDeps): Promise<MeterflowMeter[]> {
  const payload = await request<unknown>('/v1/meters', {}, deps)
  return arrayPayload<MeterflowMeter>(payload, ['meters', 'data', 'items'])
}

export async function testMeter(meterId: string, deps?: ServiceDeps): Promise<Record<string, unknown>> {
  const id = optionalString(meterId)
  if (!id) throw new Error('Meter id is required.')
  return objectValue(await request(`/v1/meters/${encodeURIComponent(id)}/test`, { method: 'POST', body: '{}' }, deps))
}

export async function listBudgets(deps?: ServiceDeps): Promise<MeterflowBudget[]> {
  const payload = await request<unknown>('/v1/budgets', {}, deps)
  return arrayPayload<MeterflowBudget>(payload, ['budgets', 'data', 'items'])
}

export async function listAgentSessions(deps?: ServiceDeps): Promise<MeterflowAgentSession[]> {
  const payload = await request<unknown>('/v1/agent-sessions', {}, deps)
  return arrayPayload<MeterflowAgentSession>(payload, ['agentSessions', 'sessions', 'data', 'items'])
}

export async function listWebhooks(deps?: ServiceDeps): Promise<MeterflowWebhook[]> {
  const payload = await request<unknown>('/v1/webhooks', {}, deps)
  return arrayPayload<MeterflowWebhook>(payload, ['webhooks', 'data', 'items'])
}

export async function providerRevenue(deps?: ServiceDeps): Promise<MeterflowRevenueRow[]> {
  const payload = await request<unknown>('/v1/providers/revenue', {}, deps)
  return arrayPayload<MeterflowRevenueRow>(payload, ['revenue', 'rows', 'data', 'items'])
}

export async function registrySummary(deps?: ServiceDeps): Promise<Record<string, unknown>> {
  return objectValue(await request('/v1/registry/summary', {}, deps))
}

export async function exportReceiptsCsv(deps?: ServiceDeps): Promise<MeterflowCsvExport> {
  const receipts = await listReceipts(DEFAULT_RECEIPT_LIMIT, deps)
  const headers = ['id', 'createdAt', 'route', 'status', 'paymentState', 'amountUsd', 'asset', 'txSignature', 'publicVerifyUrl', 'agentName', 'payerWallet']
  const rows = receipts.map((receipt) => headers.map((key) => csvCell(receipt[key])).join(','))
  return {
    filename: 'meterflow-receipts.csv',
    contentType: 'text/csv',
    content: [headers.join(','), ...rows].join('\n'),
  }
}

export async function getOverview(deps?: ServiceDeps): Promise<MeterflowOverview> {
  const errors: string[] = []
  const status = await getStatus(deps)
  const receipts = await listReceipts(DEFAULT_RECEIPT_LIMIT, deps)

  if (!status.configured) {
    return {
      status,
      receipts,
      meters: [],
      budgets: [],
      agentSessions: [],
      webhooks: [],
      revenue: [],
      registrySummary: null,
      errors,
      fetchedAt: nowFrom(deps),
    }
  }

  const [meters, budgets, agentSessions, webhooks, revenue, summary] = await Promise.all([
    optionalRequest<unknown>('/v1/meters', { meters: [] }, errors, deps)
      .then((payload) => arrayPayload<MeterflowMeter>(payload, ['meters', 'data', 'items'])),
    optionalRequest<unknown>('/v1/budgets', { budgets: [] }, errors, deps)
      .then((payload) => arrayPayload<MeterflowBudget>(payload, ['budgets', 'data', 'items'])),
    optionalRequest<unknown>('/v1/agent-sessions', { agentSessions: [] }, errors, deps)
      .then((payload) => arrayPayload<MeterflowAgentSession>(payload, ['agentSessions', 'sessions', 'data', 'items'])),
    optionalRequest<unknown>('/v1/webhooks', { webhooks: [] }, errors, deps)
      .then((payload) => arrayPayload<MeterflowWebhook>(payload, ['webhooks', 'data', 'items'])),
    optionalRequest<unknown>('/v1/providers/revenue', { revenue: [] }, errors, deps)
      .then((payload) => arrayPayload<MeterflowRevenueRow>(payload, ['revenue', 'rows', 'data', 'items'])),
    optionalRequest<Record<string, unknown> | null>('/v1/registry/summary', null, errors, deps)
      .then((payload) => payload ? objectValue(payload) : null),
  ])

  return {
    status,
    receipts,
    meters,
    budgets,
    agentSessions,
    webhooks,
    revenue,
    registrySummary: summary,
    errors,
    fetchedAt: nowFrom(deps),
  }
}

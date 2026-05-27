import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { app, dialog } from 'electron'
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import BN from 'bn.js'
import bs58 from 'bs58'
import { getDb } from '../db/db'
import * as SecureKey from './SecureKeyService'
import {
  executeInstructions,
  getConnection,
  type TransactionExecutionResult,
} from './SolanaService'
import { getWalletInfrastructureSettings } from './SettingsService'
import type {
  ProofBackingActionInput,
  CreateProofPoolInput,
  ImportProofVanityMintInput,
  ConfigureProofPartnerCredentialsInput,
  CreateProofPartnerSessionInput,
  ProofBacking,
  ProofClaimFeesInput,
  ProofCollectFeesResult,
  ProofEscrowStatus,
  ProofPartnerCredentialStatus,
  ProofPartnerSession,
  ProofPool,
  ProofPoolDetail,
  ProofPoolEvent,
  ProofPoolLaunchResult,
  ProofPoolStatus,
  VerifyProofBackingInput,
} from '../shared/types'

const require = createRequire(import.meta.url)

const PROOF_ESCROW_KEY = 'PROOF_POOL_PLATFORM_ESCROW'
const PUMPFUN_METADATA_ENDPOINT = 'https://pump.fun/api/ipfs'
const METADATA_UPLOAD_TIMEOUT_MS = 30_000
const METADATA_UPLOAD_MAX_ATTEMPTS = 3
const METADATA_UPLOAD_RETRY_BASE_MS = 250
const MIN_BACKING_SOL = 0.05
const MIN_SLOTS = 2
const MAX_SLOTS = 24
const DEFAULT_BACKING_DAYS = 3
const MAX_BACKING_DAYS = 30
const PUMP_CREATE_BUY_COMPUTE_UNITS = 700_000
const DISTRIBUTION_COMPUTE_UNITS = 180_000
const COLLECT_FEES_COMPUTE_UNITS = 300_000
const BASE_TX_FEE_LAMPORTS = 5_000
const CREATOR_FEE_COLLECT_THRESHOLD_LAMPORTS = 50_000
const CREATOR_FEE_PAYER_FLOOR_LAMPORTS = 100_000
const PLATFORM_FEE_BPS = 1_000
const BPS_DENOMINATOR = 10_000
const ESCROW_EXPORT_COOLDOWN_MS = 60_000
const PROOFLAUNCH_API_KEY = 'PROOFLAUNCH_PARTNER_API_KEY'
const PROOFLAUNCH_WEBHOOK_SECRET = 'PROOFLAUNCH_PARTNER_WEBHOOK_SECRET'
const PROOFLAUNCH_API_BASE = 'https://prooflaunch.fun'
const PROOFLAUNCH_PARTNER_SLUG = 'daemon'
const PROOFLAUNCH_DEFAULT_RETURN_URL = 'https://daemonide.tech/launch-complete'
const PROOFLAUNCH_REQUEST_TIMEOUT_MS = 20_000
const WEBHOOK_DRIFT_MS = 5 * 60 * 1000
const MAX_TOKEN_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_STAGING_DIR = 'proof-images'

const exportCooldowns = new Map<string, number>()

let _sdk: typeof import('@nirholas/pump-sdk') | null = null
function getSdk() {
  if (!_sdk) _sdk = require('@nirholas/pump-sdk') as typeof import('@nirholas/pump-sdk')
  return _sdk
}

interface ProofPoolRow extends ProofPool {}
interface ProofBackingRow extends ProofBacking {}
interface ProofPoolEventRow extends ProofPoolEvent {}
interface ProofPartnerSessionRow extends ProofPartnerSession {}

interface TokenAccountRef {
  ata: PublicKey
  amount: bigint
  tokenProgram: PublicKey
}

function now(): number {
  return Date.now()
}

function poolKeyName(poolId: string): string {
  return `PROOF_POOL_KEY_${poolId}`
}

function creatorKeyName(poolId: string): string {
  return `PROOF_CREATOR_KEY_${poolId}`
}

function vanityMintKeyName(id: string): string {
  return `PROOF_VANITY_MINT_${id}`
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().replace(/^\$/, '').toUpperCase()
}

function parsePublicKey(value: string, field: string): PublicKey {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${field} is required`)
  try {
    return new PublicKey(trimmed)
  } catch {
    throw new Error(`${field} is not a valid Solana address`)
  }
}

function normalizeHttpsUrl(value: string | null | undefined, field: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol')
    return url.toString()
  } catch {
    throw new Error(`${field} must be a valid URL`)
  }
}

function parseSecretKey(value: string): Keypair {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Private key is required')
  try {
    const bytes = bs58.decode(trimmed)
    if (bytes.length !== 64) throw new Error('expected 64-byte secret key')
    return Keypair.fromSecretKey(bytes)
  } catch (err) {
    throw new Error(`Invalid base58 private key: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function storeKeypair(keyName: string, keypair: Keypair): void {
  SecureKey.storeKey(keyName, bs58.encode(keypair.secretKey))
}

function loadStoredKeypair(keyName: string, expectedAddress?: string): Keypair {
  const encoded = SecureKey.getKey(keyName)
  if (!encoded) throw new Error(`Missing secure key: ${keyName}`)
  const keypair = Keypair.fromSecretKey(bs58.decode(encoded))
  if (expectedAddress && keypair.publicKey.toBase58() !== expectedAddress) {
    keypair.secretKey.fill(0)
    throw new Error(`Secure key mismatch for ${expectedAddress}`)
  }
  return keypair
}

function solToLamports(sol: number): number {
  if (!Number.isFinite(sol) || sol <= 0) throw new Error('SOL amount must be greater than 0')
  return Math.round(sol * LAMPORTS_PER_SOL)
}

function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / LAMPORTS_PER_SOL
}

function poolMinBackingLamports(pool: ProofPoolRow): number {
  return Number(pool.min_backing_lamports || solToLamports(Number(pool.min_backing_sol)))
}

function backingAmountLamports(backing: ProofBackingRow): number {
  return Number(backing.amount_lamports || solToLamports(Number(backing.amount_sol)))
}

function backingClaimableLamports(backing: ProofBackingRow): number {
  return Number(backing.claimable_fees_lamports || solToLamports(Number(backing.claimable_fees_sol)))
}

function backingClaimedLamports(backing: ProofBackingRow): number {
  return Number(backing.total_claimed_lamports || solToLamports(Number(backing.total_claimed_sol)))
}

function bigintToSql(value: bigint): string {
  return value.toString()
}

function sqlToBigint(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n
  return BigInt(value)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getProofImageDir(): string {
  return path.join(app.getPath('userData'), IMAGE_STAGING_DIR)
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function getImageMime(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'image/gif'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

function assertImagePath(imagePath: string, options: { requireStaged?: boolean } = {}): { path: string; mimeType: string; ext: string } {
  const resolved = fs.realpathSync(imagePath)
  const stats = fs.statSync(resolved)
  if (!stats.isFile()) throw new Error('Token image must be a file')
  if (stats.size <= 0 || stats.size > MAX_TOKEN_IMAGE_BYTES) throw new Error('Token image must be between 1 byte and 5 MB')

  if (options.requireStaged) {
    const imageDir = fs.realpathSync(getProofImageDir())
    if (!isPathInside(imageDir, resolved)) throw new Error('Proof Pool images must be selected through the image picker')
  }

  const header = Buffer.alloc(Math.min(16, stats.size))
  const fd = fs.openSync(resolved, 'r')
  try {
    fs.readSync(fd, header, 0, header.length, 0)
  } finally {
    fs.closeSync(fd)
  }
  const mimeType = getImageMime(header)
  if (!mimeType) throw new Error('Token image must be a PNG, JPG, GIF, or WEBP file')
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.replace('image/', '')
  return { path: resolved, mimeType, ext }
}

function stageProofImage(imagePath: string): string {
  const source = assertImagePath(imagePath)
  const targetDir = getProofImageDir()
  fs.mkdirSync(targetDir, { recursive: true })
  const target = path.join(targetDir, `${randomUUID()}.${source.ext}`)
  fs.copyFileSync(source.path, target, fs.constants.COPYFILE_EXCL)
  return target
}

function validateCreateInput(input: CreateProofPoolInput): Required<CreateProofPoolInput> {
  const name = input.name?.trim()
  const symbol = normalizeSymbol(input.symbol ?? '')
  const description = input.description?.trim()
  if (!name) throw new Error('Name is required')
  if (!symbol) throw new Error('Symbol is required')
  if (symbol.length > 10) throw new Error('Symbol must be 10 characters or less')
  if (!description) throw new Error('Description is required')
  parsePublicKey(input.creatorWallet, 'Creator wallet')

  const totalSlots = Number(input.totalSlots)
  if (!Number.isInteger(totalSlots) || totalSlots < MIN_SLOTS || totalSlots > MAX_SLOTS) {
    throw new Error(`Total slots must be between ${MIN_SLOTS} and ${MAX_SLOTS}`)
  }

  const minBackingSol = Number(input.minBackingSol)
  if (!Number.isFinite(minBackingSol) || minBackingSol < MIN_BACKING_SOL) {
    throw new Error(`Minimum backing must be at least ${MIN_BACKING_SOL} SOL`)
  }

  const backingDays = Number(input.backingDays ?? DEFAULT_BACKING_DAYS)
  if (!Number.isFinite(backingDays) || backingDays <= 0 || backingDays > MAX_BACKING_DAYS) {
    throw new Error(`Backing window must be between 1 and ${MAX_BACKING_DAYS} days`)
  }

  return {
    name,
    symbol,
    description,
    imagePath: input.imagePath?.trim() ? assertImagePath(input.imagePath.trim(), { requireStaged: true }).path : null,
    twitter: input.twitter?.trim() || '',
    telegram: input.telegram?.trim() || '',
    website: input.website?.trim() || '',
    creatorWallet: input.creatorWallet.trim(),
    totalSlots,
    minBackingSol,
    backingDays,
  }
}

function getProofLaunchApiBase(): string {
  return (process.env.PROOFLAUNCH_API_BASE ?? PROOFLAUNCH_API_BASE).replace(/\/+$/, '')
}

function getProofLaunchApiKey(): string | null {
  return SecureKey.getKey(PROOFLAUNCH_API_KEY)
    ?? process.env.PROOFLAUNCH_API_KEY
    ?? process.env.DAEMON_PROOFLAUNCH_API_KEY
    ?? null
}

function getProofLaunchWebhookSecret(): string | null {
  return SecureKey.getKey(PROOFLAUNCH_WEBHOOK_SECRET)
    ?? process.env.PROOFLAUNCH_WEBHOOK_SECRET
    ?? process.env.DAEMON_PROOFLAUNCH_WEBHOOK_SECRET
    ?? null
}

function proofLaunchUrl(path: string): string {
  return `${getProofLaunchApiBase()}${path.startsWith('/') ? path : `/${path}`}`
}

function normalizeProofLaunchResponseUrl(value: string | null): string | null {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/')) return proofLaunchUrl(value)
  return `https://${value}`
}

function normalizeMetadata(input: Record<string, string | null | undefined> | null | undefined): Record<string, string> {
  const metadata: Record<string, string> = {}
  for (const [key, value] of Object.entries(input ?? {})) {
    const normalizedKey = key.trim()
    const normalizedValue = value?.trim()
    if (normalizedKey && normalizedValue) metadata[normalizedKey] = normalizedValue
  }
  return metadata
}

function validatePartnerSessionInput(input: CreateProofPartnerSessionInput): {
  name: string
  symbol: string
  description: string
  imageUrl: string | null
  creatorWallet: string
  totalSlots: number
  minBackingSol: number
  metadata: Record<string, string>
  returnUrl: string
  partnerReference: string
} {
  const name = input.name?.trim()
  const symbol = normalizeSymbol(input.symbol ?? '')
  const description = input.description?.trim()
  if (!name) throw new Error('Name is required')
  if (!symbol) throw new Error('Symbol is required')
  if (symbol.length > 10) throw new Error('Symbol must be 10 characters or less')
  if (!description) throw new Error('Description is required')
  const creatorWallet = parsePublicKey(input.creatorWallet, 'Creator wallet').toBase58()

  const totalSlots = Number(input.totalSlots)
  if (!Number.isInteger(totalSlots) || totalSlots < MIN_SLOTS || totalSlots > MAX_SLOTS) {
    throw new Error(`Total slots must be between ${MIN_SLOTS} and ${MAX_SLOTS}`)
  }

  const minBackingSol = Number(input.minBackingSol)
  if (!Number.isFinite(minBackingSol) || minBackingSol < MIN_BACKING_SOL) {
    throw new Error(`Minimum backing must be at least ${MIN_BACKING_SOL} SOL`)
  }

  return {
    name,
    symbol,
    description,
    imageUrl: normalizeHttpsUrl(input.imageUrl, 'Image URL'),
    creatorWallet,
    totalSlots,
    minBackingSol,
    metadata: normalizeMetadata(input.metadata),
    returnUrl: normalizeHttpsUrl(input.returnUrl ?? PROOFLAUNCH_DEFAULT_RETURN_URL, 'Return URL') ?? PROOFLAUNCH_DEFAULT_RETURN_URL,
    partnerReference: input.partnerReference?.trim() || `daemon-${randomUUID()}`,
  }
}

async function proofLaunchRequest<T>(path: string, init: RequestInit = {}, publicRequest = false): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROOFLAUNCH_REQUEST_TIMEOUT_MS)
  try {
    const headers = new Headers(init.headers)
    if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
    if (!publicRequest) {
      const apiKey = getProofLaunchApiKey()
      if (!apiKey) throw new Error('ProofLaunch API key is not configured')
      headers.set('Authorization', `Bearer ${apiKey}`)
    }
    const response = await fetch(proofLaunchUrl(path), {
      ...init,
      headers,
      signal: controller.signal,
    })
    const body = await response.text()
    let payload: unknown = {}
    if (body) {
      try {
        payload = JSON.parse(body)
      } catch {
        if (response.ok) throw new Error('ProofLaunch response was not valid JSON')
        payload = { raw: body }
      }
    }
    if (response.ok) return payload as T
    throw new Error(`ProofLaunch request failed (${response.status})${body ? `: ${body}` : ''}`)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('ProofLaunch request timed out')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseProofLaunchTimestamp(timestamp: string): number {
  const trimmed = timestamp.trim()
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    return trimmed.length <= 10 ? numeric * 1000 : numeric
  }
  return Date.parse(trimmed)
}

function recordWebhookReceipt(provider: string, rawBody: string | Buffer, timestamp: string, signature: string): boolean {
  const receiptHash = createHash('sha256')
    .update(provider)
    .update('\0')
    .update(timestamp)
    .update('\0')
    .update(rawBody)
    .update('\0')
    .update(signature.trim().toLowerCase())
    .digest('hex')
  try {
    getDb().prepare(`
      INSERT INTO proof_webhook_receipts (id, provider, receipt_hash, received_at)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), provider, receiptHash, now())
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
    if (message.includes('unique') || message.includes('constraint')) return false
    throw err
  }
}

function extractSessionPayload(payload: unknown): {
  id: string
  checkoutUrl: string | null
  status: string
  memeId: string | null
  memeUrl: string | null
} {
  const root = payload as Record<string, unknown>
  const data = (root.data ?? root.session ?? root) as Record<string, unknown>
  const session = (data.session ?? data) as Record<string, unknown>
  const checkoutUrl = typeof session.checkout_url === 'string'
    ? session.checkout_url
    : typeof session.checkoutUrl === 'string'
      ? session.checkoutUrl
      : null
  const id = typeof session.id === 'string'
    ? session.id
    : typeof session.session_id === 'string'
      ? session.session_id
    : typeof session.sessionId === 'string'
        ? session.sessionId
        : checkoutUrl
          ? new URL(checkoutUrl, getProofLaunchApiBase()).searchParams.get('session')
          : null
  if (!id) throw new Error('ProofLaunch response did not include a session id')
  return {
    id,
    checkoutUrl: normalizeProofLaunchResponseUrl(checkoutUrl),
    status: typeof session.status === 'string' ? session.status : 'created',
    memeId: typeof session.meme_id === 'string'
      ? session.meme_id
      : typeof session.memeId === 'string'
        ? session.memeId
        : null,
    memeUrl: normalizeProofLaunchResponseUrl(typeof session.meme_url === 'string'
      ? session.meme_url
      : typeof session.memeUrl === 'string'
        ? session.memeUrl
        : null),
  }
}

function getPartnerSessionRow(sessionId: string): ProofPartnerSessionRow {
  const session = getDb().prepare('SELECT * FROM proof_partner_sessions WHERE id = ?').get(sessionId) as ProofPartnerSessionRow | undefined
  if (!session) throw new Error('ProofLaunch partner session not found')
  return session
}

export function getPartnerCredentialStatus(): ProofPartnerCredentialStatus {
  return {
    apiKeyConfigured: !!getProofLaunchApiKey(),
    webhookSecretConfigured: !!getProofLaunchWebhookSecret(),
    apiBase: getProofLaunchApiBase(),
    partnerSlug: PROOFLAUNCH_PARTNER_SLUG,
  }
}

export function configurePartnerCredentials(input: ConfigureProofPartnerCredentialsInput): ProofPartnerCredentialStatus {
  const apiKey = input.apiKey?.trim()
  const webhookSecret = input.webhookSecret?.trim()
  if (apiKey) SecureKey.storeKey(PROOFLAUNCH_API_KEY, apiKey)
  if (webhookSecret) SecureKey.storeKey(PROOFLAUNCH_WEBHOOK_SECRET, webhookSecret)
  return getPartnerCredentialStatus()
}

export function verifyProofLaunchWebhookSignature(
  rawBody: string | Buffer,
  timestamp: string,
  signature: string,
): boolean {
  const secret = getProofLaunchWebhookSecret()
  if (!secret) throw new Error('ProofLaunch webhook secret is not configured')
  const timestampMs = parseProofLaunchTimestamp(timestamp)
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > WEBHOOK_DRIFT_MS) return false

  const hmac = createHmac('sha256', secret)
  hmac.update(`${timestamp}.`)
  hmac.update(rawBody)
  const expected = hmac.digest('hex')
  const received = signature.trim().replace(/^sha256=/i, '').toLowerCase()
  try {
    const expectedBuffer = Buffer.from(expected, 'hex')
    const receivedBuffer = Buffer.from(received, 'hex')
    if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) return false
    return recordWebhookReceipt('prooflaunch', rawBody, timestamp, received)
  } catch {
    return false
  }
}

export async function createPartnerSession(input: CreateProofPartnerSessionInput): Promise<ProofPartnerSession> {
  const normalized = validatePartnerSessionInput(input)
  const request = {
    name: normalized.name,
    symbol: normalized.symbol,
    description: normalized.description,
    image_url: normalized.imageUrl,
    creator_wallet: normalized.creatorWallet,
    total_slots: normalized.totalSlots,
    min_backing_sol: normalized.minBackingSol,
    metadata: normalized.metadata,
    return_url: normalized.returnUrl,
    partner_reference: normalized.partnerReference,
  }
  const response = await proofLaunchRequest<unknown>('/api/v1/partners/sessions', {
    method: 'POST',
    body: JSON.stringify(request),
  })
  const session = extractSessionPayload(response)
  const createdAt = now()
  getDb().prepare(`
    INSERT OR REPLACE INTO proof_partner_sessions (
      id, partner_reference, name, symbol, description, image_url, creator_wallet,
      total_slots, min_backing_sol, metadata_json, return_url, checkout_url, status,
      meme_id, meme_url, prefill_json, request_json, response_json, created_at,
      updated_at, last_polled_at, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL)
  `).run(
    session.id,
    normalized.partnerReference,
    normalized.name,
    normalized.symbol,
    normalized.description,
    normalized.imageUrl,
    normalized.creatorWallet,
    normalized.totalSlots,
    normalized.minBackingSol,
    JSON.stringify(normalized.metadata),
    normalized.returnUrl,
    session.checkoutUrl,
    session.status,
    session.memeId,
    session.memeUrl,
    JSON.stringify(request),
    JSON.stringify(response),
    createdAt,
    createdAt,
  )
  return getPartnerSession(session.id)
}

export function listPartnerSessions(): ProofPartnerSession[] {
  return getDb().prepare(`
    SELECT * FROM proof_partner_sessions
    ORDER BY created_at DESC
  `).all() as ProofPartnerSession[]
}

export function getPartnerSession(sessionId: string): ProofPartnerSession {
  return getPartnerSessionRow(sessionId)
}

export async function pollPartnerSession(sessionId: string): Promise<ProofPartnerSession> {
  getPartnerSessionRow(sessionId)
  const response = await proofLaunchRequest<unknown>(`/api/v1/partners/sessions/${encodeURIComponent(sessionId)}`)
  const session = extractSessionPayload(response)
  const updatedAt = now()
  getDb().prepare(`
    UPDATE proof_partner_sessions
    SET checkout_url = ?,
        status = ?,
        meme_id = ?,
        meme_url = ?,
        response_json = ?,
        updated_at = ?,
        last_polled_at = ?,
        error_message = NULL
    WHERE id = ?
  `).run(
    session.checkoutUrl,
    session.status,
    session.memeId,
    session.memeUrl,
    JSON.stringify(response),
    updatedAt,
    updatedAt,
    sessionId,
  )
  return getPartnerSession(sessionId)
}

export async function fetchPartnerPrefill(sessionId: string): Promise<unknown> {
  getPartnerSessionRow(sessionId)
  const response = await proofLaunchRequest<unknown>(`/api/sessions/${encodeURIComponent(sessionId)}/prefill`, {}, true)
  getDb().prepare(`
    UPDATE proof_partner_sessions
    SET prefill_json = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(response), now(), sessionId)
  return response
}

function appendPoolEvent(
  poolId: string,
  kind: string,
  message: string,
  signature?: string | null,
  metadata?: Record<string, unknown>,
): void {
  getDb().prepare(`
    INSERT INTO proof_pool_events (id, pool_id, kind, message, signature, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    poolId,
    kind,
    message,
    signature ?? null,
    JSON.stringify(metadata ?? {}),
    now(),
  )
}

function getPoolRow(poolId: string): ProofPoolRow {
  const pool = getDb().prepare('SELECT * FROM proof_pools WHERE id = ?').get(poolId) as ProofPoolRow | undefined
  if (!pool) throw new Error('Proof pool not found')
  return pool
}

function getBackingRow(backingId: string): ProofBackingRow {
  const backing = getDb().prepare('SELECT * FROM proof_backings WHERE id = ?').get(backingId) as ProofBackingRow | undefined
  if (!backing) throw new Error('Backing not found')
  return backing
}

function listBackings(poolId: string): ProofBackingRow[] {
  return getDb().prepare(`
    SELECT * FROM proof_backings
    WHERE pool_id = ?
    ORDER BY slot_number ASC, created_at ASC
  `).all(poolId) as ProofBackingRow[]
}

function listPoolEvents(poolId: string): ProofPoolEventRow[] {
  return getDb().prepare(`
    SELECT * FROM proof_pool_events
    WHERE pool_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(poolId) as ProofPoolEventRow[]
}

function getActiveBackings(poolId: string): ProofBackingRow[] {
  return getDb().prepare(`
    SELECT * FROM proof_backings
    WHERE pool_id = ? AND status IN ('confirmed', 'distributing', 'distributed', 'refunding')
    ORDER BY slot_number ASC, created_at ASC
  `).all(poolId) as ProofBackingRow[]
}

function updatePoolBackingTotals(poolId: string, status?: ProofPoolStatus): void {
  const stats = getDb().prepare(`
    SELECT COALESCE(SUM(amount_lamports), 0) AS total
    FROM proof_backings
    WHERE pool_id = ? AND status IN ('confirmed', 'distributing', 'distributed', 'refunding')
  `).get(poolId) as { total: number }
  const totalLamports = Number(stats.total || 0)
  if (status) {
    getDb().prepare(`
      UPDATE proof_pools
      SET current_backing_lamports = ?, current_backing_sol = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(totalLamports, lamportsToSol(totalLamports), status, now(), poolId)
    return
  }
  getDb().prepare(`
    UPDATE proof_pools
    SET current_backing_lamports = ?, current_backing_sol = ?, updated_at = ?
    WHERE id = ?
  `).run(totalLamports, lamportsToSol(totalLamports), now(), poolId)
}

function createPayoutIntent(input: {
  poolId: string
  backingId?: string | null
  kind: string
  recipient?: string | null
  mint?: string | null
  lamports?: number | null
  tokenAmount?: string | null
}): string {
  const id = randomUUID()
  getDb().prepare(`
    INSERT OR REPLACE INTO proof_payout_intents (
      id, pool_id, backing_id, kind, recipient, mint, lamports, token_amount,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(
    id,
    input.poolId,
    input.backingId ?? null,
    input.kind,
    input.recipient ?? null,
    input.mint ?? null,
    input.lamports ?? null,
    input.tokenAmount ?? null,
    now(),
    now(),
  )
  return id
}

function markPayoutIntent(id: string, status: string, signature?: string | null, error?: string | null): void {
  getDb().prepare(`
    UPDATE proof_payout_intents
    SET status = ?, signature = COALESCE(?, signature), error_message = ?, updated_at = ?
    WHERE id = ?
  `).run(status, signature ?? null, error ?? null, now(), id)
}

function transitionBackingStatus(backingId: string, from: ProofBackingRow['status'], to: ProofBackingRow['status']): boolean {
  const result = getDb().prepare(`
    UPDATE proof_backings
    SET status = ?, updated_at = ?
    WHERE id = ? AND status = ?
  `).run(to, now(), backingId, from)
  return result.changes === 1
}

function findNextSlot(pool: ProofPoolRow): number {
  const active = getActiveBackings(pool.id)
  const used = new Set(active.map((row) => row.slot_number))
  for (let slot = 1; slot <= pool.total_slots; slot++) {
    if (!used.has(slot)) return slot
  }
  throw new Error('All backing slots are filled')
}

function refreshPoolFunding(poolId: string): ProofPoolRow {
  const pool = getPoolRow(poolId)
  const stats = getDb().prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount_lamports), 0) AS total
    FROM proof_backings
    WHERE pool_id = ? AND status = 'confirmed'
  `).get(poolId) as { count: number; total: number }
  const nextStatus: ProofPoolStatus = stats.count >= pool.total_slots ? 'funded' : 'backing'
  const totalLamports = Number(stats.total || 0)
  getDb().prepare(`
    UPDATE proof_pools
    SET current_backing_lamports = ?, current_backing_sol = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(totalLamports, lamportsToSol(totalLamports), nextStatus, now(), poolId)
  if (pool.status !== 'funded' && nextStatus === 'funded') {
    appendPoolEvent(poolId, 'funded', 'All backing slots are filled')
  }
  return getPoolRow(poolId)
}

function buildMetadataFormData(pool: ProofPoolRow): FormData {
  const formData = new FormData()
  formData.append('name', pool.name)
  formData.append('symbol', pool.symbol)
  formData.append('description', pool.description)
  formData.append('showName', 'true')
  if (pool.twitter) formData.append('twitter', pool.twitter)
  if (pool.telegram) formData.append('telegram', pool.telegram)
  if (pool.website) formData.append('website', pool.website)

  if (pool.image_path) {
    const image = assertImagePath(pool.image_path, { requireStaged: true })
    const imageBuffer = fs.readFileSync(image.path)
    const { ext, mimeType } = image
    formData.append('file', new Blob([imageBuffer], { type: mimeType }), `token.${ext}`)
  }

  return formData
}

function isRetryableMetadataStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function uploadPumpMetadata(pool: ProofPoolRow): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= METADATA_UPLOAD_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), METADATA_UPLOAD_TIMEOUT_MS)
    try {
      const response = await fetch(PUMPFUN_METADATA_ENDPOINT, {
        method: 'POST',
        body: buildMetadataFormData(pool),
        signal: controller.signal,
      })
      if (response.ok) {
        const json = await response.json() as { metadataUri?: string }
        if (!json.metadataUri) throw new Error('Metadata upload did not return a metadataUri')
        return json.metadataUri
      }
      const body = await response.text().catch(() => '')
      lastError = new Error(`Metadata upload failed (${response.status})${body ? `: ${body}` : ''}`)
      if (!isRetryableMetadataStatus(response.status) || attempt === METADATA_UPLOAD_MAX_ATTEMPTS) throw lastError
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Token metadata upload timed out after 30s')
      }
      lastError = err
      if (attempt === METADATA_UPLOAD_MAX_ATTEMPTS) throw err
    } finally {
      clearTimeout(timeoutId)
    }
    await sleep(METADATA_UPLOAD_RETRY_BASE_MS * Math.pow(2, attempt - 1))
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to upload token metadata')
}

async function readTokenAccount(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
): Promise<TokenAccountRef> {
  const candidates = [TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID]
  let lastError: unknown
  for (const tokenProgram of candidates) {
    const ata = getAssociatedTokenAddressSync(mint, owner, true, tokenProgram)
    try {
      const account = await getAccount(connection, ata, 'confirmed', tokenProgram)
      return { ata, amount: account.amount, tokenProgram }
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Token account not found')
}

async function waitForTokenAccount(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
): Promise<TokenAccountRef> {
  let lastError: unknown
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await readTokenAccount(connection, mint, owner)
    } catch (err) {
      lastError = err
      if (attempt < 5) await sleep(1_000)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Token account not found after launch')
}

function getEscrowKeypair(): Keypair {
  return loadStoredKeypair(PROOF_ESCROW_KEY)
}

async function ensurePoolLamports(
  connection: Connection,
  pool: PublicKey,
  neededLamports: number,
): Promise<TransactionExecutionResult | null> {
  const balance = await connection.getBalance(pool)
  if (balance >= neededLamports) return null
  const escrow = getEscrowKeypair()
  try {
    const topUpLamports = neededLamports - balance
    const escrowBalance = await connection.getBalance(escrow.publicKey)
    if (escrowBalance < topUpLamports + BASE_TX_FEE_LAMPORTS) {
      throw new Error(`Escrow has ${lamportsToSol(escrowBalance).toFixed(4)} SOL; top-up needs ${lamportsToSol(topUpLamports + BASE_TX_FEE_LAMPORTS).toFixed(4)} SOL`)
    }
    return await executeInstructions(
      connection,
      [SystemProgram.transfer({ fromPubkey: escrow.publicKey, toPubkey: pool, lamports: topUpLamports })],
      [escrow],
      { payer: escrow.publicKey },
    )
  } finally {
    escrow.secretKey.fill(0)
  }
}

async function assertSignerBalance(
  connection: Connection,
  owner: PublicKey,
  neededLamports: number,
  label: string,
): Promise<void> {
  const balance = await connection.getBalance(owner)
  if (balance < neededLamports) {
    throw new Error(`${label} has ${lamportsToSol(balance).toFixed(4)} SOL; needs ${lamportsToSol(neededLamports).toFixed(4)} SOL`)
  }
}

function allocateProportionally<T extends ProofBackingRow>(
  total: bigint,
  rows: T[],
): Array<T & { allocation: bigint }> {
  const totalLamports = rows.reduce((sum, row) => sum + BigInt(backingAmountLamports(row)), 0n)
  if (totalLamports <= 0n) throw new Error('Cannot allocate against zero backing')

  let assigned = 0n
  return rows.map((row, index) => {
    const rowLamports = BigInt(backingAmountLamports(row))
    const allocation = index === rows.length - 1
      ? total - assigned
      : (total * rowLamports) / totalLamports
    assigned += allocation
    return { ...row, allocation }
  })
}

function getSystemTransferLamportsToPool(
  instruction: unknown,
  source: string,
  destination: string,
): number | null {
  const parsedIx = instruction as {
    program?: string
    parsed?: { type?: string; info?: { source?: string; destination?: string; lamports?: number | string } }
  }
  if (parsedIx.program !== 'system' || parsedIx.parsed?.type !== 'transfer') return null
  const info = parsedIx.parsed.info
  if (!info || info.source !== source || info.destination !== destination) return null
  const lamports = Number(info.lamports)
  return Number.isSafeInteger(lamports) && lamports > 0 ? lamports : null
}

export function getEscrowStatus(): ProofEscrowStatus {
  const encoded = SecureKey.getKey(PROOF_ESCROW_KEY)
  if (!encoded) {
    return { configured: false, address: null, keyName: PROOF_ESCROW_KEY, hint: 'Generate or import a DAEMON Proof escrow before launch/distribution.' }
  }
  const keypair = Keypair.fromSecretKey(bs58.decode(encoded))
  const address = keypair.publicKey.toBase58()
  keypair.secretKey.fill(0)
  return { configured: true, address, keyName: PROOF_ESCROW_KEY, hint: 'Funds platform gas, distribution retries, and fee claims.' }
}

export async function getEscrowStatusWithBalance(): Promise<ProofEscrowStatus> {
  const status = getEscrowStatus()
  if (!status.address) return status
  const connection = getConnection()
  const balanceLamports = await connection.getBalance(new PublicKey(status.address)).catch(() => undefined)
  if (balanceLamports === undefined) return status
  return {
    ...status,
    balanceLamports,
    balanceSol: lamportsToSol(balanceLamports),
  }
}

export function configureEscrow(input?: { privateKeyBase58?: string | null; allowRotation?: boolean | null }): ProofEscrowStatus {
  const existing = getEscrowStatus()
  if (existing.configured && !input?.allowRotation) {
    throw new Error('Proof escrow is already configured. Use an explicit rotation flow before replacing custody.')
  }
  const keypair = input?.privateKeyBase58?.trim()
    ? parseSecretKey(input.privateKeyBase58)
    : Keypair.generate()
  try {
    storeKeypair(PROOF_ESCROW_KEY, keypair)
    return getEscrowStatus()
  } finally {
    keypair.secretKey.fill(0)
  }
}

export function exportEscrowPrivateKey(): { address: string; privateKeyBase58: string } {
  const lastExport = exportCooldowns.get(PROOF_ESCROW_KEY)
  if (lastExport && Date.now() - lastExport < ESCROW_EXPORT_COOLDOWN_MS) {
    throw new Error('Export cooldown active. Please wait 60 seconds.')
  }
  const privateKeyBase58 = SecureKey.getKey(PROOF_ESCROW_KEY)
  if (!privateKeyBase58) throw new Error('No Proof escrow key is configured')
  const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
  try {
    exportCooldowns.set(PROOF_ESCROW_KEY, Date.now())
    return { address: keypair.publicKey.toBase58(), privateKeyBase58 }
  } finally {
    keypair.secretKey.fill(0)
  }
}

export function createPool(input: CreateProofPoolInput): ProofPoolDetail {
  const normalized = validateCreateInput(input)
  const id = randomUUID()
  const createdAt = now()
  const poolKeypair = Keypair.generate()
  const creatorKeypair = Keypair.generate()
  const poolKey = poolKeyName(id)
  const creatorKey = creatorKeyName(id)
  const backingDeadline = createdAt + Math.round(normalized.backingDays * 24 * 60 * 60 * 1000)
  const minBackingLamports = solToLamports(normalized.minBackingSol)

  try {
    storeKeypair(poolKey, poolKeypair)
    storeKeypair(creatorKey, creatorKeypair)
    getDb().prepare(`
      INSERT INTO proof_pools (
        id, name, symbol, description, image_path, twitter, telegram, website,
        creator_wallet, pool_wallet, pool_key_name, creator_subescrow, creator_key_name,
        total_slots, min_backing_sol, min_backing_lamports, current_backing_sol, current_backing_lamports, status, backing_deadline,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'backing', ?, ?, ?)
    `).run(
      id,
      normalized.name,
      normalized.symbol,
      normalized.description,
      normalized.imagePath,
      normalized.twitter || null,
      normalized.telegram || null,
      normalized.website || null,
      normalized.creatorWallet,
      poolKeypair.publicKey.toBase58(),
      poolKey,
      creatorKeypair.publicKey.toBase58(),
      creatorKey,
      normalized.totalSlots,
      normalized.minBackingSol,
      minBackingLamports,
      backingDeadline,
      createdAt,
      createdAt,
    )
    appendPoolEvent(id, 'created', `Proof pool created for ${normalized.symbol}`, null, {
      poolWallet: poolKeypair.publicKey.toBase58(),
      creatorSubescrow: creatorKeypair.publicKey.toBase58(),
    })
    return getPool(id)
  } finally {
    poolKeypair.secretKey.fill(0)
    creatorKeypair.secretKey.fill(0)
  }
}

export function listPools(): ProofPool[] {
  return getDb().prepare('SELECT * FROM proof_pools ORDER BY created_at DESC').all() as ProofPool[]
}

export function getPool(poolId: string): ProofPoolDetail {
  const pool = getPoolRow(poolId)
  return {
    pool,
    backings: listBackings(poolId),
    events: listPoolEvents(poolId),
  }
}

export async function verifyBacking(input: VerifyProofBackingInput): Promise<ProofPoolDetail> {
  const pool = getPoolRow(input.poolId)
  if (pool.status !== 'backing') throw new Error(`Pool is not accepting backings (status: ${pool.status})`)
  if (pool.backing_deadline <= now()) throw new Error('Backing window has expired')

  const backer = parsePublicKey(input.backerWallet, 'Backer wallet')
  const amountSol = Number(input.amountSol)
  if (!Number.isFinite(amountSol) || solToLamports(amountSol) < poolMinBackingLamports(pool)) {
    throw new Error(`Backing must be at least ${pool.min_backing_sol} SOL`)
  }
  const signature = input.depositSignature.trim()
  if (!signature) throw new Error('Deposit signature is required')

  const duplicate = getDb().prepare(`
    SELECT id FROM proof_backings WHERE deposit_signature = ? LIMIT 1
  `).get(signature) as { id: string } | undefined
  if (duplicate) throw new Error('This deposit signature is already recorded')

  const existingWallet = getDb().prepare(`
    SELECT id FROM proof_backings
    WHERE pool_id = ? AND backer_wallet = ? AND status = 'confirmed'
    LIMIT 1
  `).get(pool.id, backer.toBase58()) as { id: string } | undefined
  if (existingWallet) throw new Error('This wallet already has an active backing slot')

  const connection = getConnection()
  const tx = await connection.getParsedTransaction(signature, {
    commitment: 'finalized',
    maxSupportedTransactionVersion: 0,
  })
  if (!tx) throw new Error('Deposit transaction was not found on-chain')
  if (tx.meta?.err) throw new Error('Deposit transaction failed on-chain')

  const destination = pool.pool_wallet
  const verifiedLamports = tx.transaction.message.instructions.reduce((max, ix) => {
    const lamports = getSystemTransferLamportsToPool(ix, backer.toBase58(), destination)
    return lamports && lamports > max ? lamports : max
  }, 0)
  if (verifiedLamports < poolMinBackingLamports(pool)) {
    throw new Error(`Deposit tx must transfer at least ${pool.min_backing_sol} SOL from ${backer.toBase58()} to ${destination}`)
  }
  const verifiedSol = lamportsToSol(verifiedLamports)

  const slotNumber = findNextSlot(pool)
  getDb().prepare(`
    INSERT INTO proof_backings (
      id, pool_id, backer_wallet, amount_sol, amount_lamports, deposit_signature, slot_number,
      status, claimable_fees_sol, total_claimed_sol, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 0, 0, ?, ?)
  `).run(randomUUID(), pool.id, backer.toBase58(), verifiedSol, verifiedLamports, signature, slotNumber, now(), now())
  appendPoolEvent(pool.id, 'backing_verified', `Slot ${slotNumber} verified for ${verifiedSol} SOL`, signature, {
    backer: backer.toBase58(),
    amountSol: verifiedSol,
    amountLamports: verifiedLamports,
  })
  refreshPoolFunding(pool.id)
  return getPool(pool.id)
}

function reserveLamportsForLaunch(pool: ProofPoolRow): number {
  return 40_000_000 + (pool.total_slots * 3_000_000)
}

function takeUnusedVanityMint(poolId: string): { id: string; keypair: Keypair } | null {
  const row = getDb().prepare(`
    SELECT id, address, key_name FROM proof_vanity_mints
    WHERE used_pool_id IS NULL
    ORDER BY created_at ASC
    LIMIT 1
  `).get() as { id: string; address: string; key_name: string } | undefined
  if (!row) return null
  const reserved = getDb().prepare(`
    UPDATE proof_vanity_mints
    SET used_pool_id = ?
    WHERE id = ? AND used_pool_id IS NULL
  `).run(poolId, row.id)
  if (reserved.changes !== 1) return null
  return { id: row.id, keypair: loadStoredKeypair(row.key_name, row.address) }
}

export async function launchPool(poolId: string): Promise<ProofPoolLaunchResult> {
  const initialPool = getPoolRow(poolId)
  const infrastructure = getWalletInfrastructureSettings()
  if (infrastructure.cluster !== 'mainnet-beta') {
    throw new Error('Proof Pool launch requires wallet infrastructure cluster mainnet-beta')
  }
  if (initialPool.status !== 'funded') throw new Error(`Pool must be funded before launch (status: ${initialPool.status})`)
  if (!getEscrowStatus().configured) throw new Error('Configure the DAEMON Proof escrow before launching')
  const launchBackings = getActiveBackings(poolId).filter((backing) => backing.status === 'confirmed')
  const backingCount = launchBackings.length
  if (backingCount !== initialPool.total_slots) throw new Error('All backing slots must be verified before launch')
  const verifiedLamports = launchBackings.reduce((sum, backing) => sum + backingAmountLamports(backing), 0)

  const db = getDb()
  const lock = db.prepare(`
    UPDATE proof_pools
    SET status = ?, error_message = NULL, updated_at = ?
    WHERE id = ? AND status = 'funded'
  `).run('launching', now(), poolId)
  if (lock.changes !== 1) throw new Error('Pool launch is already in progress or no longer funded')
  appendPoolEvent(poolId, 'launching', 'Starting pooled atomic createV2 + buy')

  const connection = getConnection()
  const poolKeypair = loadStoredKeypair(initialPool.pool_key_name, initialPool.pool_wallet)
  let mintKeypair = Keypair.generate()
  const vanity = takeUnusedVanityMint(poolId)
  if (vanity) mintKeypair = vanity.keypair

  try {
    const poolBalance = await connection.getBalance(poolKeypair.publicKey)
    const reserveLamports = reserveLamportsForLaunch(initialPool)
    if (poolBalance < verifiedLamports) {
      throw new Error(`Pool wallet has ${lamportsToSol(poolBalance).toFixed(4)} SOL; verified backings require ${lamportsToSol(verifiedLamports).toFixed(4)} SOL`)
    }
    const spendLamports = verifiedLamports - reserveLamports
    if (spendLamports <= 0) {
      throw new Error(`Verified backing ${lamportsToSol(verifiedLamports).toFixed(4)} SOL is below launch reserve ${lamportsToSol(reserveLamports).toFixed(4)} SOL`)
    }
    if (poolBalance > verifiedLamports) {
      appendPoolEvent(poolId, 'surplus_quarantined', 'Ignoring unverified SOL in pool wallet during launch spend calculation', null, {
        poolBalanceLamports: poolBalance,
        verifiedLamports,
      })
    }

    const metadataUri = await uploadPumpMetadata(initialPool)
    const sdk = getSdk()
    const onlineSdk = new sdk.OnlinePumpSdk(connection)
    const pumpSdk = new sdk.PumpSdk()
    const global = await onlineSdk.fetchGlobal()
    const solAmount = new BN(spendLamports)
    const expectedTokens = sdk.getBuyTokenAmountFromSolAmount({
      global,
      feeConfig: null,
      mintSupply: null,
      bondingCurve: null,
      amount: solAmount,
    }) as BN
    const minTokens = expectedTokens.muln(97).divn(100)
    const creator = new PublicKey(initialPool.creator_subescrow)

    const instructions = await pumpSdk.createV2AndBuyInstructions({
      global,
      mint: mintKeypair.publicKey,
      name: initialPool.name,
      symbol: initialPool.symbol,
      uri: metadataUri,
      creator,
      user: poolKeypair.publicKey,
      amount: minTokens,
      solAmount,
      mayhemMode: false,
    }) as TransactionInstruction[]

    const { signature } = await executeInstructions(connection, instructions, [poolKeypair, mintKeypair], {
      payer: poolKeypair.publicKey,
      computeUnitLimit: PUMP_CREATE_BUY_COMPUTE_UNITS,
    })

    const tokenAccount = await waitForTokenAccount(connection, mintKeypair.publicKey, poolKeypair.publicKey)
    const proofLevel = vanity ? 'vanity-mint' : 'launch-tx'
    db.prepare(`
      UPDATE proof_pools
      SET status = 'live',
          mint = ?,
          mint_key_name = ?,
          metadata_uri = ?,
          launch_signature = ?,
          proof_level = ?,
          pool_token_balance = ?,
          launched_at = ?,
          updated_at = ?,
          error_message = NULL
      WHERE id = ?
    `).run(
      mintKeypair.publicKey.toBase58(),
      vanity ? vanityMintKeyName(vanity.id) : null,
      metadataUri,
      signature,
      proofLevel,
      bigintToSql(tokenAccount.amount),
      now(),
      now(),
      poolId,
    )
    if (vanity) {
      db.prepare('UPDATE proof_vanity_mints SET used_pool_id = ?, used_at = ? WHERE id = ?')
        .run(poolId, now(), vanity.id)
    }
    appendPoolEvent(poolId, 'launched', 'Pooled createV2 + buy confirmed', signature, {
      mint: mintKeypair.publicKey.toBase58(),
      poolTokenBalance: tokenAccount.amount.toString(),
      proofLevel,
    })

    const pool = getPoolRow(poolId)
    return {
      pool,
      signature,
      mint: mintKeypair.publicKey.toBase58(),
      metadataUri,
      proofLevel,
      poolTokenBalance: tokenAccount.amount.toString(),
    }
  } catch (err) {
    if (vanity) {
      db.prepare('UPDATE proof_vanity_mints SET used_pool_id = NULL, used_at = NULL WHERE id = ? AND used_pool_id = ?')
        .run(vanity.id, poolId)
    }
    db.prepare(`
      UPDATE proof_pools
      SET status = ?, error_message = ?, updated_at = ?
      WHERE id = ? AND status = 'launching'
    `).run('funded', err instanceof Error ? err.message : String(err), now(), poolId)
    appendPoolEvent(poolId, 'launch_failed', err instanceof Error ? err.message : String(err))
    throw err
  } finally {
    poolKeypair.secretKey.fill(0)
    mintKeypair.secretKey.fill(0)
  }
}

async function completeDistributionIfReady(poolId: string): Promise<void> {
  const remaining = getDb().prepare(`
    SELECT COUNT(*) AS count FROM proof_backings
    WHERE pool_id = ? AND status IN ('confirmed', 'distributing')
  `).get(poolId) as { count: number }
  if (remaining.count !== 0) return
  const pool = getPoolRow(poolId)
  if (pool.status === 'distributed') return
  getDb().prepare(`
    UPDATE proof_pools
    SET status = 'distributed', distributed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now(), now(), poolId)
  appendPoolEvent(poolId, 'distribution_complete', 'All backer token allocations are distributed')
}

async function distributeBackingRows(pool: ProofPoolRow, targetBackings: ProofBackingRow[]): Promise<ProofPoolDetail> {
  if (pool.status !== 'live' && pool.status !== 'distributed') {
    throw new Error(`Pool must be live before distribution (status: ${pool.status})`)
  }
  if (!pool.mint) throw new Error('Pool has no launched mint')

  const allBackings = getActiveBackings(pool.id)
  if (allBackings.length === 0) throw new Error('No confirmed backings to distribute')
  const targetIds = new Set(targetBackings.map((backing) => backing.id))
  const pending = allBackings.filter((backing) => (
    targetIds.has(backing.id)
    && ['confirmed', 'distributing'].includes(backing.status)
    && !backing.distribution_signature
  ))
  if (pending.length === 0) return getPool(pool.id)

  const connection = getConnection()
  const poolKeypair = loadStoredKeypair(pool.pool_key_name, pool.pool_wallet)
  try {
    const mint = new PublicKey(pool.mint)
    const poolToken = await readTokenAccount(connection, mint, poolKeypair.publicKey)
    const totalTokens = sqlToBigint(pool.pool_token_balance) || poolToken.amount
    const allocations = allocateProportionally(totalTokens, allBackings)
    const poolSource = getAssociatedTokenAddressSync(mint, poolKeypair.publicKey, true, poolToken.tokenProgram)
    await ensurePoolLamports(
      connection,
      poolKeypair.publicKey,
      pending.length * 2_700_000 + 25_000,
    )

    for (const backing of pending) {
      const allocation = allocations.find((row) => row.id === backing.id)?.allocation ?? 0n
      if (allocation <= 0n) continue
      if (backing.status === 'confirmed' && !transitionBackingStatus(backing.id, 'confirmed', 'distributing')) continue
      const backer = new PublicKey(backing.backer_wallet)
      const destination = getAssociatedTokenAddressSync(mint, backer, true, poolToken.tokenProgram)
      const intentId = createPayoutIntent({
        poolId: pool.id,
        backingId: backing.id,
        kind: 'distribution',
        recipient: backing.backer_wallet,
        mint: pool.mint,
        tokenAmount: allocation.toString(),
      })
      const instructions = [
        createAssociatedTokenAccountIdempotentInstruction(
          poolKeypair.publicKey,
          destination,
          backer,
          mint,
          poolToken.tokenProgram,
        ),
        createTransferInstruction(
          poolSource,
          destination,
          poolKeypair.publicKey,
          allocation,
          [],
          poolToken.tokenProgram,
        ),
      ]
      let signature = ''
      try {
        const result = await executeInstructions(connection, instructions, [poolKeypair], {
          payer: poolKeypair.publicKey,
          computeUnitLimit: DISTRIBUTION_COMPUTE_UNITS,
        })
        signature = result.signature
      } catch (err) {
        transitionBackingStatus(backing.id, 'distributing', 'confirmed')
        markPayoutIntent(intentId, 'failed', null, err instanceof Error ? err.message : String(err))
        throw err
      }
      getDb().prepare(`
        UPDATE proof_backings
        SET status = 'distributed',
            tokens_allocated = ?,
            distribution_signature = ?,
            distributed_at = ?,
            updated_at = ?
        WHERE id = ? AND status = 'distributing'
      `).run(allocation.toString(), signature, now(), now(), backing.id)
      markPayoutIntent(intentId, 'confirmed', signature)
      appendPoolEvent(pool.id, 'distributed', `Slot ${backing.slot_number} token allocation sent`, signature, {
        backer: backing.backer_wallet,
        tokens: allocation.toString(),
      })
    }

    await completeDistributionIfReady(pool.id)
    return getPool(pool.id)
  } finally {
    poolKeypair.secretKey.fill(0)
  }
}

export async function distributePool(poolId: string): Promise<ProofPoolDetail> {
  const pool = getPoolRow(poolId)
  const allBackings = getActiveBackings(poolId)
  const pending = allBackings.filter((backing) => backing.status !== 'distributed' || !backing.distribution_signature)
  if (pending.length === 0) return getPool(poolId)
  return distributeBackingRows(pool, pending)
}

export async function distributeBacking(input: ProofBackingActionInput): Promise<ProofPoolDetail> {
  const backing = getBackingRow(input.backingId)
  const pool = getPoolRow(backing.pool_id)
  return distributeBackingRows(pool, [backing])
}

function assertPoolRefundable(pool: ProofPoolRow, force: boolean): void {
  if (!force && ['backing', 'funded'].includes(pool.status) && pool.backing_deadline > now()) {
    throw new Error('Backing window is still active; refund is only enabled after expiry')
  }
  if (!['backing', 'funded', 'refunding', 'failed'].includes(pool.status)) {
    throw new Error(`Pool cannot be refunded from status: ${pool.status}`)
  }
}

function markPoolRefunding(pool: ProofPoolRow): void {
  if (pool.status === 'refunding') return
  const result = getDb().prepare(`
    UPDATE proof_pools
    SET status = 'refunding', updated_at = ?
    WHERE id = ? AND status IN ('backing', 'funded', 'failed')
  `).run(now(), pool.id)
  if (result.changes !== 1) throw new Error('Pool refund is already in progress or no longer refundable')
}

export async function refundPool(poolId: string, force = false): Promise<ProofPoolDetail> {
  const pool = getPoolRow(poolId)
  assertPoolRefundable(pool, force)

  const backings = listBackings(poolId).filter((backing) => ['confirmed', 'refunding'].includes(backing.status))
  if (backings.length === 0) {
    updatePoolBackingTotals(poolId, 'failed')
    return getPool(poolId)
  }
  markPoolRefunding(pool)

  const connection = getConnection()
  const poolKeypair = loadStoredKeypair(pool.pool_key_name, pool.pool_wallet)
  try {
    const totalRefundLamports = backings.reduce((sum, backing) => sum + backingAmountLamports(backing), 0)
    await assertSignerBalance(connection, poolKeypair.publicKey, totalRefundLamports + (backings.length * BASE_TX_FEE_LAMPORTS * 2), 'Pool wallet')
    for (const backing of backings) {
      if (backing.status === 'confirmed' && !transitionBackingStatus(backing.id, 'confirmed', 'refunding')) continue
      const lamports = backingAmountLamports(backing)
      const intentId = createPayoutIntent({
        poolId,
        backingId: backing.id,
        kind: 'refund',
        recipient: backing.backer_wallet,
        lamports,
      })
      let signature = ''
      try {
        const result = await executeInstructions(
          connection,
          [SystemProgram.transfer({
            fromPubkey: poolKeypair.publicKey,
            toPubkey: new PublicKey(backing.backer_wallet),
            lamports,
          })],
          [poolKeypair],
          { payer: poolKeypair.publicKey },
        )
        signature = result.signature
      } catch (err) {
        transitionBackingStatus(backing.id, 'refunding', 'confirmed')
        markPayoutIntent(intentId, 'failed', null, err instanceof Error ? err.message : String(err))
        throw err
      }
      getDb().prepare(`
        UPDATE proof_backings
        SET status = 'refunded', refund_signature = ?, refunded_at = ?, updated_at = ?
        WHERE id = ? AND status = 'refunding'
      `).run(signature, now(), now(), backing.id)
      markPayoutIntent(intentId, 'confirmed', signature)
      appendPoolEvent(poolId, 'refunded', `Slot ${backing.slot_number} refunded`, signature, {
        backer: backing.backer_wallet,
        amountSol: lamportsToSol(lamports),
        amountLamports: lamports,
      })
    }
    updatePoolBackingTotals(poolId, 'failed')
    appendPoolEvent(poolId, 'refund_complete', 'All active backing deposits were refunded')
    return getPool(poolId)
  } finally {
    poolKeypair.secretKey.fill(0)
  }
}

export async function refundBacking(input: ProofBackingActionInput): Promise<ProofPoolDetail> {
  const backing = getBackingRow(input.backingId)
  const pool = getPoolRow(backing.pool_id)
  assertPoolRefundable(pool, !!input.force)
  if (backing.status === 'refunded') return getPool(pool.id)
  if (!['confirmed', 'refunding'].includes(backing.status)) throw new Error(`Backing cannot be refunded from status: ${backing.status}`)
  markPoolRefunding(pool)

  const connection = getConnection()
  const poolKeypair = loadStoredKeypair(pool.pool_key_name, pool.pool_wallet)
  try {
    if (backing.status === 'confirmed' && !transitionBackingStatus(backing.id, 'confirmed', 'refunding')) {
      return getPool(pool.id)
    }
    const lamports = backingAmountLamports(backing)
    await assertSignerBalance(connection, poolKeypair.publicKey, lamports + (BASE_TX_FEE_LAMPORTS * 2), 'Pool wallet')
    const intentId = createPayoutIntent({
      poolId: pool.id,
      backingId: backing.id,
      kind: 'refund',
      recipient: backing.backer_wallet,
      lamports,
    })
    let signature = ''
    try {
      const result = await executeInstructions(
        connection,
        [SystemProgram.transfer({
          fromPubkey: poolKeypair.publicKey,
          toPubkey: new PublicKey(backing.backer_wallet),
          lamports,
        })],
        [poolKeypair],
        { payer: poolKeypair.publicKey },
      )
      signature = result.signature
    } catch (err) {
      transitionBackingStatus(backing.id, 'refunding', 'confirmed')
      markPayoutIntent(intentId, 'failed', null, err instanceof Error ? err.message : String(err))
      throw err
    }
    getDb().prepare(`
      UPDATE proof_backings
      SET status = 'refunded', refund_signature = ?, refunded_at = ?, updated_at = ?
      WHERE id = ? AND status = 'refunding'
    `).run(signature, now(), now(), backing.id)
    markPayoutIntent(intentId, 'confirmed', signature)
    appendPoolEvent(pool.id, 'refunded', `Slot ${backing.slot_number} refunded`, signature, {
      backer: backing.backer_wallet,
      amountSol: lamportsToSol(lamports),
      amountLamports: lamports,
    })

    const remaining = getDb().prepare(`
      SELECT COUNT(*) AS count FROM proof_backings
      WHERE pool_id = ? AND status IN ('confirmed', 'refunding')
    `).get(pool.id) as { count: number }
    if (remaining.count === 0) {
      updatePoolBackingTotals(pool.id, 'failed')
      appendPoolEvent(pool.id, 'refund_complete', 'All active backing deposits were refunded')
    } else {
      updatePoolBackingTotals(pool.id)
    }
    return getPool(pool.id)
  } finally {
    poolKeypair.secretKey.fill(0)
  }
}

export async function collectFees(poolId: string): Promise<ProofCollectFeesResult> {
  const pool = getPoolRow(poolId)
  if (pool.status !== 'distributed') {
    return { ok: true, skipped: `Pool fees can be collected after distribution (status: ${pool.status})` }
  }
  const connection = getConnection()
  const sdk = getSdk()
  const onlineSdk = new sdk.OnlinePumpSdk(connection)
  const escrow = getEscrowKeypair()
  const subEscrow = loadStoredKeypair(pool.creator_key_name, pool.creator_subescrow)
  try {
    const vaultBalanceBn = await onlineSdk.getCreatorVaultBalanceBothPrograms(subEscrow.publicKey) as BN
    const vaultLamports = Number(vaultBalanceBn.toString())
    const subBalancePre = await connection.getBalance(subEscrow.publicKey)
    if (vaultLamports < CREATOR_FEE_COLLECT_THRESHOLD_LAMPORTS && subBalancePre < CREATOR_FEE_COLLECT_THRESHOLD_LAMPORTS) {
      return {
        ok: true,
        skipped: `Creator vault below ${CREATOR_FEE_COLLECT_THRESHOLD_LAMPORTS} lamports`,
        collectedLamports: 0,
        platformLamports: 0,
        backerLamports: 0,
        backerCount: 0,
      }
    }

    let collectSig: string | undefined
    if (vaultLamports >= CREATOR_FEE_COLLECT_THRESHOLD_LAMPORTS) {
      await assertSignerBalance(connection, escrow.publicKey, CREATOR_FEE_PAYER_FLOOR_LAMPORTS, 'Escrow')
      const collectInstructions = await onlineSdk.collectCoinCreatorFeeInstructions(
        subEscrow.publicKey,
        escrow.publicKey,
      ) as TransactionInstruction[]
      const result = await executeInstructions(connection, collectInstructions, [escrow], {
        payer: escrow.publicKey,
        computeUnitLimit: COLLECT_FEES_COMPUTE_UNITS,
      })
      collectSig = result.signature
      appendPoolEvent(poolId, 'fees_collected', 'Creator vault fees collected into sub-escrow', collectSig, {
        vaultLamports,
      })
    }

    let subBalance = 0
    for (let attempt = 0; attempt < 5; attempt++) {
      subBalance = await connection.getBalance(subEscrow.publicKey)
      if (subBalance > BASE_TX_FEE_LAMPORTS) break
      if (attempt < 4) await sleep(1_000)
    }
    const drainLamports = subBalance - BASE_TX_FEE_LAMPORTS
    if (drainLamports <= 0) {
      return { ok: false, error: `Sub-escrow balance ${subBalance} too low to drain`, collectSig }
    }

    const drain = await executeInstructions(
      connection,
      [SystemProgram.transfer({
        fromPubkey: subEscrow.publicKey,
        toPubkey: escrow.publicKey,
        lamports: drainLamports,
      })],
      [subEscrow],
      { payer: subEscrow.publicKey },
    )
    const drainIntentId = createPayoutIntent({
      poolId,
      kind: 'fee_drain',
      recipient: escrow.publicKey.toBase58(),
      lamports: drainLamports,
    })
    markPayoutIntent(drainIntentId, 'confirmed', drain.signature)

    const distributedBackings = listBackings(poolId).filter((backing) => backing.status === 'distributed')
    const platformLamports = Math.floor((drainLamports * PLATFORM_FEE_BPS) / BPS_DENOMINATOR)
    const backerLamports = drainLamports - platformLamports
    let credited = 0
    if (distributedBackings.length > 0 && backerLamports > 0) {
      const allocations = allocateProportionally(BigInt(backerLamports), distributedBackings)
      const update = getDb().prepare(`
        UPDATE proof_backings
        SET claimable_fees_lamports = claimable_fees_lamports + ?,
            claimable_fees_sol = claimable_fees_sol + ?,
            updated_at = ?
        WHERE id = ?
      `)
      for (const backing of allocations) {
        if (backing.allocation <= 0n) continue
        update.run(Number(backing.allocation), lamportsToSol(backing.allocation), now(), backing.id)
        credited++
      }
    }

    appendPoolEvent(poolId, 'fees_credited', 'Trading fees credited to distributed backers', drain.signature, {
      collectedLamports: drainLamports,
      platformLamports,
      backerLamports,
      backerCount: credited,
    })
    return {
      ok: true,
      collectedLamports: drainLamports,
      platformLamports,
      backerLamports,
      backerCount: credited,
      collectSig,
      drainSig: drain.signature,
    }
  } catch (err) {
    appendPoolEvent(poolId, 'fees_failed', err instanceof Error ? err.message : String(err))
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    escrow.secretKey.fill(0)
    subEscrow.secretKey.fill(0)
  }
}

export async function claimFees(input: ProofClaimFeesInput): Promise<{ signature: string; amountSol: number }> {
  const backing = getDb().prepare('SELECT * FROM proof_backings WHERE id = ?').get(input.backingId) as ProofBackingRow | undefined
  if (!backing) throw new Error('Backing not found')
  const claimLamports = backingClaimableLamports(backing)
  if (!Number.isSafeInteger(claimLamports) || claimLamports <= 0) throw new Error('No claimable fees')
  if (claimLamports <= BASE_TX_FEE_LAMPORTS) throw new Error('Claimable fees are below the payout floor')
  const claimableSol = lamportsToSol(claimLamports)
  const pendingMarker = `pending:${randomUUID()}`
  const lock = getDb().prepare(`
    UPDATE proof_backings
    SET claimable_fees_lamports = 0,
        claimable_fees_sol = 0,
        last_claim_signature = ?,
        updated_at = ?
    WHERE id = ? AND claimable_fees_lamports = ? AND claimable_fees_lamports > 0
  `).run(pendingMarker, now(), backing.id, claimLamports)
  if (lock.changes !== 1) throw new Error('Fee claim is already in progress or no longer claimable')

  const connection = getConnection()
  const escrow = getEscrowKeypair()
  const intentId = createPayoutIntent({
    poolId: backing.pool_id,
    backingId: backing.id,
    kind: 'fee_claim',
    recipient: backing.backer_wallet,
    lamports: claimLamports,
  })
  try {
    await assertSignerBalance(connection, escrow.publicKey, claimLamports + (BASE_TX_FEE_LAMPORTS * 2), 'Escrow')
    const { signature } = await executeInstructions(
      connection,
      [SystemProgram.transfer({
        fromPubkey: escrow.publicKey,
        toPubkey: new PublicKey(backing.backer_wallet),
        lamports: claimLamports,
      })],
      [escrow],
      { payer: escrow.publicKey },
    )
    getDb().prepare(`
      UPDATE proof_backings
      SET total_claimed_lamports = total_claimed_lamports + ?,
          total_claimed_sol = total_claimed_sol + ?,
          last_claim_signature = ?,
          updated_at = ?
      WHERE id = ?
    `).run(claimLamports, claimableSol, signature, now(), backing.id)
    markPayoutIntent(intentId, 'confirmed', signature)
    appendPoolEvent(backing.pool_id, 'fees_claimed', 'Backer fee claim paid', signature, {
      backer: backing.backer_wallet,
      amountSol: claimableSol,
      amountLamports: claimLamports,
    })
    return { signature, amountSol: claimableSol }
  } catch (err) {
    getDb().prepare(`
      UPDATE proof_backings
      SET claimable_fees_lamports = claimable_fees_lamports + ?,
          claimable_fees_sol = claimable_fees_sol + ?,
          last_claim_signature = NULL,
          updated_at = ?
      WHERE id = ? AND last_claim_signature = ?
    `).run(claimLamports, claimableSol, now(), backing.id, pendingMarker)
    markPayoutIntent(intentId, 'failed', null, err instanceof Error ? err.message : String(err))
    throw err
  } finally {
    escrow.secretKey.fill(0)
  }
}

export function importVanityMint(input: ImportProofVanityMintInput): { id: string; address: string } {
  const keypair = parseSecretKey(input.privateKeyBase58)
  try {
    const address = keypair.publicKey.toBase58()
    if (!address.endsWith('pooL')) throw new Error('Vanity mint must end with pooL')
    const id = randomUUID()
    const keyName = vanityMintKeyName(id)
    storeKeypair(keyName, keypair)
    getDb().prepare(`
      INSERT INTO proof_vanity_mints (id, address, key_name, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, address, keyName, now())
    return { id, address }
  } finally {
    keypair.secretKey.fill(0)
  }
}

export async function pickImage(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Select Proof Pool Token Image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return stageProofImage(result.filePaths[0])
}

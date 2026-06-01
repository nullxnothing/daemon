import crypto from 'node:crypto'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { loadKeypair } from './SolanaService'
import type { AgentWorkTask } from '../shared/types'

const DEFAULT_KEYCARD_API_BASE = 'https://keycardsol.xyz'
const DEFAULT_DAEMON_MINT = '4vpf4qNtNVkvz2dm5qL2mT6jBXH9gDY8qH2QsHN5pump'
const DEFAULT_DAEMON_MIN_AMOUNT = '1000000'
const MAX_CAPSULE_TEXT_CHARS = 80_000

export interface AgentWorkCapsuleMaterial {
  commitHash: string
  diffHash: string
  testsHash: string
  diff: string
  status: string
  testsOutput?: string | null
}

export interface KeycardCapsuleResult {
  gateId: string
  openUrl: string
  adminUrl: string | null
  capsuleHash: string
  artifactUri: string
  createdAt: number
}

type ChallengeResponse = {
  challengeId?: string
  message?: string
  reason?: string
}

type CreateGateResponse = {
  gate?: { id?: string }
  openUrl?: string
  adminUrl?: string
  reason?: string
  error?: string
}

function keycardApiBase(): string {
  return (process.env.KEYCARD_API_BASE?.trim() ||
    process.env.DAEMON_KEYCARD_API_BASE?.trim() ||
    DEFAULT_KEYCARD_API_BASE).replace(/\/+$/, '')
}

function daemonMint(): string {
  return process.env.KEYCARD_DAEMON_MINT?.trim() ||
    process.env.DAEMON_HOLDER_MINT?.trim() ||
    DEFAULT_DAEMON_MINT
}

function daemonMinAmount(): string {
  return process.env.KEYCARD_DAEMON_MIN_AMOUNT?.trim() ||
    process.env.DAEMON_HOLDER_MIN_AMOUNT?.trim() ||
    DEFAULT_DAEMON_MIN_AMOUNT
}

function optionalGetAccessUrl(): string | null {
  const value = process.env.KEYCARD_GET_ACCESS_URL?.trim() || process.env.DAEMON_GET_ACCESS_URL?.trim()
  return value && /^https:\/\//i.test(value) ? value : null
}

function truncateText(value: string, maxChars = MAX_CAPSULE_TEXT_CHARS): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n[truncated:${value.length - maxChars}]`
}

function compactTitle(value: string, maxChars: number): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length <= maxChars ? clean : clean.slice(0, maxChars - 1).trimEnd()
}

function normalizeUrl(value: string | undefined, baseUrl: string): string | null {
  if (!value) return null
  return new URL(value, `${baseUrl}/`).toString()
}

function sha256Hex(bytes: Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]),
  )
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

export function buildAgentWorkCapsule(task: AgentWorkTask, material: AgentWorkCapsuleMaterial, ownerWallet: string) {
  return {
    version: 1,
    type: 'daemon.agent_work.capsule',
    createdAt: new Date().toISOString(),
    gate: {
      type: 'spl-balance',
      mint: daemonMint(),
      minAmount: daemonMinAmount(),
      symbol: 'DAEMON',
    },
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      bountyLamports: task.bounty_lamports,
      deadlineAt: task.deadline_at,
      projectId: task.project_id,
      projectName: task.project_name,
      projectPathHash: task.project_path ? sha256Hex(task.project_path) : null,
      sessionId: task.session_id,
    },
    wallets: {
      owner: ownerWallet,
      agent: task.agent_wallet_address,
      verifier: task.verifier_wallet,
    },
    hashes: {
      repo: task.repo_hash,
      prompt: task.prompt_hash,
      acceptance: task.acceptance_hash,
      commit: material.commitHash,
      diff: material.diffHash,
      tests: material.testsHash,
    },
    registry: {
      onchainTaskId: task.onchain_task_id,
      createSignature: task.create_signature,
      startSignature: task.start_signature,
    },
    evidence: {
      diff: truncateText(material.diff),
      status: truncateText(material.status),
      testsOutput: truncateText(material.testsOutput ?? ''),
    },
  }
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T
  } catch {
    return null
  }
}

async function createAdminChallenge(baseUrl: string, wallet: string): Promise<{ challengeId: string; message: string }> {
  const response = await fetch(`${baseUrl}/v1/challenges`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      purpose: 'admin',
      gateId: 'new',
      wallet,
      action: 'create-gate',
    }),
  })
  const body = await readJson<ChallengeResponse>(response)
  if (!response.ok || !body?.challengeId || !body.message) {
    throw new Error(body?.reason || `KEYCARD challenge failed with HTTP ${response.status}`)
  }
  return { challengeId: body.challengeId, message: body.message }
}

function signAdminMessage(walletId: string, expectedWallet: string, message: string): string {
  const keypair = loadKeypair(walletId)
  try {
    const walletAddress = keypair.publicKey.toBase58()
    if (walletAddress !== expectedWallet) {
      throw new Error('KEYCARD signing wallet does not match the task owner wallet')
    }

    return bs58.encode(nacl.sign.detached(Buffer.from(message, 'utf8'), keypair.secretKey))
  } finally {
    keypair.secretKey.fill(0)
  }
}

function appendText(form: FormData, key: string, value: string | null | undefined) {
  if (value) form.append(key, value)
}

export async function createAgentWorkCapsule(task: AgentWorkTask, material: AgentWorkCapsuleMaterial): Promise<KeycardCapsuleResult> {
  if (!task.wallet_id || !task.wallet_address) {
    throw new Error('KEYCARD capsule requires a task owner wallet')
  }

  const baseUrl = keycardApiBase()
  const challenge = await createAdminChallenge(baseUrl, task.wallet_address)
  const adminSignature = signAdminMessage(task.wallet_id, task.wallet_address, challenge.message)
  const capsule = buildAgentWorkCapsule(task, material, task.wallet_address)
  const capsuleBytes = Buffer.from(canonicalJson(capsule), 'utf8')
  const capsuleHash = sha256Hex(capsuleBytes)

  const form = new FormData()
  form.append('gateType', 'spl')
  form.append('name', compactTitle(`DAEMON Receipt: ${task.title}`, 80))
  form.append('description', 'Private DAEMON work capsule')
  form.append('mint', daemonMint())
  form.append('symbol', 'DAEMON')
  form.append('decimals', '6')
  form.append('minAmount', daemonMinAmount())
  form.append('ownerWallet', task.wallet_address)
  form.append('adminMessage', challenge.message)
  form.append('adminSignature', adminSignature)
  form.append('adminChallengeId', challenge.challengeId)
  appendText(form, 'getAccessUrl', optionalGetAccessUrl())
  form.append(
    'file',
    new Blob([new Uint8Array(capsuleBytes)], { type: 'application/json' }),
    `daemon-capsule-${task.id.slice(0, 8)}.json`,
  )

  const response = await fetch(`${baseUrl}/v1/gates`, { method: 'POST', body: form })
  const body = await readJson<CreateGateResponse>(response)
  const gateId = body?.gate?.id
  if (!response.ok || !gateId) {
    throw new Error(body?.reason || body?.error || `KEYCARD gate creation failed with HTTP ${response.status}`)
  }

  return {
    gateId,
    openUrl: normalizeUrl(body.openUrl, baseUrl) ?? `${baseUrl}/open/${gateId}`,
    adminUrl: normalizeUrl(body.adminUrl, baseUrl),
    capsuleHash,
    artifactUri: `keycard://${gateId}#sha256=${capsuleHash}`,
    createdAt: Date.now(),
  }
}

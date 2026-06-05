import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { Connection, Keypair, PublicKey, type TransactionInstruction, type VersionedTransaction, type Transaction } from '@solana/web3.js'
import type {
  SynapseSapAgent,
  SynapseSapCapability,
  SynapseSapCluster,
  SynapseSapDiscoveryInput,
  SynapseSapDiscoveryResult,
  SynapseSapRegisterInput,
  SynapseSapRegisterResult,
  SynapseSapStatus,
} from '../shared/types'
import { executeInstructions, withKeypair } from './SolanaService'
import { getRpcEndpoint } from './SolanaRuntimeConfigService'
import * as AgentStation from './AgentStationService'

const require = createRequire(import.meta.url)
const { PROGRAM_ID, SapClient } = require('@oobe-protocol-labs/synapse-sap-sdk') as typeof import('@oobe-protocol-labs/synapse-sap-sdk')
const {
  getAgentPDA,
  getAgentStatsPDA,
  getCapabilityIndexPDA,
  getGlobalPDA,
  getProtocolIndexPDA,
} = require('@oobe-protocol-labs/synapse-sap-sdk/pdas') as typeof import('@oobe-protocol-labs/synapse-sap-sdk/pdas')

type SapTransaction = Transaction | VersionedTransaction
type SapClientInstance = InstanceType<typeof SapClient>

interface SapWalletAdapter {
  publicKey: PublicKey
  signTransaction<T extends SapTransaction>(tx: T): Promise<T>
  signAllTransactions<T extends SapTransaction>(txs: T[]): Promise<T[]>
}

interface RawCapability {
  id?: string
  description?: string | null
  protocol_id?: string | null
  protocolId?: string | null
  version?: string | null
}

interface RawAgentAccount {
  wallet?: PublicKey
  name?: string
  description?: string
  agent_id?: string | null
  agentId?: string | null
  agent_uri?: string | null
  agentUri?: string | null
  x402_endpoint?: string | null
  x402Endpoint?: string | null
  is_active?: boolean
  isActive?: boolean
  reputation_score?: number
  reputationScore?: number
  total_calls_served?: unknown
  totalCallsServed?: unknown
  avg_latency_ms?: number
  avgLatencyMs?: number
  uptime_percent?: number
  uptimePercent?: number
  capabilities?: RawCapability[]
  protocols?: string[]
  pricing?: unknown[]
  created_at?: unknown
  createdAt?: unknown
  updated_at?: unknown
  updatedAt?: unknown
}

interface RawIndexAccount {
  agents?: PublicKey[]
}

const DEFAULT_CLUSTER: SynapseSapCluster = 'devnet'
const DEFAULT_DEVNET_RPC = 'https://api.devnet.solana.com'
const DEFAULT_DISCOVERY_LIMIT = 25
const MAX_DISCOVERY_LIMIT = 50
const MAX_REGISTRATION_DIMENSIONS = 8
const REGISTER_COMPUTE_UNIT_LIMIT = 600_000
const DEFAULT_PROTOCOL_ID = 'daemon'
const DEFAULT_CAPABILITY_ID = 'daemon:agent'

function cluster(input?: SynapseSapCluster | null): SynapseSapCluster {
  return input === 'mainnet-beta' ? 'mainnet-beta' : DEFAULT_CLUSTER
}

function rpcUrl(target: SynapseSapCluster): string {
  if (target === 'devnet') return process.env.DAEMON_SYNAPSE_SAP_DEVNET_RPC_URL?.trim() || DEFAULT_DEVNET_RPC
  return process.env.DAEMON_SYNAPSE_SAP_MAINNET_RPC_URL?.trim() || getRpcEndpoint()
}

function connectionFor(target: SynapseSapCluster): Connection {
  return new Connection(rpcUrl(target), 'confirmed')
}

function statusFor(target: SynapseSapCluster): SynapseSapStatus {
  return {
    programId: PROGRAM_ID,
    cluster: target,
    rpcUrl: rpcUrl(target),
    explorerUrl: 'https://explorer.oobeprotocol.ai/',
  }
}

function sapClient(target: SynapseSapCluster, wallet?: SapWalletAdapter): SapClientInstance {
  return new SapClient({ connection: connectionFor(target), wallet: wallet as never })
}

function walletAdapter(keypair: Keypair): SapWalletAdapter {
  return {
    publicKey: keypair.publicKey,
    async signTransaction<T extends SapTransaction>(tx: T): Promise<T> {
      if ('partialSign' in tx) tx.partialSign(keypair)
      else tx.sign([keypair])
      return tx
    },
    async signAllTransactions<T extends SapTransaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) {
        if ('partialSign' in tx) tx.partialSign(keypair)
        else tx.sign([keypair])
      }
      return txs
    },
  }
}

function sha256Bytes(value: string): Uint8Array {
  return new Uint8Array(crypto.createHash('sha256').update(value).digest())
}

function hashArray(value: string): number[] {
  return [...sha256Bytes(value)]
}

function cleanId(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) throw new Error('Capability/protocol id cannot be empty')
  if (trimmed.length > 80) throw new Error('Capability/protocol id is too long')
  if (!/^[a-z0-9:_./-]+$/.test(trimmed)) throw new Error(`Invalid capability/protocol id: ${value}`)
  return trimmed
}

function cleanIds(values: string[] | undefined, fallback: string): string[] {
  const unique = new Set((values ?? []).map(cleanId))
  if (unique.size === 0) unique.add(fallback)
  return [...unique].slice(0, MAX_REGISTRATION_DIMENSIONS)
}

function capabilityFromId(id: string): SynapseSapCapability {
  const [protocolId] = id.split(':')
  return {
    id,
    description: null,
    protocolId: protocolId || DEFAULT_PROTOCOL_ID,
    version: '1.0',
  }
}

function toInstructionCapability(capability: SynapseSapCapability) {
  return {
    id: capability.id,
    description: capability.description,
    protocol_id: capability.protocolId,
    version: capability.version,
  }
}

function optionalUrl(value: string | null | undefined, label: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const parsed = new URL(trimmed)
  if (parsed.protocol !== 'https:') throw new Error(`${label} must use HTTPS`)
  parsed.hash = ''
  return parsed.toString()
}

function limit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_DISCOVERY_LIMIT
  return Math.min(Math.max(1, Math.floor(parsed)), MAX_DISCOVERY_LIMIT)
}

function numberFromBn(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    try {
      const parsed = value.toNumber()
      return Number.isFinite(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

function stringFromBn(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') return value.toString()
  return null
}

function normalizeCapability(input: RawCapability): SynapseSapCapability {
  return {
    id: input.id ?? '',
    description: input.description ?? null,
    protocolId: input.protocol_id ?? input.protocolId ?? null,
    version: input.version ?? null,
  }
}

function normalizeAgent(pda: PublicKey, raw: RawAgentAccount): SynapseSapAgent {
  const wallet = raw.wallet instanceof PublicKey ? raw.wallet.toBase58() : ''
  return {
    pda: pda.toBase58(),
    wallet,
    name: raw.name ?? 'Unnamed SAP agent',
    description: raw.description ?? '',
    agentId: raw.agent_id ?? raw.agentId ?? null,
    agentUri: raw.agent_uri ?? raw.agentUri ?? null,
    x402Endpoint: raw.x402_endpoint ?? raw.x402Endpoint ?? null,
    isActive: raw.is_active ?? raw.isActive ?? false,
    reputationScore: raw.reputation_score ?? raw.reputationScore ?? null,
    totalCallsServed: stringFromBn(raw.total_calls_served ?? raw.totalCallsServed),
    avgLatencyMs: raw.avg_latency_ms ?? raw.avgLatencyMs ?? null,
    uptimePercent: raw.uptime_percent ?? raw.uptimePercent ?? null,
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities.map(normalizeCapability) : [],
    protocols: Array.isArray(raw.protocols) ? raw.protocols : [],
    pricingCount: Array.isArray(raw.pricing) ? raw.pricing.length : 0,
    createdAt: numberFromBn(raw.created_at ?? raw.createdAt),
    updatedAt: numberFromBn(raw.updated_at ?? raw.updatedAt),
  }
}

async function fetchAgentByPda(client: SapClientInstance, pda: PublicKey): Promise<SynapseSapAgent | null> {
  const raw = await client.fetchAccount<RawAgentAccount>('agentAccount', pda)
  return raw ? normalizeAgent(pda, raw) : null
}

async function discover(input: SynapseSapDiscoveryInput, mode: 'capability' | 'protocol'): Promise<SynapseSapDiscoveryResult> {
  const target = cluster(input.cluster)
  const query = cleanId(mode === 'capability' ? input.capabilityId ?? '' : input.protocolId ?? '')
  const client = sapClient(target)
  const [indexPda] = mode === 'capability'
    ? getCapabilityIndexPDA(sha256Bytes(query))
    : getProtocolIndexPDA(sha256Bytes(query))
  const accountName = mode === 'capability' ? 'capabilityIndex' : 'protocolIndex'
  const index = await client.fetchAccount<RawIndexAccount>(accountName, indexPda)
  const agentPdas = (index?.agents ?? []).slice(0, limit(input.limit))
  const agents = (await Promise.all(agentPdas.map((pda) => fetchAgentByPda(client, pda))))
    .filter((agent): agent is SynapseSapAgent => Boolean(agent))
  return {
    cluster: target,
    indexPda: indexPda.toBase58(),
    query,
    total: index?.agents?.length ?? 0,
    agents,
  }
}

async function indexInstructions(params: {
  client: SapClientInstance
  signer: Keypair
  agentPda: PublicKey
  capabilityIds: string[]
  protocolIds: string[]
}): Promise<TransactionInstruction[]> {
  const [globalRegistry] = getGlobalPDA()
  const instructions: TransactionInstruction[] = []

  for (const capabilityId of params.capabilityIds) {
    const hash = sha256Bytes(capabilityId)
    const [capabilityIndex] = getCapabilityIndexPDA(hash)
    const existing = await params.client.fetchAccount<RawIndexAccount>('capabilityIndex', capabilityIndex)
    if (existing?.agents?.some((agent) => agent.equals(params.agentPda))) continue
    instructions.push(existing
      ? await params.client.indexing.addToCapabilityIndex({
        signer: params.signer,
        wallet: params.signer.publicKey,
        agent: params.agentPda,
        capabilityIndex,
        capabilityHash: [...hash],
      })
      : await params.client.indexing.initCapabilityIndex({
        signer: params.signer,
        wallet: params.signer.publicKey,
        agent: params.agentPda,
        capabilityIndex,
        globalRegistry,
        capabilityId,
        capabilityHash: [...hash],
      }))
  }

  for (const protocolId of params.protocolIds) {
    const hash = sha256Bytes(protocolId)
    const [protocolIndex] = getProtocolIndexPDA(hash)
    const existing = await params.client.fetchAccount<RawIndexAccount>('protocolIndex', protocolIndex)
    if (existing?.agents?.some((agent) => agent.equals(params.agentPda))) continue
    instructions.push(existing
      ? await params.client.indexing.addToProtocolIndex({
        signer: params.signer,
        wallet: params.signer.publicKey,
        agent: params.agentPda,
        protocolIndex,
        protocolHash: [...hash],
      })
      : await params.client.indexing.initProtocolIndex({
        signer: params.signer,
        wallet: params.signer.publicKey,
        agent: params.agentPda,
        protocolIndex,
        globalRegistry,
        protocolId,
        protocolHash: [...hash],
      }))
  }

  return instructions
}

function txExplorer(signature: string, target: SynapseSapCluster): string {
  const suffix = target === 'devnet' ? '?cluster=devnet' : ''
  return `https://solscan.io/tx/${signature}${suffix}`
}

export function status(input?: { cluster?: SynapseSapCluster }): SynapseSapStatus {
  return statusFor(cluster(input?.cluster))
}

export async function getAgent(wallet: string, input?: { cluster?: SynapseSapCluster }): Promise<SynapseSapAgent | null> {
  const publicKey = new PublicKey(wallet)
  const target = cluster(input?.cluster)
  const client = sapClient(target)
  const [agentPda] = getAgentPDA(publicKey)
  return fetchAgentByPda(client, agentPda)
}

export async function discoverByCapability(input: SynapseSapDiscoveryInput): Promise<SynapseSapDiscoveryResult> {
  return discover(input, 'capability')
}

export async function discoverByProtocol(input: SynapseSapDiscoveryInput): Promise<SynapseSapDiscoveryResult> {
  return discover(input, 'protocol')
}

export async function registerAgent(input: SynapseSapRegisterInput): Promise<SynapseSapRegisterResult> {
  if (!input.walletId?.trim()) throw new Error('walletId is required')
  if (!input.agentStationId?.trim()) throw new Error('agentStationId is required')

  const config = AgentStation.getConfig(input.agentStationId)
  if (!config) throw new Error('Agent Station config not found')

  const target = cluster(input.cluster)
  const capabilityIds = cleanIds(input.capabilityIds, DEFAULT_CAPABILITY_ID)
  const protocolIds = cleanIds(input.protocolIds, DEFAULT_PROTOCOL_ID)
  const capabilities = capabilityIds.map(capabilityFromId)
  const agentUri = optionalUrl(input.agentUri, 'Agent URI')
  const x402Endpoint = optionalUrl(input.x402Endpoint, 'x402 endpoint')

  return withKeypair(input.walletId, async (keypair) => {
    const client = sapClient(target, walletAdapter(keypair))
    const [agentPda] = getAgentPDA(keypair.publicKey)
    const existing = await fetchAgentByPda(client, agentPda)
    if (existing) throw new Error(`Wallet is already published on SAP: ${agentPda.toBase58()}`)

    const [agentStats] = getAgentStatsPDA(agentPda)
    const [globalRegistry] = getGlobalPDA()
    const registerIx = await client.agent.registerAgent({
      signer: keypair,
      wallet: keypair.publicKey,
      agent: agentPda,
      agentStats,
      globalRegistry,
      name: config.name.slice(0, 80),
      description: (config.description ?? 'DAEMON-created Solana agent').slice(0, 400),
      capabilities: capabilities.map(toInstructionCapability),
      pricing: [],
      protocols: protocolIds,
      agentId: config.id,
      agentUri,
      x402Endpoint,
    })
    const indexes = await indexInstructions({ client, signer: keypair, agentPda, capabilityIds, protocolIds })
    const signature = (await executeInstructions(client.connection, [registerIx, ...indexes], [keypair], {
      payer: keypair.publicKey,
      computeUnitLimit: REGISTER_COMPUTE_UNIT_LIMIT,
      guardSource: 'synapse-sap-register',
      guardAllowProgramIds: [PROGRAM_ID],
    })).signature

    return {
      cluster: target,
      wallet: keypair.publicKey.toBase58(),
      agentPda: agentPda.toBase58(),
      signature,
      explorerUrl: txExplorer(signature, target),
      capabilities: capabilityIds,
      protocols: protocolIds,
    }
  })
}

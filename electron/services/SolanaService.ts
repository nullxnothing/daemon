import { ComputeBudgetProgram, Connection, Keypair, SystemProgram, Transaction, TransactionMessage, VersionedTransaction, type SendOptions, type TransactionInstruction, type PublicKey } from '@solana/web3.js'
import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'
import { getWalletInfrastructureSettings } from './SettingsService'
import { LogService } from './LogService'
import bs58 from 'bs58'
import fs from 'node:fs'

/**
 * Shared Solana utilities used by WalletService and PumpFunService.
 * Centralizes RPC connection creation and keypair lifecycle management.
 */

const PUBLIC_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com'
const DEFAULT_COMPUTE_UNIT_LIMIT = 200_000
const DEFAULT_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 100_000
const PRIORITY_FEE_CACHE_MS = 30_000
const COMPUTE_BUDGET_SET_UNIT_LIMIT = 2
const COMPUTE_BUDGET_SET_UNIT_PRICE = 3

interface BlockheightConfirmationStrategy {
  blockhash: string
  lastValidBlockHeight: number
}

let publicRpcFallbackWarned = false
let priorityFeeCache: { endpoint: string; value: number; expiresAt: number } | null = null

export function getHeliusApiKey(): string | null {
  return SecureKey.getKey('HELIUS_API_KEY') ?? process.env.HELIUS_API_KEY ?? null
}

export function getJupiterApiKey(): string | null {
  return SecureKey.getKey('JUPITER_API_KEY') ?? process.env.JUPITER_API_KEY ?? null
}

export function getRpcEndpoint(): string {
  const settings = getWalletInfrastructureSettings()
  if (settings.rpcProvider === 'quicknode') {
    if (settings.quicknodeRpcUrl) return settings.quicknodeRpcUrl
    warnPublicRpcFallback('QuickNode RPC is selected but no QuickNode endpoint is configured.')
  }
  if (settings.rpcProvider === 'custom') {
    if (settings.customRpcUrl) return settings.customRpcUrl
    warnPublicRpcFallback('Custom RPC is selected but no custom endpoint is configured.')
  }

  if (settings.rpcProvider === 'helius') {
    const key = getHeliusApiKey()
    if (key) return `https://mainnet.helius-rpc.com/?api-key=${key}`
    warnPublicRpcFallback('Helius RPC is selected but HELIUS_API_KEY is not configured.')
  }

  if (settings.rpcProvider === 'public') {
    warnPublicRpcFallback('Public Solana RPC is selected.')
  }

  return PUBLIC_RPC_ENDPOINT
}

export function getConnection(): Connection {
  return new Connection(getRpcEndpoint(), 'confirmed')
}

export function getConnectionStrict(): Connection {
  const key = getHeliusApiKey()
  if (!key) throw new Error('HELIUS_API_KEY not configured. Add it in Wallet settings.')
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${key}`, 'confirmed')
}

export function getTransactionSubmissionSettings() {
  const settings = getWalletInfrastructureSettings()
  return {
    mode: settings.executionMode,
    jitoBlockEngineUrl: settings.jitoBlockEngineUrl,
  }
}

export type TransactionTransport = ReturnType<typeof getTransactionSubmissionSettings>['mode'] | 'jupiter'

export interface TransactionExecutionResult {
  signature: string
  transport: TransactionTransport
}

function warnPublicRpcFallback(reason: string): void {
  if (publicRpcFallbackWarned) return
  publicRpcFallbackWarned = true
  const message = 'Using public Solana mainnet RPC fallback. Public RPC is aggressively rate limited; configure Helius, QuickNode, or a custom RPC for wallet execution.'
  LogService.warn('SolanaService', message, { reason, endpoint: PUBLIC_RPC_ENDPOINT })
}

function getComputeBudgetOpcode(ix: TransactionInstruction): number | null {
  if (!ix.programId.equals(ComputeBudgetProgram.programId)) return null
  return ix.data[0] ?? null
}

function getDefaultComputeUnitLimit(instructions: TransactionInstruction[]): number {
  const nonBudgetInstructions = instructions.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId))
  if (
    nonBudgetInstructions.length === 1
    && nonBudgetInstructions[0].programId.equals(SystemProgram.programId)
  ) {
    return 20_000
  }
  if (nonBudgetInstructions.length <= 2) return 120_000
  return Math.min(1_000_000, Math.max(DEFAULT_COMPUTE_UNIT_LIMIT, nonBudgetInstructions.length * 80_000))
}

export async function getPriorityFeeMicroLamports(connection: Connection): Promise<number> {
  const now = Date.now()
  if (priorityFeeCache?.endpoint === connection.rpcEndpoint && priorityFeeCache.expiresAt > now) {
    return priorityFeeCache.value
  }

  let value = DEFAULT_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS
  try {
    const response = await fetch(connection.rpcEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getPriorityFeeEstimate',
        params: [{
          accountKeys: [SystemProgram.programId.toBase58()],
          options: { priorityLevel: 'High' },
        }],
      }),
    })
    const data = await response.json().catch(() => null) as { result?: { priorityFeeEstimate?: number } } | null
    const estimate = data?.result?.priorityFeeEstimate
    if (typeof estimate === 'number' && Number.isFinite(estimate) && estimate > 0) {
      value = Math.max(estimate, 10_000)
    }
  } catch {
    try {
      const recentFees = await connection.getRecentPrioritizationFees()
      const fees = recentFees
        .map((entry) => entry.prioritizationFee)
        .filter((fee) => Number.isFinite(fee) && fee > 0)
        .sort((a, b) => a - b)
      if (fees.length > 0) {
        value = Math.max(fees[Math.floor(fees.length * 0.75)], 10_000)
      }
    } catch {
      value = DEFAULT_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS
    }
  }

  priorityFeeCache = {
    endpoint: connection.rpcEndpoint,
    value,
    expiresAt: now + PRIORITY_FEE_CACHE_MS,
  }
  return value
}

export async function getPriorityFeeLamports(connection: Connection, computeUnitLimit = DEFAULT_COMPUTE_UNIT_LIMIT): Promise<number> {
  const microLamports = await getPriorityFeeMicroLamports(connection)
  return Math.ceil((computeUnitLimit * microLamports) / 1_000_000)
}

async function withComputeBudgetInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  options?: {
    addComputeBudget?: boolean
    computeUnitLimit?: number
    computeUnitPriceMicroLamports?: number
  },
): Promise<TransactionInstruction[]> {
  if (options?.addComputeBudget === false) return instructions

  const hasUnitLimit = instructions.some((ix) => getComputeBudgetOpcode(ix) === COMPUTE_BUDGET_SET_UNIT_LIMIT)
  const hasUnitPrice = instructions.some((ix) => getComputeBudgetOpcode(ix) === COMPUTE_BUDGET_SET_UNIT_PRICE)
  if (hasUnitLimit && hasUnitPrice) return instructions

  const budgetInstructions: TransactionInstruction[] = []
  if (!hasUnitLimit) {
    budgetInstructions.push(ComputeBudgetProgram.setComputeUnitLimit({
      units: options?.computeUnitLimit ?? getDefaultComputeUnitLimit(instructions),
    }))
  }
  if (!hasUnitPrice) {
    budgetInstructions.push(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: options?.computeUnitPriceMicroLamports ?? await getPriorityFeeMicroLamports(connection),
    }))
  }

  return [...budgetInstructions, ...instructions]
}

export async function submitRawTransaction(
  connection: Connection,
  rawTx: Buffer | Uint8Array,
  options?: SendOptions,
): Promise<string> {
  const submission = getTransactionSubmissionSettings()
  if (submission.mode !== 'jito') {
    return connection.sendRawTransaction(rawTx, options)
  }

  const response = await fetch(submission.jitoBlockEngineUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        Buffer.from(rawTx).toString('base64'),
        {
          encoding: 'base64',
        },
      ],
    }),
  })

  const payload = await response.json().catch(() => null) as { error?: { message?: string }; result?: string } | null
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Jito submission failed (${response.status})`)
  }
  if (!payload?.result) {
    throw new Error(payload?.error?.message || 'Jito submission failed')
  }
  return payload.result
}

export async function confirmSignature(
  connection: Connection,
  signature: string,
  timeoutMs = 60_000,
  confirmationStrategy?: BlockheightConfirmationStrategy,
): Promise<void> {
  const strategy = confirmationStrategy ?? await connection.getLatestBlockhash('confirmed')
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Transaction confirmation timed out (${Math.round(timeoutMs / 1000)}s). It may still confirm - check Solscan.`)), timeoutMs)
  })

  try {
    const result = await Promise.race([
      connection.confirmTransaction({ signature, ...strategy }, 'confirmed'),
      timeoutPromise,
    ])
    if (result.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`)
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function executeTransaction(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  signers: Keypair[],
  options?: {
    timeoutMs?: number
    feePayer?: PublicKey
    sendOptions?: SendOptions
    addComputeBudget?: boolean
    computeUnitLimit?: number
    computeUnitPriceMicroLamports?: number
    confirmationStrategy?: BlockheightConfirmationStrategy
  },
): Promise<TransactionExecutionResult> {
  const { mode } = getTransactionSubmissionSettings()
  let confirmationStrategy = options?.confirmationStrategy

  if (transaction instanceof Transaction) {
    const latest = await connection.getLatestBlockhash('confirmed')
    transaction.instructions = await withComputeBudgetInstructions(connection, transaction.instructions, options)
    transaction.feePayer = options?.feePayer ?? transaction.feePayer ?? signers[0]?.publicKey
    transaction.recentBlockhash = latest.blockhash
    confirmationStrategy = latest
    if (signers.length > 0) {
      transaction.sign(...signers)
    }
  } else if (signers.length > 0) {
    const latest = await connection.getLatestBlockhash('confirmed')
    confirmationStrategy ??= {
      blockhash: transaction.message.recentBlockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }
    transaction.sign(signers)
  } else {
    const latest = await connection.getLatestBlockhash('confirmed')
    confirmationStrategy ??= {
      blockhash: transaction.message.recentBlockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    }
  }

  const signature = await submitRawTransaction(connection, transaction.serialize(), {
    skipPreflight: mode === 'jito',
    maxRetries: mode === 'jito' ? 0 : 3,
    ...options?.sendOptions,
  })
  await confirmSignature(connection, signature, options?.timeoutMs, confirmationStrategy)

  return {
    signature,
    transport: mode,
  }
}

export async function executeInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  options?: {
    timeoutMs?: number
    payer?: PublicKey
    addComputeBudget?: boolean
    computeUnitLimit?: number
    computeUnitPriceMicroLamports?: number
  },
): Promise<TransactionExecutionResult> {
  if (instructions.length === 0) {
    throw new Error('Cannot execute an empty instruction set')
  }

  const payer = options?.payer ?? signers[0]?.publicKey
  if (!payer) {
    throw new Error('A fee payer is required to execute instructions')
  }

  const latest = await connection.getLatestBlockhash('confirmed')
  const budgetedInstructions = await withComputeBudgetInstructions(connection, instructions, options)
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: latest.blockhash,
    instructions: budgetedInstructions,
  }).compileToV0Message()

  return executeTransaction(connection, new VersionedTransaction(message), signers, {
    timeoutMs: options?.timeoutMs,
    feePayer: payer,
    addComputeBudget: false,
    confirmationStrategy: latest,
  })
}

export function loadKeypair(walletId: string): Keypair {
  const encrypted = SecureKey.getKey(`WALLET_KEYPAIR_${walletId}`)
  if (encrypted) return Keypair.fromSecretKey(bs58.decode(encrypted))

  const db = getDb()
  const row = db.prepare('SELECT address, keypair_path FROM wallets WHERE id = ?').get(walletId) as { address: string; keypair_path: string | null } | undefined
  if (!row) throw new Error('Wallet not found')

  if (row.keypair_path && fs.existsSync(row.keypair_path)) {
    const raw = fs.readFileSync(row.keypair_path, 'utf-8')
    const parsed = JSON.parse(raw)
    return Keypair.fromSecretKey(Uint8Array.from(parsed))
  }

  throw new Error('No keypair found for this wallet. It may be a watch-only wallet.')
}

export async function withKeypair<T>(walletId: string, fn: (kp: Keypair) => Promise<T>): Promise<T> {
  const kp = loadKeypair(walletId)
  try {
    return await fn(kp)
  } finally {
    kp.secretKey.fill(0)
  }
}

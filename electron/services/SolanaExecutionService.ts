import { ComputeBudgetProgram, Connection, Keypair, SystemProgram, Transaction, TransactionMessage, VersionedTransaction, type PublicKey, type SendOptions, type TransactionInstruction } from '@solana/web3.js'
import * as Voight from './VoightService'
import { assertTransactionAllowed } from './SignerGuardService'
import { getTransactionSubmissionSettings, resolveSolanaRuntimeConfig, type SolanaCluster, type SolanaRpcProvider } from './SolanaRuntimeConfigService'

export type SolanaExecutionStatus = 'success' | 'failed' | 'submitted' | 'blocked'
export type SolanaExecutionStage = 'prepare' | 'preview' | 'guard' | 'sign' | 'submit' | 'confirm' | 'record'
export type SolanaExecutionTransport = 'rpc' | 'jito' | 'jupiter-managed' | 'sdk-adapter' | 'external-wallet'
export type SolanaSignerRoute = 'local-keypair' | 'external-wallet' | 'watch-only' | 'none'
export type SolanaReceiptProvider = 'helius' | 'quicknode' | 'custom' | 'public' | 'localnet'

export interface SolanaExecutionReceipt {
  status: SolanaExecutionStatus
  stage: SolanaExecutionStage
  signature?: string
  transport: SolanaExecutionTransport
  cluster: SolanaCluster
  slot?: number
  explorerUrl?: string
  elapsedMs?: number
  feeLamports?: number
  computeUnits?: number
  provider?: SolanaReceiptProvider
  signerRoute: SolanaSignerRoute
  warnings: string[]
  failureReason?: string
  cause?: string
}

export type TransactionTransport = ReturnType<typeof getTransactionSubmissionSettings>['mode'] | 'jupiter'

export interface TransactionExecutionResult {
  signature: string
  transport: TransactionTransport
}

interface BlockheightConfirmationStrategy {
  blockhash: string
  lastValidBlockHeight: number
}

export interface ExecuteTransactionOptions {
  timeoutMs?: number
  feePayer?: PublicKey
  sendOptions?: SendOptions
  addComputeBudget?: boolean
  computeUnitLimit?: number
  computeUnitPriceMicroLamports?: number
  confirmationStrategy?: BlockheightConfirmationStrategy
  approvalHash?: string
  guardSource?: string
  guardAllowProgramIds?: string[]
}

export interface ExecuteInstructionsOptions {
  timeoutMs?: number
  payer?: PublicKey
  addComputeBudget?: boolean
  computeUnitLimit?: number
  computeUnitPriceMicroLamports?: number
  approvalHash?: string
  guardSource?: string
  guardAllowProgramIds?: string[]
}

const DEFAULT_COMPUTE_UNIT_LIMIT = 200_000
const DEFAULT_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 100_000
const PRIORITY_FEE_CACHE_MS = 30_000
const COMPUTE_BUDGET_SET_UNIT_LIMIT = 2
const COMPUTE_BUDGET_SET_UNIT_PRICE = 3

let priorityFeeCache: { endpoint: string; value: number; expiresAt: number } | null = null

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
  options?: ExecuteTransactionOptions | ExecuteInstructionsOptions,
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

export async function executeTransactionWithReceipt(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  signers: Keypair[],
  options?: ExecuteTransactionOptions,
): Promise<SolanaExecutionReceipt> {
  const runtime = resolveSolanaRuntimeConfig()
  const { mode } = getTransactionSubmissionSettings()
  const transport = mode === 'jito' ? 'jito' : 'rpc'
  const startedAt = Date.now()
  const signerRoute = getSignerRoute(signers)
  const warnings = runtime.warnings.map((warning) => warning.message)
  const guardOptions = {
    approvalHash: options?.approvalHash,
    source: options?.guardSource,
    allowProgramIds: options?.guardAllowProgramIds,
  }
  let stage: SolanaExecutionStage = 'prepare'
  let signature: string | undefined
  let confirmationStrategy = options?.confirmationStrategy

  try {
    if (transaction instanceof Transaction) {
      const latest = await connection.getLatestBlockhash('confirmed')
      transaction.instructions = await withComputeBudgetInstructions(connection, transaction.instructions, options)
      transaction.feePayer = options?.feePayer ?? transaction.feePayer ?? signers[0]?.publicKey
      transaction.recentBlockhash = latest.blockhash
      confirmationStrategy = latest
      if (signers.length > 0) {
        stage = 'guard'
        assertTransactionAllowed(transaction, signers, guardOptions)
        stage = 'sign'
        transaction.sign(...signers)
      }
    } else {
      const latest = await connection.getLatestBlockhash('confirmed')
      confirmationStrategy ??= {
        blockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      }
      if (signers.length > 0) {
        stage = 'guard'
        assertTransactionAllowed(transaction, signers, guardOptions)
        stage = 'sign'
        transaction.sign(signers)
      }
    }

    stage = 'submit'
    signature = await submitRawTransaction(connection, transaction.serialize(), {
      skipPreflight: mode === 'jito',
      maxRetries: mode === 'jito' ? 0 : 3,
      ...options?.sendOptions,
    })

    stage = 'confirm'
    await confirmSignature(connection, signature, options?.timeoutMs, confirmationStrategy)

    stage = 'record'
    const receipt = makeReceipt({
      status: 'success',
      stage,
      signature,
      transport,
      cluster: runtime.cluster,
      rpcProvider: runtime.rpcProvider,
      signerRoute,
      warnings,
      startedAt,
    })
    Voight.emitEventSafe({
      agentId: 'daemon-solana',
      type: 'tx',
      transaction: signature,
      outcome: 'success',
      metadata: {
        sessionId: `solana:${signature}`,
        transport,
        signers: signers.length,
      },
    })
    return receipt
  } catch (err) {
    const receipt = makeReceipt({
      status: getFailureStatus(stage, signature),
      stage,
      signature,
      transport,
      cluster: runtime.cluster,
      rpcProvider: runtime.rpcProvider,
      signerRoute,
      warnings,
      startedAt,
      failureReason: getErrorMessage(err),
      cause: err instanceof Error ? err.name : typeof err,
    })
    Voight.trackError('daemon-solana', err, {
      sessionId: signature ? `solana:${signature}` : `solana:${Date.now()}`,
      transaction: signature,
      transport,
      signers: signers.length,
      stage,
      status: receipt.status,
    })
    return receipt
  }
}

export async function executeTransaction(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  signers: Keypair[],
  options?: ExecuteTransactionOptions,
): Promise<TransactionExecutionResult> {
  const receipt = await executeTransactionWithReceipt(connection, transaction, signers, options)
  const signature = requireSuccessfulSignature(receipt)
  return {
    signature,
    transport: toLegacyTransport(receipt.transport),
  }
}

export async function executeInstructionsWithReceipt(
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  options?: ExecuteInstructionsOptions,
): Promise<SolanaExecutionReceipt> {
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

  return executeTransactionWithReceipt(connection, new VersionedTransaction(message), signers, {
    timeoutMs: options?.timeoutMs,
    feePayer: payer,
    addComputeBudget: false,
    confirmationStrategy: latest,
    approvalHash: options?.approvalHash,
    guardSource: options?.guardSource,
    guardAllowProgramIds: options?.guardAllowProgramIds,
  })
}

export async function executeInstructions(
  connection: Connection,
  instructions: TransactionInstruction[],
  signers: Keypair[],
  options?: ExecuteInstructionsOptions,
): Promise<TransactionExecutionResult> {
  const receipt = await executeInstructionsWithReceipt(connection, instructions, signers, options)
  const signature = requireSuccessfulSignature(receipt)
  return {
    signature,
    transport: toLegacyTransport(receipt.transport),
  }
}

export function requireSuccessfulSignature(receipt: SolanaExecutionReceipt): string {
  if (receipt.status !== 'success' || !receipt.signature) {
    throw new Error(receipt.failureReason ?? 'Solana execution failed')
  }
  return receipt.signature
}

function getFailureStatus(stage: SolanaExecutionStage, signature?: string): SolanaExecutionStatus {
  if (stage === 'guard') return 'blocked'
  if (stage === 'confirm' && signature) return 'submitted'
  return 'failed'
}

function getSignerRoute(signers: Keypair[]): SolanaSignerRoute {
  return signers.length > 0 ? 'local-keypair' : 'none'
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function getReceiptProvider(cluster: SolanaCluster, rpcProvider: SolanaRpcProvider): SolanaReceiptProvider {
  return cluster === 'localnet' ? 'localnet' : rpcProvider
}

function getExplorerUrl(signature: string, cluster: SolanaCluster): string | undefined {
  if (cluster === 'localnet') return undefined
  const clusterParam = cluster === 'mainnet-beta' ? '' : '?cluster=devnet'
  return `https://solscan.io/tx/${signature}${clusterParam}`
}

function toLegacyTransport(transport: SolanaExecutionTransport): TransactionTransport {
  if (transport === 'jito') return 'jito'
  if (transport === 'jupiter-managed') return 'jupiter'
  return 'rpc'
}

function makeReceipt(input: {
  status: SolanaExecutionStatus
  stage: SolanaExecutionStage
  signature?: string
  transport: SolanaExecutionTransport
  cluster: SolanaCluster
  rpcProvider: SolanaRpcProvider
  signerRoute: SolanaSignerRoute
  warnings: string[]
  startedAt: number
  failureReason?: string
  cause?: string
}): SolanaExecutionReceipt {
  return {
    status: input.status,
    stage: input.stage,
    signature: input.signature,
    transport: input.transport,
    cluster: input.cluster,
    explorerUrl: input.signature ? getExplorerUrl(input.signature, input.cluster) : undefined,
    elapsedMs: Date.now() - input.startedAt,
    provider: getReceiptProvider(input.cluster, input.rpcProvider),
    signerRoute: input.signerRoute,
    warnings: input.warnings,
    failureReason: input.failureReason,
    cause: input.cause,
  }
}

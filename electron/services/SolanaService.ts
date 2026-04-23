import { Connection, Keypair, Transaction, TransactionMessage, VersionedTransaction, type SendOptions, type TransactionInstruction, type PublicKey } from '@solana/web3.js'
import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'
import { getWalletInfrastructureSettings } from './SettingsService'
import bs58 from 'bs58'
import fs from 'node:fs'

/**
 * Shared Solana utilities used by WalletService and PumpFunService.
 * Centralizes RPC connection creation and keypair lifecycle management.
 */

export function getHeliusApiKey(): string | null {
  return SecureKey.getKey('HELIUS_API_KEY') ?? process.env.HELIUS_API_KEY ?? null
}

export function getJupiterApiKey(): string | null {
  return SecureKey.getKey('JUPITER_API_KEY') ?? process.env.JUPITER_API_KEY ?? null
}

export function getRpcEndpoint(): string {
  const settings = getWalletInfrastructureSettings()
  if (settings.rpcProvider === 'quicknode' && settings.quicknodeRpcUrl) {
    return settings.quicknodeRpcUrl
  }
  if (settings.rpcProvider === 'custom' && settings.customRpcUrl) {
    return settings.customRpcUrl
  }

  if (settings.rpcProvider === 'helius') {
    const key = getHeliusApiKey()
    if (key) return `https://mainnet.helius-rpc.com/?api-key=${key}`
  }

  return 'https://api.mainnet-beta.solana.com'
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

export type TransactionTransport = ReturnType<typeof getTransactionSubmissionSettings>['mode']

export interface TransactionExecutionResult {
  signature: string
  transport: TransactionTransport
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

export async function confirmSignature(connection: Connection, signature: string, timeoutMs = 60_000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Transaction confirmation timed out (60s). It may still confirm — check Solscan.')), timeoutMs)
  })

  try {
    await Promise.race([
      connection.confirmTransaction(signature, 'confirmed'),
      timeoutPromise,
    ])
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
  },
): Promise<TransactionExecutionResult> {
  const { mode } = getTransactionSubmissionSettings()

  if (transaction instanceof Transaction) {
    const latest = await connection.getLatestBlockhash('confirmed')
    transaction.feePayer = options?.feePayer ?? transaction.feePayer ?? signers[0]?.publicKey
    transaction.recentBlockhash = latest.blockhash
    if (signers.length > 0) {
      transaction.sign(...signers)
    }
  } else if (signers.length > 0) {
    transaction.sign(signers)
  }

  const signature = await submitRawTransaction(connection, transaction.serialize(), {
    skipPreflight: mode === 'jito',
    maxRetries: mode === 'jito' ? 0 : 3,
    ...options?.sendOptions,
  })
  await confirmSignature(connection, signature, options?.timeoutMs)

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
  },
): Promise<TransactionExecutionResult> {
  if (instructions.length === 0) {
    throw new Error('Cannot execute an empty instruction set')
  }

  const payer = options?.payer ?? signers[0]?.publicKey
  if (!payer) {
    throw new Error('A fee payer is required to execute instructions')
  }

  const { blockhash } = await connection.getLatestBlockhash('confirmed')
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message()

  return executeTransaction(connection, new VersionedTransaction(message), signers, {
    timeoutMs: options?.timeoutMs,
    feePayer: payer,
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

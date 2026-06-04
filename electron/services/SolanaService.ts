import { Keypair } from '@solana/web3.js'
import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'
import bs58 from 'bs58'
import fs from 'node:fs'

/**
 * Shared Solana utilities used by WalletService and PumpFunService.
 * Runtime resolution and execution orchestration live in dedicated services.
 */

export {
  getConnection,
  getConnectionStrict,
  getHeliusApiKey,
  getJupiterApiKey,
  getRpcEndpoint,
  getTransactionSubmissionSettings,
  resolveSolanaRuntimeConfig,
} from './SolanaRuntimeConfigService'

export {
  confirmSignature,
  executeInstructions,
  executeInstructionsWithReceipt,
  executeTransaction,
  executeTransactionWithReceipt,
  getPriorityFeeLamports,
  getPriorityFeeMicroLamports,
  requireSuccessfulSignature,
  submitRawTransaction,
  type SolanaExecutionReceipt,
  type SolanaExecutionStage,
  type SolanaExecutionStatus,
  type SolanaExecutionTransport,
  type SolanaSignerRoute,
  type TransactionExecutionResult,
  type TransactionTransport,
} from './SolanaExecutionService'

export function loadKeypair(walletId: string): Keypair {
  const db = getDb()
  const row = db.prepare('SELECT address, keypair_path FROM wallets WHERE id = ?').get(walletId) as { address: string; keypair_path: string | null } | undefined
  if (!row) throw new Error('Wallet not found')

  const encrypted = SecureKey.getKey(`WALLET_KEYPAIR_${walletId}`)
  if (encrypted) {
    return assertKeypairMatchesWallet(Keypair.fromSecretKey(bs58.decode(encrypted)), row.address)
  }

  if (row.keypair_path && fs.existsSync(row.keypair_path)) {
    const raw = fs.readFileSync(row.keypair_path, 'utf-8')
    const parsed = JSON.parse(raw)
    return assertKeypairMatchesWallet(Keypair.fromSecretKey(Uint8Array.from(parsed)), row.address)
  }

  throw new Error('No keypair found for this wallet. It may be a watch-only wallet.')
}

function assertKeypairMatchesWallet(keypair: Keypair, expectedAddress: string): Keypair {
  if (keypair.publicKey.toBase58() !== expectedAddress) {
    keypair.secretKey.fill(0)
    throw new Error('Wallet keypair does not match wallet address')
  }
  return keypair
}

export async function withKeypair<T>(walletId: string, fn: (kp: Keypair) => Promise<T>): Promise<T> {
  const kp = loadKeypair(walletId)
  try {
    return await fn(kp)
  } finally {
    kp.secretKey.fill(0)
  }
}

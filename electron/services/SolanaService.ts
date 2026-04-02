import { Connection, Keypair } from '@solana/web3.js'
import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'
import bs58 from 'bs58'
import fs from 'node:fs'

/**
 * Shared Solana utilities used by WalletService and PumpFunService.
 * Centralizes RPC connection creation and keypair lifecycle management.
 */

export function getConnection(): Connection {
  const key = SecureKey.getKey('HELIUS_API_KEY')
  if (key) {
    return new Connection(`https://mainnet.helius-rpc.com/?api-key=${key}`, 'confirmed')
  }
  return new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
}

export function getConnectionStrict(): Connection {
  const key = SecureKey.getKey('HELIUS_API_KEY')
  if (!key) throw new Error('HELIUS_API_KEY not configured. Add it in Wallet settings.')
  return new Connection(`https://mainnet.helius-rpc.com/?api-key=${key}`, 'confirmed')
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

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import * as SecureKey from '../SecureKeyService'
import {
  getPublicRpcEndpoint,
  getHeliusApiKey,
  getHeliusRpcEndpoint,
  type SolanaCluster,
} from '../SolanaRuntimeConfigService'

/**
 * The on-chain leg of a receipt: a single SPL Memo instruction carrying the
 * content hash. This is the spike's "always available" anchor path — zero
 * account bootstrap, one signature-fee cost, and it never moves funds beyond
 * the network fee of the memo tx itself.
 *
 * The signer is a DEDICATED receipt key (never the trading vault / wallet
 * keypairs). If no receipt key is provisioned, emission is a no-op — a fresh
 * install never signs anything until the operator opts in and provisions one.
 */

// Well-known SPL Memo program. No dependency needed — the instruction is a
// single UTF-8 data buffer with the memo program as its only key.
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

/** SecureKey name for the receipt signer. Prefixed so it is treated as a private key. */
export const RECEIPT_SIGNER_KEY_NAME = 'WALLET_KEYPAIR_RECEIPT_SIGNER'

export interface AnchorResult {
  signature: string
  signer: string
}

export interface ReceiptChain {
  /** Whether a receipt signer key is provisioned (emission is a no-op without one). */
  hasSigner(): boolean
  /** Send the memo-anchored hash on the given cluster. Resolves to the signature. */
  anchorMemo(memo: string, cluster: string): Promise<AnchorResult>
}

function loadReceiptSigner(): Keypair | null {
  const secret = SecureKey.getKey(RECEIPT_SIGNER_KEY_NAME)
  if (!secret) return null
  return Keypair.fromSecretKey(bs58.decode(secret.trim()))
}

function devnetConnection(cluster: SolanaCluster): Connection {
  // Prefer Helius when configured; fall back to the public devnet endpoint.
  const heliusKey = getHeliusApiKey()
  const endpoint = heliusKey
    ? getHeliusRpcEndpoint(cluster, heliusKey)
    : getPublicRpcEndpoint(cluster)
  return new Connection(endpoint, 'confirmed')
}

/** The default, real chain implementation. Tests inject a mock instead. */
export const defaultReceiptChain: ReceiptChain = {
  hasSigner(): boolean {
    try {
      return SecureKey.getKey(RECEIPT_SIGNER_KEY_NAME) != null
    } catch {
      return false
    }
  },
  async anchorMemo(memo: string, cluster: string): Promise<AnchorResult> {
    const signer = loadReceiptSigner()
    if (!signer) throw new Error('No receipt signer provisioned')
    const connection = devnetConnection(cluster as SolanaCluster)
    const ix = new TransactionInstruction({
      keys: [{ pubkey: signer.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, 'utf8'),
    })
    const tx = new Transaction().add(ix)
    const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: 'confirmed',
    })
    return { signature, signer: signer.publicKey.toBase58() }
  },
}

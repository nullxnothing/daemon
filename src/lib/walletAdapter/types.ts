import type { Transaction, VersionedTransaction } from '@solana/web3.js'

export type WalletAdapterSupportedCluster = Exclude<WalletInfrastructureSettings['cluster'], 'localnet'>
export type WalletAdapterTransaction = Transaction | VersionedTransaction
export type WalletAdapterStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error'

// Solflare is the launch partner and gets featured placement plus perk
// attribution; other providers default to 'standard'.
export type WalletPerkTier = 'partner' | 'standard'

export interface WalletAdapterState {
  provider: string | null
  status: WalletAdapterStatus
  network: WalletAdapterSupportedCluster | null
  publicKey: string | null
  error: string | null
  lastSignature: string | null
}

export interface WalletAdapterMessageSignature {
  publicKey: string
  signature: string
  signatureBytes: number[]
}

export interface WalletAdapterSignedTransaction {
  publicKey: string
  signedTransactionBase64: string
}

/**
 * A concrete wallet behind the Daemon Wallet Adapter. Shaped to the Wallet
 * Standard feature set (connect / disconnect / signTransaction / signMessage)
 * but registered manually: the Electron renderer runs sandboxed with no
 * injected extensions, so Wallet Standard's `getWallets()` discovery is always
 * empty and providers must be wired in by hand.
 */
export interface DaemonWalletProvider {
  readonly id: string
  readonly name: string
  readonly icon: string
  readonly subtitle: string
  readonly isHighlighted: boolean
  readonly perkTier: WalletPerkTier
  /** True when the provider can actually be used in the current environment. */
  isAvailable(cluster: WalletInfrastructureSettings['cluster']): boolean
  connect(cluster: WalletInfrastructureSettings['cluster']): Promise<WalletAdapterState>
  disconnect(): Promise<WalletAdapterState>
  signMessage(message: string): Promise<WalletAdapterMessageSignature>
  signSerializedTransaction(transactionBase64: string): Promise<WalletAdapterSignedTransaction>
}

export type WalletAdapterListener = (state: WalletAdapterState) => void

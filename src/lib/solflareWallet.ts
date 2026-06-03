import type Solflare from '@solflare-wallet/sdk'
import { Transaction, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { base64ToBytes, bytesToBase64, deserializeTransaction } from './walletAdapter/serialization'

export type SolflareSupportedCluster = Exclude<WalletInfrastructureSettings['cluster'], 'localnet'>
export type SolflareTransaction = Transaction | VersionedTransaction
export type SolflareConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error'

export interface SolflareConnectionState {
  status: SolflareConnectionStatus
  network: SolflareSupportedCluster | null
  publicKey: string | null
  error: string | null
  lastSignature: string | null
}

export interface SolflareMessageSignature {
  publicKey: string
  signature: string
  signatureBytes: number[]
}

export interface SolflareSignedTransaction {
  publicKey: string
  signedTransactionBase64: string
}

type SolflareCtor = typeof import('@solflare-wallet/sdk').default
type SolflareListener = (state: SolflareConnectionState) => void

let SolflareClass: SolflareCtor | null = null
let wallet: Solflare | null = null
let walletNetwork: SolflareSupportedCluster | null = null

const listeners = new Set<SolflareListener>()
let state: SolflareConnectionState = {
  status: 'idle',
  network: null,
  publicKey: null,
  error: null,
  lastSignature: null,
}

export function getSolflareNetwork(cluster: WalletInfrastructureSettings['cluster']): SolflareSupportedCluster | null {
  return cluster === 'localnet' ? null : cluster
}

export function getSolflareState(): SolflareConnectionState {
  return state
}

export function subscribeSolflareWallet(listener: SolflareListener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

export async function connectSolflareWallet(cluster: WalletInfrastructureSettings['cluster']): Promise<SolflareConnectionState> {
  const network = getSolflareNetwork(cluster)
  if (!network) {
    const message = 'Solflare external signing supports devnet and mainnet-beta, not localnet.'
    setState({ status: 'error', network: null, publicKey: null, error: message, lastSignature: null })
    throw new Error(message)
  }

  setState({ ...state, status: 'connecting', network, error: null })

  try {
    const activeWallet = await getWallet(network)
    await activeWallet.connect()
    const publicKey = activeWallet.publicKey?.toBase58() ?? null
    if (!publicKey) throw new Error('Solflare did not return a public key')

    setState({ status: 'connected', network, publicKey, error: null, lastSignature: state.lastSignature })
    return state
  } catch (error) {
    const message = describeSolflareError(error)
    setState({ status: 'error', network, publicKey: null, error: message, lastSignature: null })
    throw new Error(message)
  }
}

export async function disconnectSolflareWallet(): Promise<SolflareConnectionState> {
  if (!wallet) {
    setState({ status: 'idle', network: null, publicKey: null, error: null, lastSignature: null })
    return state
  }

  setState({ ...state, status: 'disconnecting', error: null })
  await wallet.disconnect()
  setState({ status: 'idle', network: null, publicKey: null, error: null, lastSignature: null })
  wallet = null
  walletNetwork = null
  return state
}

export async function signSolflareMessage(message: string, display: 'hex' | 'utf8' = 'utf8'): Promise<SolflareMessageSignature> {
  const activeWallet = requireConnectedWallet()
  const publicKey = activeWallet.publicKey?.toBase58()
  if (!publicKey) throw new Error('Connect Solflare before signing a message')

  const messageBytes = new TextEncoder().encode(message)
  const signatureBytes = await activeWallet.signMessage(messageBytes, display)
  const signature = bs58.encode(signatureBytes)
  setState({ ...state, status: 'connected', publicKey, error: null, lastSignature: signature })
  return {
    publicKey,
    signature,
    signatureBytes: Array.from(signatureBytes),
  }
}

export async function signSolflareTransaction<T extends SolflareTransaction>(transaction: T): Promise<T> {
  const activeWallet = requireConnectedWallet()
  return await activeWallet.signTransaction(transaction) as T
}

export async function signSerializedSolflareTransaction(transactionBase64: string): Promise<SolflareSignedTransaction> {
  const activeWallet = requireConnectedWallet()
  const publicKey = activeWallet.publicKey?.toBase58()
  if (!publicKey) throw new Error('Connect Solflare before signing a transaction')

  const transaction = deserializeTransaction(base64ToBytes(transactionBase64))
  const signedTransaction = await activeWallet.signTransaction(transaction)
  return {
    publicKey,
    signedTransactionBase64: bytesToBase64(signedTransaction.serialize()),
  }
}

async function getWallet(network: SolflareSupportedCluster): Promise<Solflare> {
  if (wallet && walletNetwork === network) return wallet
  if (wallet) await disconnectSolflareWallet()

  const SolflareSdk = await getSolflareClass()
  wallet = new SolflareSdk({ network })
  walletNetwork = network
  wallet.on('connect', () => syncConnectedWallet())
  wallet.on('accountChanged', () => syncConnectedWallet())
  wallet.on('disconnect', () => {
    setState({ status: 'idle', network: null, publicKey: null, error: null, lastSignature: null })
  })
  return wallet
}

async function getSolflareClass(): Promise<SolflareCtor> {
  if (SolflareClass) return SolflareClass
  const imported = await import('@solflare-wallet/sdk')
  SolflareClass = imported.default
  return SolflareClass
}

function requireConnectedWallet(): Solflare {
  if (!wallet?.connected || !wallet.publicKey) throw new Error('Connect Solflare before signing')
  return wallet
}

function syncConnectedWallet(): void {
  setState({
    ...state,
    status: wallet?.connected ? 'connected' : 'idle',
    network: walletNetwork,
    publicKey: wallet?.publicKey?.toBase58() ?? null,
    error: null,
  })
}

function setState(next: SolflareConnectionState): void {
  state = next
  listeners.forEach((listener) => listener(state))
}

function describeSolflareError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Solflare request failed'
}


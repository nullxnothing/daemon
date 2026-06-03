import {
  getActiveProvider,
  getProvider,
  getWalletAdapterState,
  listProviders,
  setActiveProvider,
  setWalletAdapterState,
  subscribeWalletAdapter,
} from './registry'
import type {
  DaemonWalletProvider,
  WalletAdapterMessageSignature,
  WalletAdapterSignedTransaction,
  WalletAdapterState,
} from './types'

export type {
  DaemonWalletProvider,
  WalletAdapterMessageSignature,
  WalletAdapterSignedTransaction,
  WalletAdapterState,
  WalletAdapterStatus,
  WalletPerkTier,
} from './types'

export {
  getActiveProvider,
  getProvider,
  getWalletAdapterState,
  listProviders,
  subscribeWalletAdapter,
}

export function getProviders(): DaemonWalletProvider[] {
  return listProviders()
}

export async function connectWallet(
  providerId: string,
  cluster: WalletInfrastructureSettings['cluster'],
): Promise<WalletAdapterState> {
  const provider = getProvider(providerId)
  if (!provider) throw new Error(`Unknown wallet provider: ${providerId}`)

  setActiveProvider(providerId)
  try {
    return await provider.connect(cluster)
  } catch (error) {
    setActiveProvider(null)
    throw error
  }
}

export async function disconnectWallet(): Promise<WalletAdapterState> {
  const provider = getActiveProvider()
  if (!provider) {
    const idle: WalletAdapterState = {
      provider: null,
      status: 'idle',
      network: null,
      publicKey: null,
      error: null,
      lastSignature: null,
    }
    setWalletAdapterState(idle)
    return idle
  }

  try {
    return await provider.disconnect()
  } finally {
    setActiveProvider(null)
  }
}

export async function signMessage(message: string): Promise<WalletAdapterMessageSignature> {
  return requireActiveProvider().signMessage(message)
}

export async function signSerializedTransaction(transactionBase64: string): Promise<WalletAdapterSignedTransaction> {
  return requireActiveProvider().signSerializedTransaction(transactionBase64)
}

function requireActiveProvider(): DaemonWalletProvider {
  const provider = getActiveProvider()
  if (!provider) throw new Error('Connect a wallet before signing')
  return provider
}

import {
  connectSolflareWallet,
  disconnectSolflareWallet,
  getSolflareNetwork,
  signSerializedSolflareTransaction,
  signSolflareMessage,
} from '../../solflareWallet'
import type { DaemonWalletProvider, WalletAdapterState } from '../types'

const SOLFLARE_ICON = '/wallet-logos/solflare.png'

// Solflare is the launch partner: it backs the existing, fully wired external
// signing path, so the adapter wraps those functions rather than duplicating
// the SDK glue. Highlighted + partner perk tier drive the featured placement.
export const solflareProvider: DaemonWalletProvider = {
  id: 'solflare',
  name: 'Solflare',
  icon: SOLFLARE_ICON,
  subtitle: 'Recommended for daemon · external signing',
  isHighlighted: true,
  perkTier: 'partner',

  isAvailable(cluster) {
    return getSolflareNetwork(cluster) !== null
  },

  async connect(cluster): Promise<WalletAdapterState> {
    const state = await connectSolflareWallet(cluster)
    return toAdapterState(state)
  },

  async disconnect(): Promise<WalletAdapterState> {
    const state = await disconnectSolflareWallet()
    return toAdapterState(state)
  },

  signMessage(message) {
    return signSolflareMessage(message)
  },

  signSerializedTransaction(transactionBase64) {
    return signSerializedSolflareTransaction(transactionBase64)
  },
}

function toAdapterState(state: {
  status: WalletAdapterState['status']
  network: WalletAdapterState['network']
  publicKey: string | null
  error: string | null
  lastSignature: string | null
}): WalletAdapterState {
  return { provider: solflareProvider.id, ...state }
}

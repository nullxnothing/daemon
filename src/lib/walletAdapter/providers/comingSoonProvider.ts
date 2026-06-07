import type { DaemonWalletProvider, WalletAdapterState } from '../types'

interface ComingSoonConfig {
  id: string
  name: string
  icon: string
  subtitle: string
}

// Phantom / Backpack appear in the picker for parity with the web adapter, but
// the sandboxed Electron renderer has no injected extension to talk to, so they
// stay unavailable until an SDK/deeplink path is wired (phase 2).
function createComingSoonProvider(config: ComingSoonConfig): DaemonWalletProvider {
  const unavailable = (): never => {
    throw new Error(`${config.name} connection is coming soon to the desktop app`)
  }
  return {
    id: config.id,
    name: config.name,
    icon: config.icon,
    subtitle: config.subtitle,
    isHighlighted: false,
    perkTier: 'standard',
    isAvailable: () => false,
    connect: unavailable as () => Promise<WalletAdapterState>,
    disconnect: unavailable as () => Promise<WalletAdapterState>,
    signMessage: unavailable as DaemonWalletProvider['signMessage'],
    signSerializedTransaction: unavailable as DaemonWalletProvider['signSerializedTransaction'],
  }
}

export const phantomProvider = createComingSoonProvider({
  id: 'phantom',
  name: 'Phantom',
  icon: '/wallet-logos/phantom.png',
  subtitle: 'Solana',
})

export const backpackProvider = createComingSoonProvider({
  id: 'backpack',
  name: 'Backpack',
  icon: '/wallet-logos/backpack.png',
  subtitle: 'Solana · xNFT',
})

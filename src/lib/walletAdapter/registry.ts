import { subscribeSolflareWallet } from '../solflareWallet'
import { backpackProvider, phantomProvider } from './providers/comingSoonProvider'
import { solflareProvider } from './providers/solflareProvider'
import type { DaemonWalletProvider, WalletAdapterListener, WalletAdapterState } from './types'

const providers = new Map<string, DaemonWalletProvider>()
const listeners = new Set<WalletAdapterListener>()

let activeProviderId: string | null = null
let state: WalletAdapterState = {
  provider: null,
  status: 'idle',
  network: null,
  publicKey: null,
  error: null,
  lastSignature: null,
}

export function registerProvider(provider: DaemonWalletProvider): void {
  providers.set(provider.id, provider)
}

export function listProviders(): DaemonWalletProvider[] {
  // Highlighted partner first, then registration order.
  return [...providers.values()].sort((a, b) => Number(b.isHighlighted) - Number(a.isHighlighted))
}

export function getProvider(id: string): DaemonWalletProvider | undefined {
  return providers.get(id)
}

export function getActiveProvider(): DaemonWalletProvider | null {
  return activeProviderId ? providers.get(activeProviderId) ?? null : null
}

export function setActiveProvider(id: string | null): void {
  activeProviderId = id && providers.has(id) ? id : null
}

export function getWalletAdapterState(): WalletAdapterState {
  return state
}

export function subscribeWalletAdapter(listener: WalletAdapterListener): () => void {
  listeners.add(listener)
  listener(state)
  return () => listeners.delete(listener)
}

export function setWalletAdapterState(next: WalletAdapterState): void {
  state = next
  listeners.forEach((listener) => listener(state))
}

// Pre-register the launch partner (featured) plus the parity providers, then
// relay Solflare's underlying SDK state into the adapter observable so existing
// Solflare subscribers and the new card see one source of truth.
registerProvider(solflareProvider)
registerProvider(phantomProvider)
registerProvider(backpackProvider)
subscribeSolflareWallet((solflareState) => {
  if (activeProviderId && activeProviderId !== solflareProvider.id) return
  setWalletAdapterState({ provider: solflareProvider.id, ...solflareState })
})

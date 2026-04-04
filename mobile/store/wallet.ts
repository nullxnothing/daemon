import { create } from 'zustand'

interface WalletListEntry {
  id: string
  label: string
  address: string
  solBalance: number
  usdBalance: number
}

interface WalletDashboard {
  totalUsd: number
  totalSol: number
  holdings: { symbol: string; amount: number; usd: number }[]
}

interface WalletState {
  wallets: WalletListEntry[]
  dashboard: WalletDashboard | null
  isLoading: boolean
  error: string | null
  setWallets: (wallets: WalletListEntry[]) => void
  setDashboard: (dashboard: WalletDashboard) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
}

export const useWalletStore = create<WalletState>((set) => ({
  wallets: [],
  dashboard: null,
  isLoading: false,
  error: null,
  setWallets: (wallets) => set({ wallets }),
  setDashboard: (dashboard) => set({ dashboard }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))

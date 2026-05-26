import { create } from 'zustand'

export interface AgentOpsOpenRequest {
  asset?: string
  network?: 'solana-devnet' | 'solana-mainnet'
  service?: string
  price?: string
  sourceUrl: string
  receivedAt: string
}

interface AgentOpsState {
  openRequest: AgentOpsOpenRequest | null
  setOpenRequest: (openRequest: AgentOpsOpenRequest) => void
  clearOpenRequest: (receivedAt: string) => void
}

export const useAgentOpsStore = create<AgentOpsState>((set) => ({
  openRequest: null,
  setOpenRequest: (openRequest) => set({ openRequest }),
  clearOpenRequest: (receivedAt) => set((state) => (
    state.openRequest?.receivedAt === receivedAt ? { openRequest: null } : {}
  )),
}))

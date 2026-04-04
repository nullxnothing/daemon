// @daemon/solana-core — Portable Solana wallet operations and RPC client
// Platform-agnostic: works on both desktop (Electron) and mobile (Expo)
// Keypair management is injected — no filesystem or Electron safeStorage dependency.

export { createConnection, createConnectionStrict } from './connection'
export { fetchBalances, fetchTransactionHistory } from './helius'
export { transferSOL, transferSPLToken } from './transfers'
export type { SolanaConfig, HeliusBalance, HeliusBalancesResponse } from './types'

import { Connection } from '@solana/web3.js'
import { SOLANA_ENDPOINTS } from '@daemon/shared'
import type { SolanaConfig } from './types'

export function createConnection(config: SolanaConfig = {}): Connection {
  const endpoint = config.heliusApiKey
    ? SOLANA_ENDPOINTS.heliusMainnet(config.heliusApiKey)
    : config.rpcEndpoint ?? SOLANA_ENDPOINTS.MAINNET

  return new Connection(endpoint, config.commitment ?? 'confirmed')
}

export function createConnectionStrict(config: SolanaConfig): Connection {
  if (!config.heliusApiKey) {
    throw new Error('HELIUS_API_KEY not configured. Add it in Wallet settings.')
  }
  return new Connection(
    SOLANA_ENDPOINTS.heliusMainnet(config.heliusApiKey),
    config.commitment ?? 'confirmed',
  )
}

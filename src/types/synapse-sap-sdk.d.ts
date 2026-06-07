declare module '@oobe-protocol-labs/synapse-sap-sdk' {
  import type { Connection, Keypair, PublicKey, TransactionInstruction } from '@solana/web3.js'

  export const PROGRAM_ID: string

  export interface SapClientOptions {
    connection?: Connection
    rpcUrl?: string
    commitment?: string
    wallet?: unknown
    programId?: PublicKey
  }

  export interface SapCapability {
    id: string
    description: string | null
    protocol_id: string | null
    version: string | null
  }

  export class SapClient {
    connection: Connection
    agent: {
      registerAgent(ctx: {
        signer: Keypair
        wallet: PublicKey
        agent: PublicKey
        agentStats: PublicKey
        globalRegistry: PublicKey
        name: string
        description: string
        capabilities: SapCapability[]
        pricing: unknown[]
        protocols: string[]
        agentId: string | null
        agentUri: string | null
        x402Endpoint: string | null
      }): Promise<TransactionInstruction>
    }
    indexing: {
      addToCapabilityIndex(ctx: {
        signer: Keypair
        wallet: PublicKey
        agent: PublicKey
        capabilityIndex: PublicKey
        capabilityHash: number[]
      }): Promise<TransactionInstruction>
      initCapabilityIndex(ctx: {
        signer: Keypair
        wallet: PublicKey
        agent: PublicKey
        capabilityIndex: PublicKey
        globalRegistry: PublicKey
        capabilityId: string
        capabilityHash: number[]
      }): Promise<TransactionInstruction>
      addToProtocolIndex(ctx: {
        signer: Keypair
        wallet: PublicKey
        agent: PublicKey
        protocolIndex: PublicKey
        protocolHash: number[]
      }): Promise<TransactionInstruction>
      initProtocolIndex(ctx: {
        signer: Keypair
        wallet: PublicKey
        agent: PublicKey
        protocolIndex: PublicKey
        globalRegistry: PublicKey
        protocolId: string
        protocolHash: number[]
      }): Promise<TransactionInstruction>
    }
    constructor(opts?: SapClientOptions)
    fetchAccount<T = unknown>(name: string, address: PublicKey): Promise<T | null>
  }
}

declare module '@oobe-protocol-labs/synapse-sap-sdk/pdas' {
  import type { PublicKey } from '@solana/web3.js'

  export function getAgentPDA(wallet: PublicKey): [PublicKey, number]
  export function getAgentStatsPDA(agent: PublicKey): [PublicKey, number]
  export function getCapabilityIndexPDA(capabilityHash: Uint8Array): [PublicKey, number]
  export function getGlobalPDA(): [PublicKey, number]
  export function getProtocolIndexPDA(protocolHash: Uint8Array): [PublicKey, number]
}

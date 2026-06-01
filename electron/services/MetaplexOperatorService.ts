import { createV1, fetchAsset, mplCore } from '@metaplex-foundation/mpl-core'
import {
  findAgentIdentityV1Pda,
  mintAndSubmitAgent,
  mplAgentIdentity,
  registerIdentityV1,
  safeFetchAgentIdentityV1FromSeeds,
} from '@metaplex-foundation/mpl-agent-registry'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi'
import bs58 from 'bs58'
import { withKeypair } from './SolanaService'

export interface MetaplexCreateCoreAgentAssetInput {
  walletId: string
  network: 'devnet'
  rpcUrl: string
  name: string
  uri: string
  confirmedAt: number
  acknowledgement: string
}

export interface MetaplexCoreAgentAssetReceipt {
  id: string
  createdAt: string
  action: 'metaplex-core-agent-asset-create'
  network: 'devnet'
  wallet: string
  asset: string
  signature: string
  explorerUrl: string
  docsUrl: string
  postWriteRead: {
    ok: boolean
    name?: string
    uri?: string
    owner?: string
    error?: string
  }
  safety: {
    walletApproval: true
    liveWrite: true
    mainnetBlocked: true
    nextBlockedActions: string[]
  }
}

export interface MetaplexMintRegisteredAgentInput {
  walletId: string
  network: 'devnet'
  rpcUrl: string
  name: string
  description: string
  uri: string
  serviceUrl: string
  priceUsdc: string
  confirmedAt: number
  acknowledgement: string
}

export interface MetaplexRegisterAgentIdentityInput {
  walletId: string
  network: 'devnet'
  rpcUrl: string
  assetAddress: string
  agentRegistrationUri: string
  confirmedAt: number
  acknowledgement: string
}

export interface MetaplexReadAgentIdentityInput {
  network: 'devnet' | 'mainnet-beta'
  rpcUrl: string
  assetAddress: string
}

export interface MetaplexRegisteredAgentReceipt {
  id: string
  createdAt: string
  action: 'metaplex-agent-mint-and-register'
  network: 'devnet'
  wallet: string
  asset: string
  signature: string
  explorerUrl: string
  docsUrl: string
  agentMetadata: {
    type: 'agent'
    name: string
    description: string
    services: Array<{ name: string; endpoint: string }>
    registrations: Array<{ agentId: string; agentRegistry: string }>
    supportedTrust: string[]
  }
  safety: {
    walletApproval: true
    liveWrite: true
    mainnetBlocked: true
  }
}

export interface MetaplexRegisterAgentIdentityReceipt {
  id: string
  createdAt: string
  action: 'metaplex-agent-register-identity'
  network: 'devnet'
  wallet: string
  asset: string
  agentIdentityPda: string
  signature: string
  explorerUrl: string
  docsUrl: string
}

export interface MetaplexReadAgentIdentityResult {
  registered: boolean
  network: 'devnet' | 'mainnet-beta'
  asset: string
  agentIdentityPda: string
  identity?: {
    publicKey: string
    bump: number
    asset: string
  }
}

const DEVNET_RPC_PATTERN = /devnet|localhost|127\.0\.0\.1/i
const CORE_AGENT_ACKNOWLEDGEMENT = 'CREATE DEVNET CORE ASSET'
const MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT = 'MINT REGISTERED AGENT'
const REGISTER_AGENT_IDENTITY_ACKNOWLEDGEMENT = 'REGISTER AGENT IDENTITY'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertDevnetInput(input: MetaplexCreateCoreAgentAssetInput) {
  if (!input.walletId) throw new Error('Select a DAEMON signing wallet before executing.')
  if (input.network !== 'devnet') throw new Error('Only devnet Metaplex writes are enabled in this slice.')
  if (!DEVNET_RPC_PATTERN.test(input.rpcUrl)) {
    throw new Error('RPC URL must point to devnet or a local validator before live Metaplex writes are enabled.')
  }
  if (!input.name.trim()) throw new Error('Agent asset name is required.')
  if (input.name.trim().length > 32) throw new Error('Agent asset name must be 32 characters or fewer.')
  if (!/^https?:\/\//.test(input.uri.trim())) {
    throw new Error('Agent asset URI must be a public HTTP(S) metadata URL.')
  }
  if (input.acknowledgement.trim() !== CORE_AGENT_ACKNOWLEDGEMENT) {
    throw new Error(`Type ${CORE_AGENT_ACKNOWLEDGEMENT} before executing the devnet write.`)
  }
  const ageMs = Date.now() - input.confirmedAt
  if (!Number.isFinite(input.confirmedAt) || ageMs < 0 || ageMs > 60_000) {
    throw new Error('Execution confirmation expired. Review the plan again before signing.')
  }
}

function assertTimedDevnetWrite(input: { walletId: string; network: 'devnet'; rpcUrl: string; confirmedAt: number }) {
  if (!input.walletId) throw new Error('Select a DAEMON signing wallet before executing.')
  if (input.network !== 'devnet') throw new Error('Only devnet Metaplex writes are enabled in this slice.')
  if (!DEVNET_RPC_PATTERN.test(input.rpcUrl)) {
    throw new Error('RPC URL must point to devnet or a local validator before live Metaplex writes are enabled.')
  }
  const ageMs = Date.now() - input.confirmedAt
  if (!Number.isFinite(input.confirmedAt) || ageMs < 0 || ageMs > 60_000) {
    throw new Error('Execution confirmation expired. Review the plan again before signing.')
  }
}

function assertMintRegisteredAgentInput(input: MetaplexMintRegisteredAgentInput) {
  assertTimedDevnetWrite(input)
  if (!input.name.trim()) throw new Error('Agent name is required.')
  if (input.name.trim().length > 32) throw new Error('Agent name must be 32 characters or fewer.')
  if (!input.description.trim()) throw new Error('Agent description is required.')
  if (!/^https?:\/\//.test(input.uri.trim())) {
    throw new Error('Agent asset URI must be a public HTTP(S) metadata URL.')
  }
  if (input.serviceUrl.trim() && !/^https?:\/\//.test(input.serviceUrl.trim()) && !/^wss?:\/\//.test(input.serviceUrl.trim())) {
    throw new Error('Agent service URL must be HTTP(S) or WS(S).')
  }
  if (input.acknowledgement.trim() !== MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT) {
    throw new Error(`Type ${MINT_REGISTERED_AGENT_ACKNOWLEDGEMENT} before minting and registering the agent.`)
  }
}

function assertRegisterAgentIdentityInput(input: MetaplexRegisterAgentIdentityInput) {
  assertTimedDevnetWrite(input)
  if (!input.assetAddress.trim()) throw new Error('Agent Core asset address is required.')
  if (!/^https?:\/\//.test(input.agentRegistrationUri.trim())) {
    throw new Error('Agent registration URI must be a public HTTP(S) metadata URL.')
  }
  if (input.acknowledgement.trim() !== REGISTER_AGENT_IDENTITY_ACKNOWLEDGEMENT) {
    throw new Error(`Type ${REGISTER_AGENT_IDENTITY_ACKNOWLEDGEMENT} before registering the agent identity.`)
  }
}

function createAgentMetadata(input: MetaplexMintRegisteredAgentInput) {
  const services = [
    input.serviceUrl.trim() ? { name: 'DAEMON_RUN', endpoint: input.serviceUrl.trim() } : null,
    input.serviceUrl.trim() ? { name: 'MCP', endpoint: `${input.serviceUrl.trim().replace(/\/+$/, '')}/mcp` } : null,
    input.serviceUrl.trim() ? { name: 'A2A', endpoint: `${input.serviceUrl.trim().replace(/\/+$/, '')}/a2a/agent-card.json` } : null,
    input.priceUsdc.trim() ? { name: 'x402', endpoint: `${input.serviceUrl.trim().replace(/\/+$/, '')}/x402` } : null,
  ].filter(Boolean) as Array<{ name: string; endpoint: string }>

  return {
    type: 'agent' as const,
    name: input.name.trim(),
    description: input.description.trim(),
    services,
    registrations: [] as Array<{ agentId: string; agentRegistry: string }>,
    supportedTrust: ['reputation', 'wallet-signature', 'work-receipts'],
  }
}

function createAgentUmi(rpcUrl: string, secretKey: Uint8Array) {
  const umi = createUmi(rpcUrl).use(mplCore()).use(mplAgentIdentity())
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey)
  umi.use(keypairIdentity(umiKeypair))
  return umi
}

export async function createCoreAgentAsset(input: MetaplexCreateCoreAgentAssetInput): Promise<MetaplexCoreAgentAssetReceipt> {
  assertDevnetInput(input)

  return withKeypair(input.walletId, async (web3Keypair) => {
    const createdAt = new Date().toISOString()
    const secretKey = new Uint8Array(web3Keypair.secretKey)
    try {
      const umi = createUmi(input.rpcUrl).use(mplCore())
      const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey)
      umi.use(keypairIdentity(umiKeypair))

      const asset = generateSigner(umi)
      const result = await createV1(umi, {
        asset,
        name: input.name.trim(),
        uri: input.uri.trim(),
      }).sendAndConfirm(umi, {
        confirm: { commitment: 'confirmed' },
      })

      const signature = bs58.encode(result.signature)
      let postWriteRead: MetaplexCoreAgentAssetReceipt['postWriteRead'] | null = null
      let lastReadError = 'Could not fetch Core asset after write.'
      for (let attempt = 1; attempt <= 15; attempt += 1) {
        try {
          const assetData = await fetchAsset(umi, asset.publicKey)
          postWriteRead = {
            ok: true,
            name: assetData.name,
            uri: assetData.uri,
            owner: assetData.owner.toString(),
          }
          break
        } catch (error) {
          lastReadError = error instanceof Error ? error.message : 'Could not fetch Core asset after write.'
          if (attempt < 15) await sleep(2_000)
        }
      }
      if (!postWriteRead) {
        postWriteRead = {
          ok: false,
          error: lastReadError,
        }
      }

      return {
        id: `metaplex-core-agent-${asset.publicKey.toString()}-${Date.now()}`,
        createdAt,
        action: 'metaplex-core-agent-asset-create',
        network: 'devnet',
        wallet: web3Keypair.publicKey.toBase58(),
        asset: asset.publicKey.toString(),
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        docsUrl: 'https://www.metaplex.com/docs/smart-contracts/core/create-asset',
        postWriteRead,
        safety: {
          walletApproval: true,
          liveWrite: true,
          mainnetBlocked: true,
          nextBlockedActions: [
            'register Agent Identity',
            'create Genesis launch',
            'set agent token',
            'claim creator fees',
          ],
        },
      }
    } finally {
      secretKey.fill(0)
    }
  })
}

export async function mintRegisteredAgent(input: MetaplexMintRegisteredAgentInput): Promise<MetaplexRegisteredAgentReceipt> {
  assertMintRegisteredAgentInput(input)

  return withKeypair(input.walletId, async (web3Keypair) => {
    const createdAt = new Date().toISOString()
    const secretKey = new Uint8Array(web3Keypair.secretKey)
    try {
      const umi = createAgentUmi(input.rpcUrl, secretKey)
      const agentMetadata = createAgentMetadata(input)
      const result = await mintAndSubmitAgent(umi, {}, {
        wallet: umi.identity.publicKey,
        network: 'solana-devnet',
        name: input.name.trim(),
        uri: input.uri.trim(),
        agentMetadata,
      })
      const signature = bs58.encode(result.signature)

      return {
        id: `metaplex-agent-${result.assetAddress}-${Date.now()}`,
        createdAt,
        action: 'metaplex-agent-mint-and-register',
        network: 'devnet',
        wallet: web3Keypair.publicKey.toBase58(),
        asset: result.assetAddress,
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        docsUrl: 'https://www.metaplex.com/docs/agents/mint-agent',
        agentMetadata,
        safety: {
          walletApproval: true,
          liveWrite: true,
          mainnetBlocked: true,
        },
      }
    } finally {
      secretKey.fill(0)
    }
  })
}

export async function registerAgentIdentity(input: MetaplexRegisterAgentIdentityInput): Promise<MetaplexRegisterAgentIdentityReceipt> {
  assertRegisterAgentIdentityInput(input)

  return withKeypair(input.walletId, async (web3Keypair) => {
    const createdAt = new Date().toISOString()
    const secretKey = new Uint8Array(web3Keypair.secretKey)
    try {
      const umi = createAgentUmi(input.rpcUrl, secretKey)
      const asset = publicKey(input.assetAddress.trim())
      const pda = findAgentIdentityV1Pda(umi, { asset })
      const result = await registerIdentityV1(umi, {
        asset,
        agentRegistrationUri: input.agentRegistrationUri.trim(),
      }).sendAndConfirm(umi, {
        confirm: { commitment: 'confirmed' },
      })
      const signature = bs58.encode(result.signature)

      return {
        id: `metaplex-agent-identity-${input.assetAddress.trim()}-${Date.now()}`,
        createdAt,
        action: 'metaplex-agent-register-identity',
        network: 'devnet',
        wallet: web3Keypair.publicKey.toBase58(),
        asset: input.assetAddress.trim(),
        agentIdentityPda: pda[0].toString(),
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        docsUrl: 'https://www.metaplex.com/docs/agents/register-agent',
      }
    } finally {
      secretKey.fill(0)
    }
  })
}

export async function readAgentIdentity(input: MetaplexReadAgentIdentityInput): Promise<MetaplexReadAgentIdentityResult> {
  const rpcUrl = input.rpcUrl.trim() || (input.network === 'devnet' ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com')
  const umi = createUmi(rpcUrl).use(mplAgentIdentity())
  const asset = publicKey(input.assetAddress.trim())
  const pda = findAgentIdentityV1Pda(umi, { asset })
  const identity = await safeFetchAgentIdentityV1FromSeeds(umi, { asset })

  if (!identity) {
    return {
      registered: false,
      network: input.network,
      asset: input.assetAddress.trim(),
      agentIdentityPda: pda[0].toString(),
    }
  }

  return {
    registered: true,
    network: input.network,
    asset: input.assetAddress.trim(),
    agentIdentityPda: pda[0].toString(),
    identity: {
      publicKey: identity.publicKey.toString(),
      bump: identity.bump,
      asset: identity.asset.toString(),
    },
  }
}

import { createV1, fetchAsset, mplCore } from '@metaplex-foundation/mpl-core'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { generateSigner, keypairIdentity } from '@metaplex-foundation/umi'
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

const DEVNET_RPC_PATTERN = /devnet|localhost|127\.0\.0\.1/i
const CORE_AGENT_ACKNOWLEDGEMENT = 'CREATE DEVNET CORE ASSET'

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

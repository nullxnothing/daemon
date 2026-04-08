import { createRequire } from 'node:module'
import BN from 'bn.js'
import { Keypair, PublicKey, VersionedTransaction, Transaction, TransactionInstruction } from '@solana/web3.js'
import { getConnectionStrict, withKeypair } from '../../SolanaService'
import { uploadTokenMetadata } from '../metadata'
import type { AdapterLaunchResult, RaydiumLaunchpadConfig, TokenLaunchAdapter, TokenLaunchCheck, TokenLaunchInput } from '../types'

const require = createRequire(import.meta.url)
const DEFAULT_SOL_MINT = 'So11111111111111111111111111111111111111112'

interface RaydiumDeps {
  env?: NodeJS.ProcessEnv
  settings?: RaydiumLaunchpadConfig
  loadSdk?: () => unknown
  uploadMetadata?: typeof uploadTokenMetadata
}

function canResolveRaydiumSdk() {
  try {
    require.resolve('@raydium-io/raydium-sdk-v2')
    return true
  } catch {
    return false
  }
}

function getDefinition(env: NodeJS.ProcessEnv) {
  const hasSdk = canResolveRaydiumSdk()
  const hasConfig = Boolean(env.RAYDIUM_LAUNCHLAB_CONFIG)
  return {
    id: 'raydium' as const,
    name: 'Raydium LaunchLab',
    description: 'Permissionless LaunchLab deployment with Raydium liquidity',
    status: hasSdk && hasConfig ? 'available' as const : 'planned' as const,
    enabled: hasSdk && hasConfig,
    reason: !hasSdk
      ? 'Raydium SDK is not installed in this environment.'
      : !hasConfig
        ? 'Set RAYDIUM_LAUNCHLAB_CONFIG to enable LaunchLab creation.'
        : null,
  }
}

function resolveConfig(env: NodeJS.ProcessEnv, settings?: RaydiumLaunchpadConfig) {
  return {
    configId: settings?.configId?.trim() || env.RAYDIUM_LAUNCHLAB_CONFIG || '',
    quoteMint: settings?.quoteMint?.trim() || env.RAYDIUM_LAUNCHLAB_QUOTE_MINT || DEFAULT_SOL_MINT,
  }
}

function defaultLoadSdk() {
  return require('@raydium-io/raydium-sdk-v2') as Record<string, unknown>
}

export function createRaydiumLaunchLabAdapter(deps: RaydiumDeps = {}): TokenLaunchAdapter {
  const env = deps.env ?? process.env
  const config = resolveConfig(env, deps.settings)
  const hasSdk = deps.loadSdk ? true : canResolveRaydiumSdk()
  const definition = deps.loadSdk
    ? {
        ...getDefinition(env),
        status: config.configId ? 'available' as const : 'planned' as const,
        enabled: Boolean(config.configId),
        reason: config.configId ? null : 'Set a Raydium LaunchLab config ID to enable LaunchLab creation.',
      }
    : {
        ...getDefinition(env),
        status: hasSdk && config.configId ? 'available' as const : 'planned' as const,
        enabled: hasSdk && Boolean(config.configId),
        reason: !hasSdk
          ? 'Raydium SDK is not installed in this environment.'
          : config.configId
            ? null
            : 'Set a Raydium LaunchLab config ID to enable LaunchLab creation.',
      }
  const loadSdk = deps.loadSdk ?? defaultLoadSdk
  const uploadMetadata = deps.uploadMetadata ?? uploadTokenMetadata

  return {
    definition,
    async preflight(): Promise<TokenLaunchCheck[]> {
      if (!definition.enabled) {
        return [{
          id: 'raydium-config',
          label: 'Raydium Config',
          status: 'fail',
          detail: definition.reason ?? 'Raydium LaunchLab is not available.',
        }]
      }

      const configId = new PublicKey(config.configId)
      const quoteMint = new PublicKey(config.quoteMint)
      let connection: ReturnType<typeof getConnectionStrict>

      try {
        connection = getConnectionStrict()
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'RPC connection is not configured.'
        return [
          {
            id: 'raydium-config',
            label: 'Raydium Config',
            status: 'fail',
            detail,
          },
          {
            id: 'raydium-quote-mint',
            label: 'Raydium Quote Mint',
            status: 'fail',
            detail,
          },
        ]
      }

      const checks: TokenLaunchCheck[] = []

      const [configInfo, quoteMintInfo] = await Promise.all([
        connection.getAccountInfo(configId),
        connection.getAccountInfo(quoteMint),
      ])

      checks.push({
        id: 'raydium-config',
        label: 'Raydium Config',
        status: configInfo ? 'pass' : 'fail',
        detail: configInfo
          ? `LaunchLab config ${configId.toBase58()} exists on-chain.`
          : `LaunchLab config ${configId.toBase58()} was not found on-chain.`,
      })
      checks.push({
        id: 'raydium-quote-mint',
        label: 'Raydium Quote Mint',
        status: quoteMintInfo ? 'pass' : 'fail',
        detail: quoteMintInfo
          ? `Quote mint ${quoteMint.toBase58()} is reachable on-chain.`
          : `Quote mint ${quoteMint.toBase58()} was not found on-chain.`,
      })
      return checks
    },
    async createLaunch(input: TokenLaunchInput): Promise<AdapterLaunchResult> {
      if (!definition.enabled) {
        throw new Error(definition.reason ?? 'Raydium LaunchLab is not available')
      }

      return withKeypair(input.walletId, async (keypair) => {
        const connection = getConnectionStrict()
        const metadata = await uploadMetadata(input)
        const sdk = loadSdk() as Record<string, any>
        const mintKeypair = Keypair.generate()
        const quoteMint = new PublicKey(config.quoteMint)
        const configId = new PublicKey(config.configId)

        const raydium = sdk.Raydium?.load
          ? await sdk.Raydium.load({
              connection,
              owner: keypair,
              cluster: 'mainnet',
              disableFeatureCheck: true,
              disableLoadToken: true,
            })
          : sdk.default?.Raydium?.load
            ? await sdk.default.Raydium.load({
                connection,
                owner: keypair,
                cluster: 'mainnet',
                disableFeatureCheck: true,
                disableLoadToken: true,
              })
            : sdk

        const launchpadApi = raydium.launchpad ?? raydium.launchLab ?? raydium
        if (typeof launchpadApi?.createLaunchpad !== 'function') {
          throw new Error('Installed Raydium SDK does not expose launchpad.createLaunchpad')
        }

        const createResult = await launchpadApi.createLaunchpad({
          creator: keypair.publicKey,
          mint: mintKeypair,
          metadata: {
            name: input.name,
            symbol: input.symbol,
            uri: metadata.metadataUri,
          },
          quoteMint,
          configId,
          buyAmount: new BN(Math.floor(input.initialBuySol * 1e9)),
          slippageBps: input.slippageBps,
          priorityFeeLamports: Math.floor(input.priorityFeeSol * 1e9),
        })

        const signature = await executeRaydiumLaunch({
          connection,
          keypair,
          mintKeypair,
          createResult,
        })

        return {
          signature,
          mint: mintKeypair.publicKey.toBase58(),
          metadataUri: metadata.metadataUri,
          poolAddress: extractAddress(createResult, ['poolAddress', 'poolId', 'launchpadAddress']),
          bondingCurveAddress: extractAddress(createResult, ['bondingCurveAddress', 'curveAddress']),
          protocolReceipts: {
            provider: 'raydium-launchlab',
            configId: configId.toBase58(),
            quoteMint: quoteMint.toBase58(),
            rawKeys: Object.keys(createResult ?? {}),
          },
        }
      })
    },
  }
}

async function executeRaydiumLaunch(input: {
  connection: ReturnType<typeof getConnectionStrict>
  keypair: Keypair
  mintKeypair: Keypair
  createResult: any
}) {
  const { connection, keypair, mintKeypair, createResult } = input

  if (typeof createResult?.execute === 'function') {
    const executed = await createResult.execute({ sendAndConfirm: true })
    const signature = executed?.txId ?? executed?.signature
    if (typeof signature === 'string') return signature
  }

  const transaction = createResult?.transaction ?? createResult?.tx ?? createResult?.transactions?.[0]
  if (transaction instanceof VersionedTransaction) {
    transaction.sign([keypair, mintKeypair])
    return await connection.sendTransaction(transaction, { skipPreflight: false })
  }

  if (transaction instanceof Transaction) {
    transaction.sign(keypair, mintKeypair)
    return await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false })
  }

  const instructions = createResult?.instructions as TransactionInstruction[] | undefined
  if (Array.isArray(instructions) && instructions.length > 0) {
    const { TransactionMessage } = await import('@solana/web3.js')
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
    const message = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message()
    const tx = new VersionedTransaction(message)
    tx.sign([keypair, mintKeypair])
    const signature = await connection.sendTransaction(tx, { skipPreflight: false })
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
    return signature
  }

  throw new Error('Raydium LaunchLab adapter could not find an executable transaction result')
}

function extractAddress(value: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const candidate = value?.[key]
    if (candidate instanceof PublicKey) return candidate.toBase58()
    if (typeof candidate === 'string' && candidate.length > 20) return candidate
  }
  return null
}

export const raydiumLaunchLabAdapter = createRaydiumLaunchLabAdapter()

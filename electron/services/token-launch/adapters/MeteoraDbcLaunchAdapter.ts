import { createRequire } from 'node:module'
import BN from 'bn.js'
import { Keypair, PublicKey, VersionedTransaction, Transaction, TransactionInstruction } from '@solana/web3.js'
import { getConnectionStrict, withKeypair } from '../../SolanaService'
import { uploadTokenMetadata } from '../metadata'
import type { AdapterLaunchResult, MeteoraLaunchpadConfig, TokenLaunchAdapter, TokenLaunchCheck, TokenLaunchInput } from '../types'

const require = createRequire(import.meta.url)
const DEFAULT_SOL_MINT = 'So11111111111111111111111111111111111111112'
const DEFAULT_BASE_SUPPLY = '1000000000000000'

interface MeteoraDeps {
  env?: NodeJS.ProcessEnv
  settings?: MeteoraLaunchpadConfig
  loadSdk?: () => unknown
  uploadMetadata?: typeof uploadTokenMetadata
}

function canResolveMeteoraSdk() {
  try {
    require.resolve('@meteora-ag/dynamic-bonding-curve-sdk')
    return true
  } catch {
    return false
  }
}

function getDefinition(env: NodeJS.ProcessEnv) {
  const hasSdk = canResolveMeteoraSdk()
  const hasConfig = Boolean(env.METEORA_DBC_CONFIG)
  return {
    id: 'meteora' as const,
    name: 'Meteora DBC',
    description: 'Dynamic bonding curve launch with Meteora migration controls',
    status: hasSdk && hasConfig ? 'available' as const : 'planned' as const,
    enabled: hasSdk && hasConfig,
    reason: !hasSdk
      ? 'Meteora DBC SDK is not installed in this environment.'
      : !hasConfig
        ? 'Set METEORA_DBC_CONFIG to enable DBC pool creation.'
        : null,
  }
}

function resolveConfig(env: NodeJS.ProcessEnv, settings?: MeteoraLaunchpadConfig) {
  return {
    configId: settings?.configId?.trim() || env.METEORA_DBC_CONFIG || '',
    quoteMint: settings?.quoteMint?.trim() || env.METEORA_DBC_QUOTE_MINT || DEFAULT_SOL_MINT,
    baseSupply: settings?.baseSupply?.trim() || env.METEORA_DBC_BASE_SUPPLY || DEFAULT_BASE_SUPPLY,
  }
}

function defaultLoadSdk() {
  return require('@meteora-ag/dynamic-bonding-curve-sdk') as Record<string, unknown>
}

export function createMeteoraDbcLaunchAdapter(deps: MeteoraDeps = {}): TokenLaunchAdapter {
  const env = deps.env ?? process.env
  const config = resolveConfig(env, deps.settings)
  const hasSdk = deps.loadSdk ? true : canResolveMeteoraSdk()
  const definition = deps.loadSdk
    ? {
        ...getDefinition(env),
        status: config.configId ? 'available' as const : 'planned' as const,
        enabled: Boolean(config.configId),
        reason: config.configId ? null : 'Set a Meteora DBC config ID to enable DBC pool creation.',
      }
    : {
        ...getDefinition(env),
        status: hasSdk && config.configId ? 'available' as const : 'planned' as const,
        enabled: hasSdk && Boolean(config.configId),
        reason: !hasSdk
          ? 'Meteora DBC SDK is not installed in this environment.'
          : config.configId
            ? null
            : 'Set a Meteora DBC config ID to enable DBC pool creation.',
      }
  const loadSdk = deps.loadSdk ?? defaultLoadSdk
  const uploadMetadata = deps.uploadMetadata ?? uploadTokenMetadata

  return {
    definition,
    async preflight(): Promise<TokenLaunchCheck[]> {
      if (!definition.enabled) {
        return [{
          id: 'meteora-config',
          label: 'Meteora Config',
          status: 'fail',
          detail: definition.reason ?? 'Meteora DBC is not available.',
        }]
      }

      const configKey = new PublicKey(config.configId)
      const quoteMint = new PublicKey(config.quoteMint)
      const baseSupplyIsValid = new BN(config.baseSupply).gt(new BN(0))
      let connection: ReturnType<typeof getConnectionStrict>

      try {
        connection = getConnectionStrict()
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'RPC connection is not configured.'
        return [
          {
            id: 'meteora-config',
            label: 'Meteora Config',
            status: 'fail',
            detail,
          },
          {
            id: 'meteora-quote-mint',
            label: 'Meteora Quote Mint',
            status: 'fail',
            detail,
          },
          {
            id: 'meteora-base-supply',
            label: 'Meteora Base Supply',
            status: baseSupplyIsValid ? 'pass' : 'fail',
            detail: `Base supply is set to ${config.baseSupply}.`,
          },
        ]
      }

      const checks: TokenLaunchCheck[] = []

      const [configInfo, quoteMintInfo] = await Promise.all([
        connection.getAccountInfo(configKey),
        connection.getAccountInfo(quoteMint),
      ])

      checks.push({
        id: 'meteora-config',
        label: 'Meteora Config',
        status: configInfo ? 'pass' : 'fail',
        detail: configInfo
          ? `DBC config ${configKey.toBase58()} exists on-chain.`
          : `DBC config ${configKey.toBase58()} was not found on-chain.`,
      })
      checks.push({
        id: 'meteora-quote-mint',
        label: 'Meteora Quote Mint',
        status: quoteMintInfo ? 'pass' : 'fail',
        detail: quoteMintInfo
          ? `Quote mint ${quoteMint.toBase58()} is reachable on-chain.`
          : `Quote mint ${quoteMint.toBase58()} was not found on-chain.`,
      })
      checks.push({
        id: 'meteora-base-supply',
        label: 'Meteora Base Supply',
        status: baseSupplyIsValid ? 'pass' : 'fail',
        detail: `Base supply is set to ${config.baseSupply}.`,
      })
      return checks
    },
    async createLaunch(input: TokenLaunchInput): Promise<AdapterLaunchResult> {
      if (!definition.enabled) {
        throw new Error(definition.reason ?? 'Meteora DBC is not available')
      }

      return withKeypair(input.walletId, async (keypair) => {
        const connection = getConnectionStrict()
        const metadata = await uploadMetadata(input)
        const sdk = loadSdk() as Record<string, any>
        const DynamicBondingCurve = sdk.DynamicBondingCurve ?? sdk.default?.DynamicBondingCurve
        if (!DynamicBondingCurve) {
          throw new Error('Installed Meteora DBC SDK does not expose DynamicBondingCurve')
        }

        const dbc = new DynamicBondingCurve(connection, 'confirmed')
        const mintKeypair = Keypair.generate()
        const quoteMint = new PublicKey(config.quoteMint)
        const configKey = new PublicKey(config.configId)
        const baseAmount = new BN(config.baseSupply)

        const createResult = await dbc.createPool({
          creator: keypair.publicKey,
          baseMint: mintKeypair.publicKey,
          quoteMint,
          config: configKey,
          baseAmount,
          quoteAmount: new BN(0),
          name: input.name,
          symbol: input.symbol,
          uri: metadata.metadataUri,
        })

        const signature = await executeMeteoraLaunch({
          connection,
          keypair,
          mintKeypair,
          createResult,
        })

        return {
          signature,
          mint: mintKeypair.publicKey.toBase58(),
          metadataUri: metadata.metadataUri,
          poolAddress: extractAddress(createResult, ['pool', 'poolAddress', 'poolId']),
          bondingCurveAddress: extractAddress(createResult, ['bondingCurve', 'bondingCurveAddress', 'curveAddress']),
          protocolReceipts: {
            provider: 'meteora-dbc',
            config: configKey.toBase58(),
            quoteMint: quoteMint.toBase58(),
            baseSupply: baseAmount.toString(),
            rawKeys: Object.keys(createResult ?? {}),
          },
        }
      })
    },
  }
}

async function executeMeteoraLaunch(input: {
  connection: ReturnType<typeof getConnectionStrict>
  keypair: Keypair
  mintKeypair: Keypair
  createResult: any
}) {
  const { connection, keypair, mintKeypair, createResult } = input

  const transaction = createResult?.transaction ?? createResult?.tx
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

  if (typeof createResult?.execute === 'function') {
    const executed = await createResult.execute({ sendAndConfirm: true })
    const signature = executed?.txId ?? executed?.signature
    if (typeof signature === 'string') return signature
  }

  throw new Error('Meteora DBC adapter could not find an executable transaction result')
}

function extractAddress(value: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const candidate = value?.[key]
    if (candidate instanceof PublicKey) return candidate.toBase58()
    if (typeof candidate === 'string' && candidate.length > 20) return candidate
  }
  return null
}

export const meteoraDbcLaunchAdapter = createMeteoraDbcLaunchAdapter()

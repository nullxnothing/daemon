import { Connection } from '@solana/web3.js'
import * as SecureKey from './SecureKeyService'
import { getWalletInfrastructureSettings, type WalletInfrastructureSettings } from './SettingsService'
import { LogService } from './LogService'

export type SolanaCluster = WalletInfrastructureSettings['cluster']
export type SolanaRpcProvider = WalletInfrastructureSettings['rpcProvider']
export type SolanaExecutionMode = WalletInfrastructureSettings['executionMode']

export type SolanaRuntimeWarningCode =
  | 'public-rpc'
  | 'public-rpc-fallback'
  | 'jito-public-rpc'
  | 'jito-non-mainnet'
  | 'jito-missing-url'

export type SolanaRuntimeBlockerCode =
  | 'missing-helius-key'
  | 'missing-quicknode-url'
  | 'missing-custom-rpc-url'
  | 'public-rpc-not-strict'
  | 'jito-missing-url'

export interface SolanaRuntimeWarning {
  code: SolanaRuntimeWarningCode
  message: string
}

export interface SolanaRuntimeBlocker {
  code: SolanaRuntimeBlockerCode
  message: string
}

export interface SolanaRuntimeConfig {
  cluster: SolanaCluster
  rpcProvider: SolanaRpcProvider
  rpcLabel: 'Helius' | 'QuickNode' | 'Custom RPC' | 'Public RPC' | 'Local validator'
  rpcEndpoint: string
  rpcReady: boolean
  heliusReady: boolean
  jupiterReady: boolean
  isPublicRpc: boolean
  isPublicRpcFallback: boolean
  publicRpcFallbackReason: string | null
  executionMode: SolanaExecutionMode
  jitoBlockEngineUrl: string
  jitoReady: boolean
  preferredWallet: WalletInfrastructureSettings['preferredWallet']
  warnings: SolanaRuntimeWarning[]
  blockers: SolanaRuntimeBlocker[]
}

export interface SolanaTransactionSubmissionSettings {
  mode: SolanaExecutionMode
  jitoBlockEngineUrl: string
}

const PUBLIC_MAINNET_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com'
const PUBLIC_DEVNET_RPC_ENDPOINT = 'https://api.devnet.solana.com'
const PUBLIC_LOCALNET_RPC_ENDPOINT = 'http://127.0.0.1:8899'

let publicRpcFallbackWarned = false

export function getPublicRpcEndpoint(cluster: SolanaCluster): string {
  if (cluster === 'mainnet-beta') return PUBLIC_MAINNET_RPC_ENDPOINT
  if (cluster === 'localnet') return PUBLIC_LOCALNET_RPC_ENDPOINT
  return PUBLIC_DEVNET_RPC_ENDPOINT
}

export function getHeliusRpcEndpoint(cluster: SolanaCluster, key: string): string {
  if (cluster === 'localnet') return PUBLIC_LOCALNET_RPC_ENDPOINT
  const subdomain = cluster === 'mainnet-beta' ? 'mainnet' : 'devnet'
  return `https://${subdomain}.helius-rpc.com/?api-key=${key}`
}

export function getHeliusApiKey(): string | null {
  return SecureKey.getKey('HELIUS_API_KEY') ?? process.env.HELIUS_API_KEY ?? null
}

export function getJupiterApiKey(): string | null {
  return SecureKey.getKey('JUPITER_API_KEY') ?? process.env.JUPITER_API_KEY ?? null
}

export function hasHeliusApiKey(): boolean {
  return Boolean(getHeliusApiKey())
}

export function hasJupiterApiKey(): boolean {
  return Boolean(getJupiterApiKey())
}

export function resolveSolanaRuntimeConfig(opts: { warnOnPublicFallback?: boolean } = {}): SolanaRuntimeConfig {
  const settings = getWalletInfrastructureSettings()
  const heliusKey = getHeliusApiKey()
  const jupiterKey = getJupiterApiKey()
  const warnings: SolanaRuntimeWarning[] = []
  const blockers: SolanaRuntimeBlocker[] = []

  const publicEndpoint = getPublicRpcEndpoint(settings.cluster)
  let rpcLabel: SolanaRuntimeConfig['rpcLabel'] = 'Public RPC'
  let rpcEndpoint = publicEndpoint
  let isPublicRpc = settings.cluster !== 'localnet'
  let isPublicRpcFallback = false
  let publicRpcFallbackReason: string | null = null
  let rpcReady = true

  const usePublicFallback = (reason: string, blocker: SolanaRuntimeBlocker): void => {
    rpcEndpoint = publicEndpoint
    isPublicRpc = true
    isPublicRpcFallback = true
    publicRpcFallbackReason = reason
    rpcReady = false
    blockers.push(blocker)
    warnings.push({ code: 'public-rpc-fallback', message: reason })
  }

  if (settings.cluster === 'localnet') {
    rpcLabel = 'Local validator'
    rpcEndpoint = PUBLIC_LOCALNET_RPC_ENDPOINT
    isPublicRpc = false
  } else if (settings.rpcProvider === 'quicknode') {
    rpcLabel = 'QuickNode'
    if (settings.quicknodeRpcUrl) {
      rpcEndpoint = settings.quicknodeRpcUrl
      isPublicRpc = false
    } else {
      usePublicFallback('QuickNode RPC is selected but no QuickNode endpoint is configured.', {
        code: 'missing-quicknode-url',
        message: 'Add a QuickNode RPC URL before using QuickNode as the Solana runtime provider.',
      })
    }
  } else if (settings.rpcProvider === 'custom') {
    rpcLabel = 'Custom RPC'
    if (settings.customRpcUrl) {
      rpcEndpoint = settings.customRpcUrl
      isPublicRpc = false
    } else {
      usePublicFallback('Custom RPC is selected but no custom endpoint is configured.', {
        code: 'missing-custom-rpc-url',
        message: 'Add a custom RPC URL before using custom RPC as the Solana runtime provider.',
      })
    }
  } else if (settings.rpcProvider === 'helius') {
    rpcLabel = 'Helius'
    if (heliusKey) {
      rpcEndpoint = getHeliusRpcEndpoint(settings.cluster, heliusKey)
      isPublicRpc = false
    } else {
      usePublicFallback('Helius RPC is selected but HELIUS_API_KEY is not configured.', {
        code: 'missing-helius-key',
        message: 'Add a Helius API key before using Helius as the Solana runtime provider.',
      })
    }
  } else {
    rpcLabel = 'Public RPC'
    warnings.push({
      code: 'public-rpc',
      message: 'Public Solana RPC is selected and may rate-limit wallet execution.',
    })
    blockers.push({
      code: 'public-rpc-not-strict',
      message: 'Public RPC is degraded and cannot satisfy strict Solana runtime flows.',
    })
  }

  if (settings.executionMode === 'jito') {
    if (!settings.jitoBlockEngineUrl) {
      blockers.push({
        code: 'jito-missing-url',
        message: 'Add a Jito block engine URL before using Jito execution mode.',
      })
      warnings.push({ code: 'jito-missing-url', message: 'Jito execution is selected but no block engine URL is configured.' })
    }
    if (settings.cluster !== 'mainnet-beta') {
      warnings.push({ code: 'jito-non-mainnet', message: 'Jito execution is a mainnet-oriented transport; devnet/localnet flows should use RPC execution.' })
    }
    if (isPublicRpc) {
      warnings.push({ code: 'jito-public-rpc', message: 'Jito submission is enabled while reads still use public RPC.' })
    }
  }

  if (opts.warnOnPublicFallback && (isPublicRpcFallback || settings.rpcProvider === 'public')) {
    warnPublicRpcFallback(publicRpcFallbackReason ?? 'Public Solana RPC is selected.', rpcEndpoint)
  }

  const jitoReady =
    settings.executionMode !== 'jito'
    || (
      settings.cluster === 'mainnet-beta'
      && Boolean(settings.jitoBlockEngineUrl)
      && !isPublicRpc
    )

  return {
    cluster: settings.cluster,
    rpcProvider: settings.rpcProvider,
    rpcLabel,
    rpcEndpoint,
    rpcReady,
    heliusReady: Boolean(heliusKey),
    jupiterReady: Boolean(jupiterKey),
    isPublicRpc,
    isPublicRpcFallback,
    publicRpcFallbackReason,
    executionMode: settings.executionMode,
    jitoBlockEngineUrl: settings.jitoBlockEngineUrl,
    jitoReady,
    preferredWallet: settings.preferredWallet,
    warnings,
    blockers,
  }
}

export function getRpcEndpoint(): string {
  return resolveSolanaRuntimeConfig({ warnOnPublicFallback: true }).rpcEndpoint
}

export function getConnection(): Connection {
  return new Connection(getRpcEndpoint(), 'confirmed')
}

export function getConnectionStrict(): Connection {
  const runtime = resolveSolanaRuntimeConfig({ warnOnPublicFallback: true })
  if (!runtime.rpcReady || runtime.isPublicRpc) {
    const blocker = runtime.blockers.find((item) => (
      item.code === 'missing-helius-key'
      || item.code === 'missing-quicknode-url'
      || item.code === 'missing-custom-rpc-url'
      || item.code === 'public-rpc-not-strict'
    ))
    throw new Error(blocker?.message ?? 'Configured Solana RPC provider is not ready.')
  }
  return new Connection(runtime.rpcEndpoint, 'confirmed')
}

export function getTransactionSubmissionSettings(): SolanaTransactionSubmissionSettings {
  const runtime = resolveSolanaRuntimeConfig()
  return {
    mode: runtime.executionMode,
    jitoBlockEngineUrl: runtime.jitoBlockEngineUrl,
  }
}

function warnPublicRpcFallback(reason: string, endpoint: string): void {
  if (publicRpcFallbackWarned) return
  publicRpcFallbackWarned = true
  const message = 'Using public Solana RPC fallback. Public RPC is aggressively rate limited; configure Helius, QuickNode, or a custom RPC for wallet execution.'
  LogService.warn('SolanaService', message, { reason, endpoint })
}

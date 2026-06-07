import {
  resolveSolanaRuntimeConfig,
  type SolanaRuntimeConfig,
} from './SolanaRuntimeConfigService'

export type RuntimeStatusLevel = 'live' | 'partial' | 'setup'

export interface SolanaExecutionCoverageItem {
  id: 'wallet-sends' | 'jupiter-swaps' | 'launch-adapters' | 'pumpfun' | 'recovery'
  label: string
  status: RuntimeStatusLevel
  detail: string
}

export interface SolanaRuntimeStatusSummary {
  cluster: 'devnet' | 'mainnet-beta' | 'localnet'
  rpc: {
    label: string
    detail: string
    status: RuntimeStatusLevel
  }
  walletPath: {
    label: string
    detail: string
    status: RuntimeStatusLevel
  }
  swapEngine: {
    label: string
    detail: string
    status: RuntimeStatusLevel
  }
  executionBackend: {
    label: string
    detail: string
    status: RuntimeStatusLevel
  }
  executionCoverage: SolanaExecutionCoverageItem[]
  troubleshooting: string[]
}

export function getSolanaRuntimeStatus(): SolanaRuntimeStatusSummary {
  const runtime = resolveSolanaRuntimeConfig()
  const jupiterConfigured = runtime.jupiterReady
  const rpcStatus: RuntimeStatusLevel = runtime.cluster === 'localnet'
    ? 'partial'
    : !runtime.rpcReady
      ? 'setup'
      : runtime.isPublicRpc
        ? 'partial'
        : 'live'
  const rpcDetail = getRpcDetail(runtime)
  const strictRpcReady = runtime.rpcReady && !runtime.isPublicRpc
  const executionBackendStatus = getExecutionBackendStatus(runtime, strictRpcReady)
  const walletSendStatus: RuntimeStatusLevel = strictRpcReady
    ? 'live'
    : runtime.rpcReady
      ? 'partial'
      : 'setup'
  const pumpfunStatus = walletSendStatus

  return {
    cluster: runtime.cluster,
    rpc: {
      label: `${runtime.rpcLabel} · ${runtime.cluster}`,
      detail: rpcDetail,
      status: rpcStatus,
    },
    walletPath: getWalletPathStatus(runtime.preferredWallet),
    swapEngine: {
      label: 'Jupiter',
      detail: jupiterConfigured
        ? 'Quotes are available and swaps use Jupiter managed order/execute transport.'
        : 'Add a Jupiter API key in Wallet settings to enable quotes and execution.',
      status: jupiterConfigured ? 'partial' : 'setup',
    },
    executionBackend: {
      label: runtime.executionMode === 'jito' ? 'DAEMON Jito submission preference' : 'DAEMON transaction executor',
      detail: runtime.executionMode === 'jito'
        ? getJitoDetail(runtime)
        : 'DAEMON-controlled SOL/SPL sends and executor-compatible adapter transactions use the RPC executor. Jupiter swaps and SDK adapter fallbacks use managed transports.',
      status: executionBackendStatus,
    },
    executionCoverage: [
      {
        id: 'wallet-sends',
        label: 'Wallet Sends',
        status: walletSendStatus,
        detail: strictRpcReady
          ? 'SOL and SPL transfers use the shared executor with strict runtime RPC.'
          : runtime.rpcReady
            ? 'SOL and SPL transfers are wired to the shared executor, but the selected RPC is degraded for writes.'
            : 'Wallet sends are blocked until the selected RPC provider is configured.',
      },
      {
        id: 'jupiter-swaps',
        label: 'Jupiter Swaps',
        status: jupiterConfigured ? 'partial' : 'setup',
        detail: jupiterConfigured
          ? 'Jupiter API key is configured; swaps use Jupiter order/execute transport outside the shared DAEMON executor.'
          : 'Waiting on a Jupiter API key before the shared swap path is fully live.',
      },
      {
        id: 'launch-adapters',
        label: 'Launch Adapters',
        status: 'partial',
        detail: 'Pump.fun uses the shared instruction executor when strict RPC is ready. Raydium and Meteora are config-gated and SDK fallbacks are marked sdk-adapter.',
      },
      {
        id: 'pumpfun',
        label: 'Pump.fun',
        status: pumpfunStatus,
        detail: strictRpcReady
          ? 'Pump.fun token creation and trade actions follow the shared instruction executor.'
          : runtime.rpcReady
            ? 'Pump.fun adapter is wired, but write execution is degraded until strict RPC is configured.'
            : 'Pump.fun write actions need a configured strict RPC provider.',
      },
      {
        id: 'recovery',
        label: 'Recovery',
        status: 'partial',
        detail: 'Recovery close/sweep transactions route through strict runtime and signer guard; destructive burn previews remain disabled.',
      },
    ],
    troubleshooting: [
      ...runtime.blockers.map((blocker) => blocker.message),
      !jupiterConfigured ? 'Jupiter is the active swap engine but no Jupiter API key is stored, so quotes and swaps will fail until configured.' : null,
      ...runtime.warnings.map((warning) => warning.message),
    ].filter(Boolean) as string[],
  }
}

function getRpcDetail(runtime: SolanaRuntimeConfig): string {
  if (!runtime.rpcReady) {
    const blocker = runtime.blockers.find((item) => (
      item.code === 'missing-helius-key'
      || item.code === 'missing-quicknode-url'
      || item.code === 'missing-custom-rpc-url'
    ))
    return blocker?.message ?? runtime.publicRpcFallbackReason ?? 'RPC provider setup is incomplete.'
  }
  if (runtime.rpcProvider === 'helius' && runtime.heliusReady) {
    return `Helius key connected on ${runtime.cluster}`
  }
  return runtime.rpcEndpoint
}

function getExecutionBackendStatus(runtime: SolanaRuntimeConfig, strictRpcReady: boolean): RuntimeStatusLevel {
  if (runtime.executionMode === 'jito') {
    if (!runtime.jitoBlockEngineUrl) return 'setup'
    return runtime.jitoReady ? 'partial' : 'partial'
  }
  if (strictRpcReady) return 'live'
  return runtime.rpcReady ? 'partial' : 'setup'
}

function getJitoDetail(runtime: SolanaRuntimeConfig): string {
  if (!runtime.jitoBlockEngineUrl) {
    return 'Jito execution is selected, but no Jito block engine URL is configured.'
  }
  return `DAEMON can submit eligible signed transactions through the configured Jito endpoint where supported. Jupiter swaps and SDK adapter fallbacks use managed transports. ${runtime.jitoBlockEngineUrl}`
}

function getWalletPathStatus(preferredWallet: SolanaRuntimeConfig['preferredWallet']): SolanaRuntimeStatusSummary['walletPath'] {
  if (preferredWallet === 'solflare') {
    return {
      label: 'Solflare',
      detail: 'Prefer Solflare Wallet SDK for DAEMON wallet connection, with Wallet Adapter guidance for generated apps.',
      status: 'live',
    }
  }

  if (preferredWallet === 'wallet-standard') {
    return {
      label: 'Wallet Standard',
      detail: 'Prefer the multi-wallet compatibility path for Backpack, Solflare, Phantom, and other Wallet Standard clients.',
      status: 'live',
    }
  }

  return {
    label: 'Phantom-first',
    detail: 'Optimize flows for Phantom Connect, with Solana wallet UX anchored around Phantom-first handoff.',
    status: 'live',
  }
}

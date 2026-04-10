import { getWalletInfrastructureSettings } from './SettingsService'
import { hasHeliusKey, hasJupiterKey } from './WalletService'

export type RuntimeStatusLevel = 'live' | 'partial' | 'setup'

export interface SolanaExecutionCoverageItem {
  id: 'wallet-sends' | 'jupiter-swaps' | 'launch-adapters' | 'pumpfun' | 'recovery'
  label: string
  status: RuntimeStatusLevel
  detail: string
}

export interface SolanaRuntimeStatusSummary {
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
  const settings = getWalletInfrastructureSettings()
  const heliusConfigured = hasHeliusKey()
  const jupiterConfigured = hasJupiterKey()

  const rpcLabel = settings.rpcProvider === 'quicknode'
    ? 'QuickNode'
    : settings.rpcProvider === 'custom'
      ? 'Custom RPC'
      : settings.rpcProvider === 'public'
        ? 'Public RPC'
        : 'Helius'

  const rpcStatus: RuntimeStatusLevel =
    settings.rpcProvider === 'helius'
      ? heliusConfigured ? 'live' : 'setup'
      : settings.rpcProvider === 'public'
        ? 'partial'
        : 'live'

  const rpcDetail = settings.rpcProvider === 'quicknode'
    ? settings.quicknodeRpcUrl || 'QuickNode endpoint not set'
    : settings.rpcProvider === 'custom'
      ? settings.customRpcUrl || 'Custom endpoint not set'
      : settings.rpcProvider === 'public'
        ? 'https://api.mainnet-beta.solana.com'
        : heliusConfigured
          ? 'Helius key connected'
          : 'Helius key missing'

  const executionBackendStatus: RuntimeStatusLevel =
    settings.executionMode === 'jito'
      ? settings.rpcProvider === 'public' ? 'partial' : 'live'
      : jupiterConfigured ? 'live' : 'partial'

  return {
    rpc: {
      label: rpcLabel,
      detail: rpcDetail,
      status: rpcStatus,
    },
    walletPath: {
      label: settings.preferredWallet === 'phantom' ? 'Phantom-first' : 'Wallet Standard',
      detail: settings.preferredWallet === 'phantom'
        ? 'Optimize flows for Phantom Connect, with Solana wallet UX anchored around Phantom-first handoff.'
        : 'Prefer the multi-wallet compatibility path for Backpack, Solflare, and other Wallet Standard clients.',
      status: 'live',
    },
    swapEngine: {
      label: 'Jupiter',
      detail: jupiterConfigured
        ? 'Quotes and swap execution are live through the Jupiter API.'
        : 'Add a Jupiter API key in Wallet settings to enable quotes and execution.',
      status: jupiterConfigured ? 'live' : 'setup',
    },
    executionBackend: {
      label: settings.executionMode === 'jito' ? 'Shared Jito executor' : 'Shared RPC executor',
      detail: settings.executionMode === 'jito'
        ? `DAEMON routes wallet sends, swaps, launches, and recovery flows through the Jito-backed executor. ${settings.jitoBlockEngineUrl}`
        : 'DAEMON routes wallet sends, swaps, launches, Pump.fun actions, and recovery flows through one shared RPC executor with shared confirmation behavior.',
      status: executionBackendStatus,
    },
    executionCoverage: [
      {
        id: 'wallet-sends',
        label: 'Wallet Sends',
        status: 'live',
        detail: 'SOL and SPL transfers already use the shared executor.',
      },
      {
        id: 'jupiter-swaps',
        label: 'Jupiter Swaps',
        status: jupiterConfigured ? 'live' : 'setup',
        detail: jupiterConfigured
          ? 'Quotes and signed swap transactions flow through the same runtime.'
          : 'Waiting on a Jupiter API key before the shared swap path is fully live.',
      },
      {
        id: 'launch-adapters',
        label: 'Launch Adapters',
        status: 'live',
        detail: 'Raydium and Meteora launch flows now submit through the shared executor.',
      },
      {
        id: 'pumpfun',
        label: 'Pump.fun',
        status: 'live',
        detail: 'Pump.fun token creation and trade actions now follow the shared instruction executor.',
      },
      {
        id: 'recovery',
        label: 'Recovery',
        status: 'live',
        detail: 'Recovery transactions now inherit the common execution path with recovery-specific send overrides.',
      },
    ],
    troubleshooting: [
      settings.rpcProvider === 'helius' && !heliusConfigured ? 'Helius is selected but no Helius API key is stored. Wallet reads will degrade to non-Helius behavior where possible.' : null,
      settings.rpcProvider === 'quicknode' && !settings.quicknodeRpcUrl ? 'QuickNode is selected but the endpoint is blank. Add a QuickNode RPC URL before using this stack.' : null,
      settings.rpcProvider === 'custom' && !settings.customRpcUrl ? 'Custom RPC is selected but no RPC URL is configured.' : null,
      !jupiterConfigured ? 'Jupiter is the active swap engine but no Jupiter API key is stored, so quotes and swaps will fail until configured.' : null,
      settings.executionMode === 'jito' && settings.rpcProvider === 'public' ? 'Jito submission is enabled while reads still use public RPC. For tighter landing and confirmation behavior, pair Jito with Helius or QuickNode.' : null,
    ].filter(Boolean) as string[],
  }
}

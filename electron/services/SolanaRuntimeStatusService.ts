import { getWalletInfrastructureSettings } from './SettingsService'
import { hasHeliusKey, hasJupiterKey } from './WalletService'
import type {
  SolanaRuntimeExecutionPath,
  SolanaRuntimePreflightCheck,
  SolanaRuntimeStatusLevel,
  SolanaRuntimeStatusSummary,
} from '../shared/solanaRuntime'

export type {
  SolanaExecutionCoverageItem,
  SolanaRuntimeExecutionPath,
  SolanaRuntimePreflight,
  SolanaRuntimePreflightCheck,
  SolanaRuntimeStatusLevel,
  SolanaRuntimeStatusSummary,
  SolanaRuntimeUseCase,
} from '../shared/solanaRuntime'

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

  const quicknodeReady = settings.quicknodeRpcUrl.trim().length > 0
  const customReady = settings.customRpcUrl.trim().length > 0
  const jitoReady = settings.executionMode === 'rpc' || settings.jitoBlockEngineUrl.trim().length > 0

  const rpcStatus: SolanaRuntimeStatusLevel =
    settings.rpcProvider === 'helius'
      ? heliusConfigured ? 'live' : 'setup'
      : settings.rpcProvider === 'public'
        ? 'partial'
        : settings.rpcProvider === 'quicknode'
          ? quicknodeReady ? 'live' : 'setup'
          : customReady ? 'live' : 'setup'

  const rpcDetail = settings.rpcProvider === 'quicknode'
    ? settings.quicknodeRpcUrl || 'QuickNode endpoint not set'
    : settings.rpcProvider === 'custom'
      ? settings.customRpcUrl || 'Custom endpoint not set'
      : settings.rpcProvider === 'public'
        ? 'https://api.mainnet-beta.solana.com'
        : heliusConfigured
          ? 'Helius key connected'
          : 'Helius key missing'

  const executionBackendStatus: SolanaRuntimeStatusLevel =
    settings.executionMode === 'jito'
      ? !jitoReady ? 'setup' : settings.rpcProvider === 'public' ? 'partial' : 'live'
      : rpcStatus

  const executionBackendDetail = settings.executionMode === 'jito'
    ? jitoReady
      ? `DAEMON routes wallet sends, swaps, launches, and recovery flows through the Jito-backed executor. ${settings.jitoBlockEngineUrl}`
      : 'Jito execution is selected, but the block-engine URL is blank.'
    : rpcStatus === 'setup'
      ? `${rpcLabel} is selected for submission, but the RPC provider is not configured.`
      : 'DAEMON routes wallet sends, swaps, launches, Pump.fun actions, and recovery flows through one shared RPC executor with shared confirmation behavior.'

  const executionPath: SolanaRuntimeExecutionPath = settings.executionMode === 'jito'
    ? {
        mode: 'jito',
        label: 'Jito block-engine submission',
        detail: jitoReady
          ? `${rpcLabel} handles reads and transaction construction; signed transactions submit through ${settings.jitoBlockEngineUrl}.`
          : `${rpcLabel} handles reads and transaction construction, but Jito submission needs a block-engine URL.`,
        submitter: settings.jitoBlockEngineUrl || 'Jito block engine URL not configured',
        confirmation: 'DAEMON still confirms signatures against the configured RPC connection after Jito submission.',
      }
    : {
        mode: 'rpc',
        label: 'Standard RPC submission',
        detail: `${rpcLabel} handles reads, transaction construction, submission, and confirmation.`,
        submitter: rpcDetail,
        confirmation: 'DAEMON confirms signatures through the shared RPC connection.',
      }

  const preflightChecks: SolanaRuntimePreflightCheck[] = [
    {
      id: 'rpc-provider',
      label: 'RPC provider',
      status: rpcStatus,
      detail: rpcStatus === 'live'
        ? `${rpcLabel} is ready for reads, transaction construction, and confirmation.`
        : rpcStatus === 'partial'
          ? `${rpcLabel} can work for basic flows, but it is not the preferred production path.`
          : `${rpcLabel} is selected but is missing the configuration DAEMON needs before using that provider.`,
      requiredFor: ['reads', 'sends', 'swaps', 'launches', 'recovery', 'scaffolds'],
    },
    {
      id: 'wallet-path',
      label: 'Wallet signing path',
      status: 'live',
      detail: settings.preferredWallet === 'phantom'
        ? 'Phantom-first signing is the preferred wallet UX for generated apps and wallet handoff.'
        : 'Wallet Standard is the preferred signing abstraction for generated apps and wallet handoff.',
      requiredFor: ['sends', 'swaps', 'launches', 'scaffolds'],
    },
    {
      id: 'swap-api',
      label: 'Jupiter API',
      status: jupiterConfigured ? 'live' : 'setup',
      detail: jupiterConfigured
        ? 'Jupiter quote and swap execution credentials are available.'
        : 'Add a Jupiter API key before requesting quotes or executing swaps.',
      requiredFor: ['swaps', 'scaffolds'],
    },
    {
      id: 'execution-backend',
      label: 'Execution backend',
      status: executionBackendStatus,
      detail: executionBackendDetail,
      requiredFor: ['sends', 'swaps', 'launches', 'recovery', 'scaffolds'],
    },
  ]

  const blockers = preflightChecks
    .filter((check) => check.status === 'setup')
    .map((check) => check.detail)

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
      detail: executionBackendDetail,
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
      settings.executionMode === 'jito' && !jitoReady ? 'Jito execution is enabled but the block-engine URL is blank.' : null,
      settings.executionMode === 'jito' && settings.rpcProvider === 'public' ? 'Jito submission is enabled while reads still use public RPC. For tighter landing and confirmation behavior, pair Jito with Helius or QuickNode.' : null,
    ].filter(Boolean) as string[],
    preflight: {
      ready: blockers.length === 0,
      checks: preflightChecks,
      blockers,
    },
    executionPath,
  }
}

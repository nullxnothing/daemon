import { getWalletInfrastructureSettings } from './SettingsService'
import { hasHeliusKey, hasJupiterKey } from './WalletService'
import { detectToolchain } from './ValidatorManager'

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
  environmentDiagnostics: SolanaEnvironmentDiagnosticItem[]
  executionCoverage: SolanaExecutionCoverageItem[]
  troubleshooting: string[]
}

export interface SolanaEnvironmentDiagnosticItem {
  id: 'solana-cli' | 'anchor' | 'avm' | 'surfpool' | 'litesvm'
  label: string
  status: RuntimeStatusLevel
  detail: string
  action: string
}

export function getSolanaRuntimeStatus(projectPath?: string): SolanaRuntimeStatusSummary {
  const settings = getWalletInfrastructureSettings()
  const heliusConfigured = hasHeliusKey()
  const jupiterConfigured = hasJupiterKey()
  const toolchain = detectToolchain(projectPath)

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

  const environmentDiagnostics: SolanaEnvironmentDiagnosticItem[] = [
    {
      id: 'solana-cli',
      label: 'Solana CLI',
      status: toolchain.solanaCli.installed ? 'live' : 'setup',
      detail: toolchain.solanaCli.installed
        ? toolchain.solanaCli.version || 'Installed and available on PATH.'
        : 'Missing from PATH. DAEMON cannot rely on local validator, keygen, or account tooling until the Solana CLI is installed.',
      action: toolchain.solanaCli.installed
        ? 'CLI is ready.'
        : 'Install the Solana CLI and make `solana` available on PATH.',
    },
    {
      id: 'anchor',
      label: 'Anchor',
      status: toolchain.anchor.installed ? 'live' : 'setup',
      detail: toolchain.anchor.installed
        ? toolchain.anchor.version || 'Installed and available on PATH.'
        : toolchain.avm.installed
          ? 'AVM is installed, but `anchor` is not currently available on PATH.'
          : 'Missing from PATH. Anchor program build, test, and deploy flows are not locally available.',
      action: toolchain.anchor.installed
        ? 'Anchor CLI is ready.'
        : toolchain.avm.installed
          ? 'Use AVM to install and select an Anchor version for this machine.'
          : 'Install Anchor or AVM before relying on DAEMON for Anchor program workflows.',
    },
    {
      id: 'avm',
      label: 'AVM',
      status: toolchain.avm.installed ? 'live' : toolchain.anchor.installed ? 'partial' : 'setup',
      detail: toolchain.avm.installed
        ? toolchain.avm.version || 'Installed and available on PATH.'
        : toolchain.anchor.installed
          ? 'Anchor is installed directly, but AVM is missing so toolchain pinning and version switching are not yet available.'
          : 'Missing from PATH. DAEMON cannot lean on AVM-managed Anchor version pinning yet.',
      action: toolchain.avm.installed
        ? 'AVM is ready.'
        : 'Install AVM so DAEMON can recommend pinned Anchor toolchains instead of machine-global assumptions.',
    },
    {
      id: 'surfpool',
      label: 'Surfpool',
      status: toolchain.surfpool.installed ? 'live' : toolchain.testValidator.installed ? 'partial' : 'setup',
      detail: toolchain.surfpool.installed
        ? toolchain.surfpool.version || 'Installed and available on PATH.'
        : toolchain.testValidator.installed
          ? `Falling back to ${toolchain.testValidator.version || 'solana-test-validator'}. Local validation exists, but forked and faster Surfpool workflows are not installed.`
          : 'Neither Surfpool nor solana-test-validator is available on PATH, so local validator workflows are blocked.',
      action: toolchain.surfpool.installed
        ? 'Surfpool is ready.'
        : toolchain.testValidator.installed
          ? 'Install Surfpool if you want forked-validator and faster local-debug flows inside DAEMON.'
          : 'Install Surfpool or at minimum `solana-test-validator` to enable local execution workflows.',
    },
    {
      id: 'litesvm',
      label: 'LiteSVM',
      status: toolchain.litesvm.installed ? 'live' : projectPath ? 'setup' : 'partial',
      detail: toolchain.litesvm.installed
        ? 'Detected in the active project test/tooling dependencies.'
        : projectPath
          ? 'Not detected in the active project. Fast project-local execution tests are not configured yet.'
          : 'Project context is not loaded, so DAEMON cannot tell whether LiteSVM is configured for this workspace.',
      action: toolchain.litesvm.installed
        ? 'LiteSVM is ready.'
        : projectPath
          ? 'Add LiteSVM to the active project if you want fast Solana test execution from DAEMON.'
          : 'Open a project so DAEMON can inspect whether LiteSVM is configured.',
    },
  ]

  const environmentWarnings = environmentDiagnostics
    .filter((item) => item.status !== 'live')
    .map((item) => item.action)

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
    environmentDiagnostics,
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
      ...environmentWarnings,
    ].filter(Boolean) as string[],
  }
}

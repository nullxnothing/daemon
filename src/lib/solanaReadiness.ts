export interface SolanaRouteReadinessItem {
  key: string
  label: string
  ready: boolean
  detail: string
}

export interface SolanaRouteNextAction {
  id: 'open-project' | 'open-wallet' | 'set-main-wallet' | 'assign-project' | 'set-preferred-wallet' | 'open-infrastructure' | 'preview-transaction' | 'transact'
  label: string
  detail: string
}

export interface SolanaRouteReadinessModel {
  headline: string
  description: string
  items: SolanaRouteReadinessItem[]
  nextAction: SolanaRouteNextAction
  readyCount: number
  totalCount: number
  walletLabel: string
  signingPathLabel: string
}

export type SolanaReadinessStatus = 'ready' | 'warning' | 'missing' | 'blocked' | 'info'

export type SolanaReadinessActionTarget = 'wallet' | 'settings' | 'validator' | 'debug' | 'starter' | 'project' | 'connect'

export interface SolanaReadinessItem {
  id: 'project' | 'wallet' | 'signer' | 'rpc' | 'cluster' | 'jupiter' | 'validator' | 'toolchain'
  label: string
  status: SolanaReadinessStatus
  value: string
  detail: string
  action?: {
    label: string
    target: SolanaReadinessActionTarget
  }
}

export interface SolanaToolboxReadinessModel {
  headline: string
  description: string
  readyCount: number
  totalCount: number
  items: SolanaReadinessItem[]
  nextAction: SolanaReadinessItem['action'] | null
}

interface SolanaToolboxReadinessInput {
  activeProjectPath: string | null
  projectInfo: {
    isSolanaProject: boolean
    framework: 'anchor' | 'native' | 'client-only' | null
    diagnostics?: { status: 'ready' | 'warning' | 'missing'; issueCount: number }
  } | null
  toolchain: {
    solanaCli: { installed: boolean; version: string | null }
    anchor: { installed: boolean; version: string | null }
    surfpool: { installed: boolean; version: string | null }
    testValidator: { installed: boolean; version: string | null }
  } | null
  validator: {
    type: 'surfpool' | 'test-validator' | null
    status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping'
    port: number | null
  }
  mcps: Array<{ enabled: boolean }>
  settings: WalletInfrastructureSettings | null
  activeWallet: { id: string; name: string; address: string } | null
  signerReady: boolean | null
  hasHeliusKey: boolean
  hasJupiterKey: boolean
  isLoadingRuntime: boolean
  runtimeError: string | null
}

interface BuildSolanaRouteReadinessInput {
  walletPresent: boolean
  walletName?: string | null
  walletAddress?: string | null
  isMainWallet: boolean
  signerReady: boolean
  hasActiveProject: boolean
  projectAssigned: boolean
  preferredWallet: WalletInfrastructureSettings['preferredWallet']
  executionMode: WalletInfrastructureSettings['executionMode']
  rpcLabel: string
  rpcReady: boolean
  requirePreferredWallet?: boolean
  requiredPreferredWallet?: WalletInfrastructureSettings['preferredWallet']
}

export function buildSolanaToolboxReadiness(input: SolanaToolboxReadinessInput): SolanaToolboxReadinessModel {
  const items: SolanaReadinessItem[] = [
    getProjectItem(input),
    getWalletItem(input),
    getSignerItem(input),
    getRpcItem(input),
    getClusterItem(input),
    getJupiterItem(input),
    getValidatorItem(input),
    getToolchainItem(input),
  ]

  const nextAction = items.find((item) => item.action && item.status !== 'ready')?.action ?? null
  const readyCount = items.filter((item) => item.status === 'ready').length

  return {
    headline: nextAction ? `Next: ${nextAction.label}` : 'Solana workspace is ready',
    description: nextAction
      ? items.find((item) => item.action === nextAction)?.detail ?? 'Resolve the highlighted setup item before running write actions.'
      : 'Project, signer, RPC, validator, and toolchain checks are aligned for the selected workflow.',
    readyCount,
    totalCount: items.length,
    items,
    nextAction,
  }
}

export function buildSolanaRouteReadiness(input: BuildSolanaRouteReadinessInput): SolanaRouteReadinessModel {
  const requiredPreferredWallet = input.requiredPreferredWallet ?? 'phantom'
  const preferredWalletReady = input.requirePreferredWallet ? input.preferredWallet === requiredPreferredWallet : true
  const preferredWalletDetail = getPreferredWalletDetail(input.preferredWallet)

  const items: SolanaRouteReadinessItem[] = [
    {
      key: 'main-wallet',
      label: 'Default wallet route',
      ready: input.walletPresent && input.isMainWallet,
      detail: input.walletPresent
        ? input.isMainWallet
          ? `${input.walletName ?? 'Wallet'} is the default route for sends, swaps, launches, and previews.`
          : `${input.walletName ?? 'Wallet'} exists, but it is not the default route yet.`
        : 'Create or import one DAEMON wallet before configuring generated app wallet defaults.',
    },
    {
      key: 'signer',
      label: 'Signer ready',
      ready: input.walletPresent && input.signerReady,
      detail: input.walletPresent
        ? input.signerReady
          ? 'This wallet route can sign follow-up sends, swaps, launches, and transaction previews.'
          : 'This wallet is watch-only. Import or generate the signer before expecting wallet-backed actions to work.'
        : 'Create a wallet first; signer readiness is checked after the wallet route exists.',
    },
    {
      key: 'project',
      label: 'Project assignment',
      ready: input.hasActiveProject ? input.projectAssigned : true,
      detail: input.hasActiveProject
        ? input.projectAssigned
          ? 'The active project uses this wallet route by default.'
          : 'Bind this wallet to the active project so DAEMON does not guess during Solana actions.'
        : 'No active project is selected, so project assignment is optional.',
    },
    {
      key: 'provider',
      label: 'RPC + wallet default',
      ready: input.rpcReady && preferredWalletReady,
      detail: `${input.rpcLabel} • ${input.executionMode === 'jito' ? 'Jito relay' : 'Standard RPC'} • ${preferredWalletDetail}`,
    },
  ]

  const nextAction: SolanaRouteNextAction = !input.walletPresent
    ? {
      id: 'open-wallet',
      label: 'Create or import wallet',
      detail: 'Start with one DAEMON wallet so Solana actions have a concrete route to configure.',
    }
    : !input.isMainWallet
      ? {
        id: 'set-main-wallet',
        label: 'Make this the main wallet',
        detail: 'Promote the available wallet so sends, swaps, launches, and previews use one obvious route.',
      }
      : !input.signerReady
        ? {
          id: 'open-wallet',
          label: 'Add wallet signer',
          detail: 'Import or generate the signer so the wallet can move beyond read-only checks.',
        }
        : input.hasActiveProject && !input.projectAssigned
          ? {
            id: 'assign-project',
            label: 'Use wallet for current project',
            detail: 'Bind the wallet to the active project so Solana workflows use the right signer path by default.',
          }
          : !input.rpcReady
            ? {
              id: 'open-infrastructure',
              label: 'Configure RPC path',
              detail: 'Finish the RPC provider setup before using wallet-backed Solana execution.',
            }
            : input.requirePreferredWallet && input.preferredWallet !== requiredPreferredWallet
              ? {
                id: 'set-preferred-wallet',
                label: `Set ${getPreferredWalletLabel(requiredPreferredWallet)}`,
                detail: `Make ${getPreferredWalletLabel(requiredPreferredWallet)} the preferred wallet default for generated app scaffolds.`,
              }
              : {
                id: input.requirePreferredWallet ? 'preview-transaction' : 'transact',
                label: input.requirePreferredWallet ? 'Preview signing flow' : 'Move funds',
                detail: input.requirePreferredWallet
                  ? 'Generate a safe transaction preview so the signing path is visible before anything is sent.'
                  : 'The wallet route is ready. Move into sends, swaps, or holdings next.',
              }

  const headline = nextAction.id === 'open-wallet'
    ? input.walletPresent
      ? 'Add a signer before this wallet can act'
      : 'Create or import a wallet first'
    : nextAction.id === 'set-main-wallet'
      ? 'Promote this wallet to the main route'
      : nextAction.id === 'assign-project'
        ? 'Route this wallet into the current project'
        : nextAction.id === 'open-infrastructure'
          ? 'Finish the execution path before sending'
          : nextAction.id === 'set-preferred-wallet'
            ? `Switch generated app defaults to ${getPreferredWalletLabel(requiredPreferredWallet)}`
            : nextAction.id === 'preview-transaction'
              ? `${getPreferredWalletLabel(requiredPreferredWallet)} route is ready for a safe first preview`
              : 'Wallet route is ready for Solana actions'

  const description = nextAction.detail
  const readyCount = items.filter((item) => item.ready).length
  const walletLabel = input.walletPresent
    ? `${input.walletName ?? 'Wallet'} • ${input.walletAddress ?? 'address pending'}`
    : 'No wallet configured'
  const signingPathLabel = getPreferredWalletLabel(input.preferredWallet)

  return {
    headline,
    description,
    items,
    nextAction,
    readyCount,
    totalCount: items.length,
    walletLabel,
    signingPathLabel,
  }
}

function getProjectItem(input: SolanaToolboxReadinessInput): SolanaReadinessItem {
  if (!input.activeProjectPath) {
    return {
      id: 'project',
      label: 'Project',
      status: 'missing',
      value: 'Missing',
      detail: 'Open or create a project before running Solana diagnostics.',
      action: { label: 'Open starter', target: 'starter' },
    }
  }

  if (!input.projectInfo) {
    return {
      id: 'project',
      label: 'Project',
      status: 'info',
      value: 'Diagnostics',
      detail: 'Project detection is still checking Anchor, native, and client-only indicators.',
      action: { label: 'Check project', target: 'project' },
    }
  }

  if (!input.projectInfo.isSolanaProject) {
    return {
      id: 'project',
      label: 'Project',
      status: 'warning',
      value: 'Non-Solana',
      detail: 'No Anchor.toml, Solana program manifest, or Solana client dependency was detected.',
      action: { label: 'Open starter', target: 'starter' },
    }
  }

  const diagnostics = input.projectInfo.diagnostics
  if (diagnostics?.status === 'missing') {
    return {
      id: 'project',
      label: 'Project',
      status: 'blocked',
      value: `${diagnostics.issueCount} issue${diagnostics.issueCount === 1 ? '' : 's'}`,
      detail: 'Project diagnostics found missing program metadata or deploy inputs.',
      action: { label: 'Review diagnostics', target: 'debug' },
    }
  }

  if (diagnostics?.status === 'warning') {
    return {
      id: 'project',
      label: 'Project',
      status: 'warning',
      value: `${diagnostics.issueCount} warning${diagnostics.issueCount === 1 ? '' : 's'}`,
      detail: 'Project diagnostics are usable, but there are checks to review before deploys.',
      action: { label: 'Review diagnostics', target: 'debug' },
    }
  }

  return {
    id: 'project',
    label: 'Project',
    status: 'ready',
    value: input.projectInfo.framework ? getFrameworkLabel(input.projectInfo.framework) : 'Solana',
    detail: 'Solana project detection is ready.',
  }
}

function getWalletItem(input: SolanaToolboxReadinessInput): SolanaReadinessItem {
  if (input.isLoadingRuntime) {
    return {
      id: 'wallet',
      label: 'Wallet',
      status: 'info',
      value: 'Checking',
      detail: 'Wallet route is loading.',
    }
  }

  if (!input.activeWallet) {
    return {
      id: 'wallet',
      label: 'Wallet',
      status: 'missing',
      value: 'Missing',
      detail: 'Create or import a wallet before running sends, swaps, launches, or recovery.',
      action: { label: 'Open wallet', target: 'wallet' },
    }
  }

  return {
    id: 'wallet',
    label: 'Wallet',
    status: 'ready',
    value: input.activeWallet.name,
    detail: input.activeWallet.address,
  }
}

function getSignerItem(input: SolanaToolboxReadinessInput): SolanaReadinessItem {
  if (!input.activeWallet) {
    return {
      id: 'signer',
      label: 'Signer',
      status: 'missing',
      value: 'No wallet',
      detail: 'Signer readiness is checked after a wallet route exists.',
      action: { label: 'Open wallet', target: 'wallet' },
    }
  }

  if (input.signerReady === null) {
    return {
      id: 'signer',
      label: 'Signer',
      status: 'info',
      value: 'Checking',
      detail: 'DAEMON is checking whether the selected wallet can sign locally.',
    }
  }

  if (!input.signerReady) {
    return {
      id: 'signer',
      label: 'Signer',
      status: 'blocked',
      value: 'Watch-only',
      detail: 'This wallet cannot sign write actions until a keypair is imported or generated.',
      action: { label: 'Add signer', target: 'wallet' },
    }
  }

  return {
    id: 'signer',
    label: 'Signer',
    status: 'ready',
    value: 'Local keypair',
    detail: 'Local signing is available for previewed and guarded DAEMON actions.',
  }
}

function getRpcItem(input: SolanaToolboxReadinessInput): SolanaReadinessItem {
  const settings = input.settings
  if (!settings) {
    return {
      id: 'rpc',
      label: 'RPC',
      status: input.runtimeError ? 'blocked' : 'info',
      value: input.runtimeError ? 'Error' : 'Checking',
      detail: input.runtimeError ?? 'Runtime settings are loading.',
      action: { label: 'Open settings', target: 'settings' },
    }
  }

  if (settings.cluster === 'localnet') {
    return {
      id: 'rpc',
      label: 'RPC',
      status: 'ready',
      value: 'Localnet',
      detail: 'Localnet RPC is selected; use the validator status before writes.',
    }
  }

  if (settings.rpcProvider === 'public') {
    return {
      id: 'rpc',
      label: 'RPC',
      status: 'warning',
      value: 'Public RPC',
      detail: 'Public RPC is degraded for write-heavy sends, swaps, launches, and recovery.',
      action: { label: 'Configure RPC', target: 'settings' },
    }
  }

  if (settings.rpcProvider === 'helius' && !input.hasHeliusKey) {
    return {
      id: 'rpc',
      label: 'RPC',
      status: 'missing',
      value: 'Helius key',
      detail: 'Helius is selected, but no Helius key is stored.',
      action: { label: 'Add RPC key', target: 'settings' },
    }
  }

  if (settings.rpcProvider === 'quicknode' && !settings.quicknodeRpcUrl.trim()) {
    return {
      id: 'rpc',
      label: 'RPC',
      status: 'missing',
      value: 'QuickNode URL',
      detail: 'QuickNode is selected, but no endpoint URL is configured.',
      action: { label: 'Add RPC URL', target: 'settings' },
    }
  }

  if (settings.rpcProvider === 'custom' && !settings.customRpcUrl.trim()) {
    return {
      id: 'rpc',
      label: 'RPC',
      status: 'missing',
      value: 'Custom URL',
      detail: 'Custom RPC is selected, but no endpoint URL is configured.',
      action: { label: 'Add RPC URL', target: 'settings' },
    }
  }

  return {
    id: 'rpc',
    label: 'RPC',
    status: 'ready',
    value: getRpcProviderLabel(settings.rpcProvider),
    detail: `${getRpcProviderLabel(settings.rpcProvider)} is configured for ${getClusterLabel(settings.cluster)}.`,
  }
}

function getClusterItem(input: SolanaToolboxReadinessInput): SolanaReadinessItem {
  const cluster = input.settings?.cluster
  if (!cluster) {
    return {
      id: 'cluster',
      label: 'Cluster',
      status: 'info',
      value: 'Checking',
      detail: 'Cluster settings are loading.',
    }
  }

  if (cluster === 'mainnet-beta') {
    return {
      id: 'cluster',
      label: 'Cluster',
      status: 'warning',
      value: 'Mainnet',
      detail: 'Mainnet writes require explicit preview, guard approval, and fee awareness.',
      action: { label: 'Review settings', target: 'settings' },
    }
  }

  return {
    id: 'cluster',
    label: 'Cluster',
    status: 'ready',
    value: getClusterLabel(cluster),
    detail: cluster === 'localnet' ? 'Localnet is selected for local validator workflows.' : 'Devnet is selected for builder workflows.',
  }
}

function getJupiterItem(input: SolanaToolboxReadinessInput): SolanaReadinessItem {
  if (!input.settings) {
    return {
      id: 'jupiter',
      label: 'Jupiter',
      status: 'info',
      value: 'Checking',
      detail: 'Swap provider settings are loading.',
    }
  }

  if (input.hasJupiterKey) {
    return {
      id: 'jupiter',
      label: 'Jupiter',
      status: 'ready',
      value: 'Ready',
      detail: 'Jupiter quote and managed swap routing can use the stored key.',
    }
  }

  return {
    id: 'jupiter',
    label: 'Jupiter',
    status: 'missing',
    value: 'Missing key',
    detail: 'Swaps need a Jupiter key before DAEMON can request reviewed orders.',
    action: { label: 'Add key', target: 'settings' },
  }
}

function getValidatorItem(input: SolanaToolboxReadinessInput): SolanaReadinessItem {
  if (input.validator.status === 'running') {
    return {
      id: 'validator',
      label: 'Validator',
      status: 'ready',
      value: input.validator.type ?? 'Running',
      detail: `Local validator RPC is available on port ${input.validator.port ?? 8899}.`,
    }
  }

  if (input.validator.status === 'starting') {
    return {
      id: 'validator',
      label: 'Validator',
      status: 'info',
      value: 'Starting',
      detail: 'Validator process is starting; DAEMON should only mark it running after RPC health passes.',
    }
  }

  if (input.validator.status === 'error') {
    return {
      id: 'validator',
      label: 'Validator',
      status: 'blocked',
      value: 'Error',
      detail: 'Validator startup failed or health could not be confirmed.',
      action: { label: 'Retry validator', target: 'validator' },
    }
  }

  if (input.validator.status === 'stopping') {
    return {
      id: 'validator',
      label: 'Validator',
      status: 'info',
      value: 'Stopping',
      detail: 'Validator shutdown is in progress.',
    }
  }

  return {
    id: 'validator',
    label: 'Validator',
    status: 'warning',
    value: 'Stopped',
    detail: 'Start Surfpool or solana-test-validator for local program workflows.',
    action: { label: 'Start validator', target: 'validator' },
  }
}

function getToolchainItem(input: SolanaToolboxReadinessInput): SolanaReadinessItem {
  const toolchain = input.toolchain
  if (!toolchain) {
    return {
      id: 'toolchain',
      label: 'Toolchain',
      status: 'info',
      value: 'Checking',
      detail: 'Toolchain status is loading.',
      action: { label: 'Check tools', target: 'debug' },
    }
  }

  if (!toolchain.solanaCli.installed) {
    return {
      id: 'toolchain',
      label: 'Toolchain',
      status: 'blocked',
      value: 'Missing CLI',
      detail: 'Install Solana CLI before building, deploying, or running local validators.',
      action: { label: 'View tools', target: 'debug' },
    }
  }

  const missing = [
    toolchain.anchor.installed ? null : 'Anchor',
    toolchain.surfpool.installed || toolchain.testValidator.installed ? null : 'validator binary',
  ].filter(Boolean)

  if (missing.length > 0) {
    return {
      id: 'toolchain',
      label: 'Toolchain',
      status: 'warning',
      value: 'Partial',
      detail: `Missing ${missing.join(', ')}. Client-only checks can still run.`,
      action: { label: 'View tools', target: 'debug' },
    }
  }

  return {
    id: 'toolchain',
    label: 'Toolchain',
    status: 'ready',
    value: 'Ready',
    detail: 'Solana CLI, Anchor, and a local validator binary are available.',
  }
}

function getFrameworkLabel(framework: 'anchor' | 'native' | 'client-only'): string {
  if (framework === 'anchor') return 'Anchor'
  if (framework === 'native') return 'Native'
  return 'Client-only'
}

function getClusterLabel(cluster: WalletInfrastructureSettings['cluster']): string {
  if (cluster === 'mainnet-beta') return 'Mainnet'
  if (cluster === 'localnet') return 'Localnet'
  return 'Devnet'
}

function getRpcProviderLabel(provider: WalletInfrastructureSettings['rpcProvider']): string {
  if (provider === 'quicknode') return 'QuickNode'
  if (provider === 'custom') return 'Custom RPC'
  if (provider === 'public') return 'Public RPC'
  return 'Helius'
}

function getPreferredWalletLabel(preferredWallet: WalletInfrastructureSettings['preferredWallet']): string {
  if (preferredWallet === 'solflare') return 'Solflare'
  if (preferredWallet === 'wallet-standard') return 'DAEMON Wallet Adapter'
  return 'Phantom-first'
}

function getPreferredWalletDetail(preferredWallet: WalletInfrastructureSettings['preferredWallet']): string {
  if (preferredWallet === 'solflare') {
    return 'Solflare is active for wallet connection; generated app defaults prefer Solflare.'
  }

  if (preferredWallet === 'wallet-standard') {
    return 'DAEMON Wallet Adapter is active for external signing (any wallet, Solflare recommended); local signers remain available for internal execution.'
  }

  return 'Local signer is active; generated app defaults prefer Phantom.'
}

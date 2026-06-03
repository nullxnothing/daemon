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

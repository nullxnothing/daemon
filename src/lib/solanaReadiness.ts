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
}

export function buildSolanaRouteReadiness(input: BuildSolanaRouteReadinessInput): SolanaRouteReadinessModel {
  const preferredWalletReady = input.requirePreferredWallet ? input.preferredWallet === 'phantom' : true
  const preferredWalletDetail = input.preferredWallet === 'phantom'
    ? 'Phantom-first wallet UX is active for transaction review and signing.'
    : 'Wallet Standard is active. Phantom-specific flows are still available, but not preferred.'

  const items: SolanaRouteReadinessItem[] = [
    {
      key: 'main-wallet',
      label: 'Main wallet route',
      ready: input.walletPresent && input.isMainWallet,
      detail: input.walletPresent
        ? input.isMainWallet
          ? `${input.walletName ?? 'Wallet'} is the default route for wallet-backed Solana actions.`
          : `${input.walletName ?? 'Wallet'} is available, but another wallet is still marked as main.`
        : 'No wallet is configured yet.',
    },
    {
      key: 'signer',
      label: 'Signer ready',
      ready: input.walletPresent && input.signerReady,
      detail: input.walletPresent
        ? input.signerReady
          ? 'This wallet can sign sends, swaps, previews, and launch flows.'
          : 'This wallet is watch-only until a signer is imported or generated.'
        : 'A wallet must exist before signer readiness matters.',
    },
    {
      key: 'project',
      label: 'Project assignment',
      ready: input.hasActiveProject ? input.projectAssigned : true,
      detail: input.hasActiveProject
        ? input.projectAssigned
          ? 'The active project already routes through this wallet.'
          : 'The active project is not assigned to this wallet yet.'
        : 'No active project selected, so assignment is optional.',
    },
    {
      key: 'provider',
      label: 'Execution path',
      ready: input.rpcReady && preferredWalletReady,
      detail: `${input.rpcLabel} • ${input.executionMode === 'jito' ? 'Jito relay' : 'Standard RPC'} • ${preferredWalletDetail}`,
    },
  ]

  const nextAction: SolanaRouteNextAction = !input.walletPresent
    ? {
      id: 'open-wallet',
      label: 'Open wallet manager',
      detail: 'Create or import a wallet first so DAEMON has one Solana route to work from.',
    }
    : !input.isMainWallet
      ? {
        id: 'set-main-wallet',
        label: 'Make this the main wallet',
        detail: 'Use one default wallet route so sends, swaps, and previews do not guess which wallet to use.',
      }
      : !input.signerReady
        ? {
          id: 'open-wallet',
          label: 'Open wallet manager',
          detail: 'Import or generate a signer before expecting wallet-backed actions to work.',
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
              label: 'Open infrastructure',
              detail: 'Finish the RPC path before using wallet-backed Solana execution.',
            }
            : input.requirePreferredWallet && input.preferredWallet !== 'phantom'
              ? {
                id: 'set-preferred-wallet',
                label: 'Set Phantom as preferred wallet',
                detail: 'Switch DAEMON to a Phantom-first wallet path so signing UX stays consistent.',
              }
              : {
                id: input.requirePreferredWallet ? 'preview-transaction' : 'transact',
                label: input.requirePreferredWallet ? 'Preview first transaction' : 'Move funds',
                detail: input.requirePreferredWallet
                  ? 'Preview one safe Solana transaction so the signing flow is visible before anything is sent.'
                  : 'The wallet route is ready. Move into sends, swaps, or holdings next.',
              }

  const headline = nextAction.id === 'open-wallet'
    ? input.walletPresent
      ? 'Add a signer before this wallet can act'
      : 'Create a wallet route first'
    : nextAction.id === 'set-main-wallet'
      ? 'Promote this wallet to the main route'
      : nextAction.id === 'assign-project'
        ? 'Route this wallet into the current project'
        : nextAction.id === 'open-infrastructure'
          ? 'Finish the execution path before sending'
          : nextAction.id === 'set-preferred-wallet'
            ? 'Switch to a Phantom-first signing path'
            : nextAction.id === 'preview-transaction'
              ? 'Wallet route is ready for a safe first preview'
              : 'Wallet route is ready for Solana actions'

  const description = nextAction.detail
  const readyCount = items.filter((item) => item.ready).length
  const walletLabel = input.walletPresent
    ? `${input.walletName ?? 'Wallet'} • ${input.walletAddress ?? 'address pending'}`
    : 'No wallet configured'
  const signingPathLabel = input.preferredWallet === 'phantom'
    ? 'Phantom-first wallet UX'
    : 'Wallet-standard wallet UX'

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

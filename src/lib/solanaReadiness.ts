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
    ? 'Phantom-first is the user-facing signing path.'
    : 'Wallet Standard is active. Switch preference here if this project should lead with Phantom.'

  const items: SolanaRouteReadinessItem[] = [
    {
      key: 'main-wallet',
      label: 'Default wallet route',
      ready: input.walletPresent && input.isMainWallet,
      detail: input.walletPresent
        ? input.isMainWallet
          ? `${input.walletName ?? 'Wallet'} is the default route for sends, swaps, launches, and previews.`
          : `${input.walletName ?? 'Wallet'} exists, but it is not the default route yet.`
        : 'Create or import one DAEMON wallet before configuring Phantom-first signing.',
    },
    {
      key: 'signer',
      label: 'Signer ready',
      ready: input.walletPresent && input.signerReady,
      detail: input.walletPresent
        ? input.signerReady
          ? 'This wallet has a local signer for follow-up sends, swaps, launches, and transaction previews.'
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
      label: 'RPC and Phantom path',
      ready: input.rpcReady && preferredWalletReady,
      detail: `${input.rpcLabel} • ${input.executionMode === 'jito' ? 'Jito relay' : 'Standard RPC'} • ${preferredWalletDetail}`,
    },
  ]

  const nextAction: SolanaRouteNextAction = !input.walletPresent
    ? {
      id: 'open-wallet',
      label: 'Create or import wallet',
      detail: 'Start with one DAEMON wallet so this Phantom integration has a concrete route to configure.',
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
            : input.requirePreferredWallet && input.preferredWallet !== 'phantom'
              ? {
                id: 'set-preferred-wallet',
                label: 'Set Phantom-first',
                detail: 'Make Phantom the preferred user-facing wallet path for this project.',
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
            ? 'Switch to a Phantom-first signing path'
            : nextAction.id === 'preview-transaction'
              ? 'Phantom route is ready for a safe first preview'
              : 'Wallet route is ready for Solana actions'

  const description = nextAction.detail
  const readyCount = items.filter((item) => item.ready).length
  const walletLabel = input.walletPresent
    ? `${input.walletName ?? 'Wallet'} • ${input.walletAddress ?? 'address pending'}`
    : 'No wallet configured'
  const signingPathLabel = input.preferredWallet === 'phantom'
    ? 'Phantom-first'
    : 'Wallet Standard'

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

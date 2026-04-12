// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletTab } from '../../src/panels/WalletPanel/tabs/WalletTab'
import { useUIStore } from '../../src/store/ui'
import { useWalletStore } from '../../src/store/wallet'
import { useNotificationsStore } from '../../src/store/notifications'

function installDaemonBridge() {
  const assignProject = vi.fn().mockResolvedValue({ ok: true })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      activity: {
        append: vi.fn().mockResolvedValue({ ok: true }),
      },
      env: {
        copyValue: vi.fn().mockResolvedValue({ ok: true }),
      },
      settings: {
        getWalletInfrastructureSettings: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            rpcProvider: 'helius',
            quicknodeRpcUrl: '',
            customRpcUrl: '',
            swapProvider: 'jupiter',
            preferredWallet: 'phantom',
            executionMode: 'rpc',
            jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
          },
        }),
      },
      wallet: {
        hasJupiterKey: vi.fn().mockResolvedValue({ ok: true, data: false }),
        hasKeypair: vi.fn().mockResolvedValue({ ok: true, data: true }),
        balance: vi.fn().mockResolvedValue({ ok: true, data: { sol: 4.2, lamports: 4200000000 } }),
        assignProject,
      },
    },
  })

  return { assignProject }
}

describe('WalletTab readiness UX', () => {
  beforeEach(() => {
    installDaemonBridge()
    useNotificationsStore.setState({ toasts: [], activity: [] })
    useUIStore.setState({
      activeProjectId: 'project-1',
      activeProjectPath: 'C:/work/daemon-app',
      drawerToolOrder: [],
      workspaceToolTabs: [],
      activeWorkspaceToolId: null,
      browserTabOpen: false,
      browserTabActive: false,
      dashboardTabOpen: false,
      dashboardTabActive: false,
    })
    useWalletStore.setState({
      dashboard: {
        heliusConfigured: true,
        market: [],
        portfolio: {
          totalUsd: 1250,
          delta24hUsd: 42,
          delta24hPct: 3.2,
          walletCount: 1,
        },
        wallets: [
          {
            id: 'wallet-1',
            name: 'Main Wallet',
            address: '7Y12wallet9AbC',
            isDefault: true,
            totalUsd: 1250,
            tokenCount: 3,
            assignedProjectIds: [],
          },
        ],
        activeWallet: {
          id: 'wallet-1',
          name: 'Main Wallet',
          address: '7Y12wallet9AbC',
          holdings: [
            {
              mint: 'So11111111111111111111111111111111111111112',
              symbol: 'SOL',
              name: 'Solana',
              amount: 4.2,
              priceUsd: 150,
              valueUsd: 630,
              logoUri: null,
            },
          ],
        },
        feed: [],
        recentActivity: [],
      },
      showMarketTape: true,
      showTitlebarWallet: true,
      loading: false,
      error: null,
      agentWallets: null,
      transactions: [
        {
          id: 'tx-1',
          type: 'transfer',
          signature: 'abc123',
          from_address: '7Y12wallet9AbC',
          to_address: '4abcDestxxx',
          amount: 1,
          mint: null,
          status: 'confirmed',
          created_at: Date.now(),
        },
      ],
      activeView: 'overview',
      activeTab: 'wallet',
    })
  })

  it('shows wallet readiness and lets the user assign the active wallet to the current project', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    render(<WalletTab onRefresh={onRefresh} />)

    expect(await screen.findByText('Wallet readiness')).toBeInTheDocument()
    expect(screen.getByText('Route this wallet into the current project')).toBeInTheDocument()
    expect(screen.getByText('The active project is not assigned to this wallet yet.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Use for current project' }))

    await waitFor(() => {
      expect(window.daemon.wallet.assignProject).toHaveBeenCalledWith('project-1', 'wallet-1')
    })
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled()
    })
  })

  it('uses a specific add-signer CTA when the active wallet is watch-only', async () => {
    window.daemon.wallet.hasKeypair.mockResolvedValueOnce({ ok: true, data: false })
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    render(<WalletTab onRefresh={onRefresh} />)

    expect(await screen.findByText('Wallet readiness')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Add signer' })).toBeInTheDocument()
  })
})

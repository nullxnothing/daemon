// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionLab } from '../../src/panels/SolanaToolbox/TransactionLab'
import { useUIStore } from '../../src/store/ui'

const dashboard: WalletDashboard = {
  heliusConfigured: true,
  market: [],
  portfolio: {
    totalUsd: 420,
    delta24hUsd: 12,
    delta24hPct: 2.94,
    walletCount: 1,
  },
  wallets: [
    {
      id: 'wallet-1',
      name: 'Main Wallet',
      address: '11111111111111111111111111111111',
      isDefault: true,
      totalUsd: 420,
      tokenCount: 2,
      assignedProjectIds: ['project-1'],
    },
  ],
  activeWallet: {
    id: 'wallet-1',
    name: 'Main Wallet',
    address: '11111111111111111111111111111111',
    holdings: [
      {
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        amount: 45,
        priceUsd: 1,
        valueUsd: 45,
        logoUri: null,
      },
    ],
  },
  feed: [],
  recentActivity: [
    {
      signature: '5j7sReplaySignature111111111111111111111111111111111111111111',
      type: 'send',
      description: 'SOL send',
    },
  ],
}

function runtimeStatus(overrides: Partial<SolanaRuntimeStatusSummary> = {}): SolanaRuntimeStatusSummary {
  return {
    rpc: { label: 'Helius', detail: 'RPC ready', status: 'live' },
    walletPath: { label: 'Phantom-first', detail: 'Wallet UX ready', status: 'live' },
    swapEngine: { label: 'Jupiter', detail: 'Jupiter ready', status: 'live' },
    executionBackend: { label: 'Shared RPC executor', detail: 'Shared confirmation path ready', status: 'live' },
    executionCoverage: [],
    troubleshooting: [],
    preflight: {
      ready: true,
      checks: [],
      blockers: [],
    },
    executionPath: {
      mode: 'rpc',
      label: 'Standard RPC submission',
      detail: 'Helius handles reads, transaction construction, submission, and confirmation.',
      submitter: 'Helius key connected',
      confirmation: 'DAEMON confirms signatures through the shared RPC connection.',
    },
    ...overrides,
  }
}

function installDaemonBridge(runtime: SolanaRuntimeStatusSummary = runtimeStatus()) {
  const transactionPreview = vi.fn().mockResolvedValue({
    ok: true,
    data: {
      title: 'Review SOL Send',
      backendLabel: 'Shared RPC executor',
      signerLabel: 'Main Wallet (111111...1111)',
      targetLabel: '111111...1111',
      amountLabel: '0.01 SOL',
      feeLabel: 'RPC network fee at submit time',
      notes: ['Network fees are finalized when DAEMON builds and submits the transaction.'],
      warnings: [],
      requiresAcknowledgement: false,
      acknowledgementLabel: null,
    },
  })
  const fetchTrace = vi.fn().mockResolvedValue({
    ok: true,
    data: {
      signature: '5j7sReplaySignature111111111111111111111111111111111111111111',
      slot: 123456,
      blockTime: null,
      success: true,
      fee: 5000,
      computeUnitsConsumed: 34567,
      feePayer: '11111111111111111111111111111111',
      programIds: ['11111111111111111111111111111111'],
      instructions: [],
      accountDiffs: [],
      logs: [],
      errorRaw: null,
      anchorError: null,
      fetchedAt: Date.now(),
    },
  })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      settings: {
        getSolanaRuntimeStatus: vi.fn().mockResolvedValue({ ok: true, data: runtime }),
      },
      wallet: {
        dashboard: vi.fn().mockResolvedValue({ ok: true, data: dashboard }),
        transactionPreview,
      },
      replay: {
        rpcLabel: vi.fn().mockResolvedValue({ ok: true, data: 'https://rpc.helius.test' }),
        fetchTrace,
      },
    },
  })

  return { fetchTrace, transactionPreview }
}

describe('TransactionLab', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeProjectId: 'project-1',
      activeProjectPath: 'C:/work/daemon-app',
      workspaceToolTabs: [],
      activeWorkspaceToolId: null,
    })
  })

  it('previews a send transaction and replays a signature from the same surface', async () => {
    const { fetchTrace, transactionPreview } = installDaemonBridge()
    const user = userEvent.setup()

    render(<TransactionLab />)

    expect(await screen.findByText('Transaction Lab')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/Main Wallet/).length).toBeGreaterThan(0))

    await user.type(screen.getByLabelText('Destination'), '11111111111111111111111111111111')
    await user.click(screen.getByRole('button', { name: 'Preview Transaction' }))

    await waitFor(() => expect(screen.getAllByText('Review SOL Send').length).toBeGreaterThan(0))
    await waitFor(() => expect(transactionPreview).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'send-sol',
      walletId: 'wallet-1',
      destination: '11111111111111111111111111111111',
      amount: 0.01,
    })))

    await user.type(screen.getByPlaceholderText('Transaction signature'), '5j7sReplaySignature111111111111111111111111111111111111111111')
    await user.click(screen.getByRole('button', { name: 'Replay Signature' }))

    expect(await screen.findByText('Confirmed')).toBeInTheDocument()
    expect(screen.getByText('34,567')).toBeInTheDocument()
    await waitFor(() => expect(fetchTrace).toHaveBeenCalledWith('5j7sReplaySignature111111111111111111111111111111111111111111'))
  })

  it('surfaces runtime blockers in the transaction pipeline', async () => {
    installDaemonBridge(runtimeStatus({
      rpc: { label: 'QuickNode', detail: 'QuickNode endpoint missing', status: 'setup' },
      executionBackend: { label: 'Shared RPC executor', detail: 'QuickNode endpoint missing', status: 'setup' },
      preflight: {
        ready: false,
        checks: [
          {
            id: 'rpc-provider',
            label: 'RPC provider',
            status: 'setup',
            detail: 'QuickNode endpoint missing',
            requiredFor: ['reads', 'sends', 'swaps', 'launches', 'recovery', 'scaffolds'],
          },
        ],
        blockers: ['QuickNode endpoint missing'],
      },
    }))

    render(<TransactionLab />)

    expect(await screen.findByText('QuickNode endpoint missing')).toBeInTheDocument()
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0)
  })
})

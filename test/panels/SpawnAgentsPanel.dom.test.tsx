// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpawnAgentsPanel } from '../../src/panels/SpawnAgents/SpawnAgentsPanel'
import { useWalletStore } from '../../src/store/wallet'

const initiateSpawn = vi.fn()
const spawnAndFund = vi.fn()
const pickImage = vi.fn()
const readPickedImageBase64 = vi.fn()

function installDaemonBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      fs: {
        readPickedImageBase64,
      },
      launch: {
        pickImage,
      },
      spawnAgents: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        initiateSpawn,
        spawnAndFund,
        onEvent: vi.fn(() => () => {}),
      },
      wallet: {
        hasKeypair: vi.fn().mockImplementation((walletId: string) => Promise.resolve({ ok: true, data: walletId !== 'wallet-watch' })),
      },
    },
  })
}

function installImageCanvasMocks() {
  class MockImage {
    width = 640
    height = 480
    onload: (() => void) | null = null
    onerror: (() => void) | null = null

    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }

  Object.defineProperty(window, 'Image', {
    configurable: true,
    value: MockImage,
  })

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({ drawImage: vi.fn() })),
  })

  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    value: vi.fn(() => 'data:image/jpeg;base64,cropped-avatar'),
  })
}

describe('SpawnAgentsPanel spawn form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    installDaemonBridge()
    installImageCanvasMocks()
    pickImage.mockResolvedValue({ ok: true, data: 'C:\\tmp\\agent.png' })
    readPickedImageBase64.mockResolvedValue({ ok: true, data: { dataUrl: 'data:image/png;base64,source-avatar', size: 128 } })
    initiateSpawn.mockResolvedValue({
      ok: true,
      data: {
        payment_id: 'payment-1',
        agent_id: 'agent-1',
        agent_name: 'Redline',
        amount: 0.5,
        reference: '11111111111111111111111111111111',
        recipient: '22222222222222222222222222222222',
        dna: {},
      },
    })
    spawnAndFund.mockResolvedValue({
      ok: true,
      data: {
        agent: { id: 'agent-1' },
        deposit: { agent_id: 'agent-1' },
        funding_tx_signature: 'sig-1',
      },
    })

    useWalletStore.setState({
      dashboard: {
        heliusConfigured: true,
        market: [],
        portfolio: {
          totalUsd: 0,
          delta24hUsd: 0,
          delta24hPct: 0,
          walletCount: 1,
        },
        wallets: [
          {
            id: 'wallet-1',
            name: 'Main Wallet',
            address: 'HAWHzLmOwnerWalletNkey',
            isDefault: true,
            totalUsd: 0,
            tokenCount: 0,
            assignedProjectIds: [],
          },
          {
            id: 'wallet-2',
            name: 'Funded Wallet',
            address: 'FundedWallet1111111111111111111111111111',
            isDefault: false,
            totalUsd: 50,
            tokenCount: 1,
            assignedProjectIds: [],
          },
        ],
        activeWallet: null,
        feed: [],
        recentActivity: [],
      },
      showMarketTape: true,
      showTitlebarWallet: true,
      loading: false,
      error: null,
      agentWallets: null,
      transactions: null,
      activeView: 'overview',
      activeTab: 'wallet',
    })
  })

  it('sends identity metadata, cropped avatar, funding, and DNA when requesting a deposit address', async () => {
    render(<SpawnAgentsPanel />)

    await userEvent.click(await screen.findByRole('button', { name: 'Spawn agent' }))
    await userEvent.click(screen.getByRole('button', { name: 'Upload image' }))
    await screen.findByText('agent.png')
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'Redline')
    await userEvent.type(screen.getByPlaceholderText('Short trading thesis or personality'), 'Fast exits only.')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Prediction markets' }))
    await userEvent.click(screen.getByRole('button', { name: 'Get deposit address' }))

    await waitFor(() => {
      expect(initiateSpawn).toHaveBeenCalledWith(expect.objectContaining({
        owner_wallet: 'HAWHzLmOwnerWalletNkey',
        name: 'Redline',
        sol_amount: 0.5,
        meta: {
          avatar: 'data:image/jpeg;base64,cropped-avatar',
          bio: 'Fast exits only.',
        },
        dna: expect.objectContaining({
          trades_memecoins: true,
          trades_prediction: true,
          pm_categories: ['crypto'],
          pm_edge_threshold: 5,
          pm_max_position_pct: 10,
          pm_max_positions: 10,
        }),
      }))
    })
  })

  it('omits prediction-market fields when prediction trading is disabled', async () => {
    render(<SpawnAgentsPanel />)

    await userEvent.click(await screen.findByRole('button', { name: 'Spawn agent' }))
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'Memes Only')
    await userEvent.click(screen.getByRole('button', { name: 'Get deposit address' }))

    await waitFor(() => {
      expect(initiateSpawn).toHaveBeenCalled()
    })

    const payload = initiateSpawn.mock.calls[0][0]
    expect(payload.dna).toEqual(expect.objectContaining({
      trades_memecoins: true,
      trades_prediction: false,
    }))
    expect(payload.dna).not.toHaveProperty('pm_categories')
    expect(payload.dna).not.toHaveProperty('pm_edge_threshold')
    expect(payload.dna).not.toHaveProperty('pm_max_position_pct')
    expect(payload.dna).not.toHaveProperty('pm_max_positions')
  })

  it('uses the wallet selected on the SpawnAgents page for spawn-and-fund', async () => {
    render(<SpawnAgentsPanel />)

    await userEvent.selectOptions(await screen.findByLabelText(/Wallet/i), 'wallet-2')
    await userEvent.click(screen.getByRole('button', { name: 'Spawn agent' }))
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'Funded Spawn')
    const spawnButton = screen.getByRole('button', { name: 'Spawn & fund from wallet' })
    await waitFor(() => expect(spawnButton).toBeEnabled())
    await userEvent.click(spawnButton)

    await waitFor(() => {
      expect(spawnAndFund).toHaveBeenCalledWith('wallet-2', expect.objectContaining({
        owner_wallet: 'FundedWallet1111111111111111111111111111',
        name: 'Funded Spawn',
      }))
    })
  })

  it('blocks spawn-and-fund when the selected wallet is watch-only', async () => {
    useWalletStore.setState((state) => ({
      dashboard: state.dashboard
        ? {
            ...state.dashboard,
            wallets: [
              ...state.dashboard.wallets,
              {
                id: 'wallet-watch',
                name: 'Watch Wallet',
                address: 'WatchWallet11111111111111111111111111111',
                isDefault: false,
                totalUsd: 10,
                tokenCount: 1,
                assignedProjectIds: [],
              },
            ],
          }
        : null,
    }))

    render(<SpawnAgentsPanel />)

    await userEvent.selectOptions(await screen.findByLabelText(/Wallet/i), 'wallet-watch')
    await userEvent.click(screen.getByRole('button', { name: 'Spawn agent' }))
    await userEvent.type(screen.getByPlaceholderText('Agent name'), 'Watch Only Spawn')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Spawn & fund from wallet' })).toBeDisabled()
    })
    expect(spawnAndFund).not.toHaveBeenCalled()
  })
})

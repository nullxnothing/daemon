// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProPanel } from '../../src/panels/ProPanel/ProPanel'
import { useProStore } from '../../src/store/pro'
import { useWalletStore } from '../../src/store/wallet'

function installDaemonBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      pro: {
        status: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            active: false,
            walletId: null,
            walletAddress: null,
            expiresAt: null,
            features: [],
            tier: null,
            accessSource: null,
            holderStatus: {
              enabled: false,
              eligible: false,
              mint: null,
              minAmount: null,
              currentAmount: null,
              symbol: 'DAEMON',
            },
            priceUsdc: null,
            durationDays: null,
          },
        }),
        fetchPrice: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            priceUsdc: 5,
            durationDays: 30,
            network: 'solana:mainnet',
            payTo: 'GNVxk3sn4iJ2iUaqEUskWQ1KNy9Mmcee3WF3AMtRjN7W',
          },
        }),
      },
    },
  })
}

describe('ProPanel Arena status', () => {
  beforeEach(() => {
    installDaemonBridge()
    useProStore.setState({
      subscription: {
        active: false,
        walletId: null,
        walletAddress: null,
        expiresAt: null,
        features: [],
        tier: null,
        accessSource: null,
        holderStatus: {
          enabled: false,
          eligible: false,
          mint: null,
          minAmount: null,
          currentAmount: null,
          symbol: 'DAEMON',
        },
        priceUsdc: null,
        durationDays: null,
      },
      price: null,
      arenaSubmissions: [],
      quota: null,
      subscribing: false,
      loadingArena: false,
      loadingQuota: false,
      syncingSkills: false,
      syncingMcp: false,
      error: null,
    })
    useWalletStore.setState({ dashboard: { wallets: [] } as any })
  })

  it('opens Arena and shows locked status when Pro is inactive', async () => {
    render(<ProPanel />)

    await userEvent.click(screen.getByRole('button', { name: 'Arena' }))

    expect(screen.getByText('Arena submission is not active on this install.')).toBeInTheDocument()
    expect(screen.getByText('DAEMON_PRO_DEV_BYPASS=1')).toBeInTheDocument()
  })
})

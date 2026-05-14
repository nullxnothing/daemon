// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Subscriptions from '../../src/panels/plugins/Subscriptions/Subscriptions'
import { useProStore } from '../../src/store/pro'
import type { ProSubscriptionState } from '../../electron/shared/types'

const LIGHT_STATE: ProSubscriptionState = {
  active: false,
  plan: 'light',
  walletId: null,
  walletAddress: null,
  expiresAt: null,
  features: [],
  tier: null,
  accessSource: 'free',
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
}

const ULTRA_STATE: ProSubscriptionState = {
  active: true,
  plan: 'ultra',
  walletId: 'wallet-1',
  walletAddress: '7Y12wallet9AbC',
  expiresAt: Date.UTC(2026, 5, 1),
  features: ['daemon-ai', 'arena', 'pro-skills', 'mcp-sync', 'priority-api', 'app-factory', 'shipline', 'cloud-agents'],
  tier: 'ultra',
  accessSource: 'payment',
  holderStatus: {
    enabled: true,
    eligible: true,
    mint: 'daemon-mint',
    minAmount: 1000000,
    currentAmount: 12500000,
    symbol: 'DAEMON',
  },
  priceUsdc: 200,
  durationDays: 30,
}

function installDaemonBridge(state: ProSubscriptionState) {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      pro: {
        status: vi.fn().mockResolvedValue({ ok: true, data: state }),
        refreshStatus: vi.fn().mockResolvedValue({ ok: true, data: state }),
        fetchPrice: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            priceUsdc: state.plan === 'ultra' ? 200 : 20,
            durationDays: 30,
            network: 'solana:mainnet',
            payTo: 'GNVxk3sn4iJ2iUaqEUskWQ1KNy9Mmcee3WF3AMtRjN7W',
          },
        }),
        quota: vi.fn().mockResolvedValue({
          ok: true,
          data: { quota: 30000, used: 6000, remaining: 24000 },
        }),
      },
    },
  })
}

describe('Subscriptions panel', () => {
  beforeEach(() => {
    installDaemonBridge(LIGHT_STATE)
    useProStore.setState({
      subscription: LIGHT_STATE,
      price: null,
      quota: null,
      subscribing: false,
      loadingQuota: false,
      error: null,
    })
  })

  it('shows the DAEMON plan ladder and locked hosted lanes for Light users', () => {
    render(<Subscriptions />)

    expect(screen.getByText('DAEMON access and hosted AI lanes')).toBeInTheDocument()
    expect(screen.getAllByText('Light').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Pro').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Operator').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Ultra').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Locked')).toHaveLength(3)
    expect(screen.getByText('Holder Pro')).toBeInTheDocument()
  })

  it('marks all hosted lanes unlocked for Ultra subscribers', async () => {
    installDaemonBridge(ULTRA_STATE)
    useProStore.setState({
      subscription: ULTRA_STATE,
      price: { priceUsdc: 200, durationDays: 30, network: 'solana:mainnet', payTo: 'wallet' },
      quota: { quota: 30000, used: 6000, remaining: 24000 },
      loadingQuota: false,
      error: null,
    })

    render(<Subscriptions />)

    expect(screen.getByText('Paid subscription')).toBeInTheDocument()
    expect(screen.getByText('12,500,000 DAEMON')).toBeInTheDocument()
    expect(screen.getAllByText('Unlocked')).toHaveLength(3)
    expect(screen.getByText('20%')).toBeInTheDocument()
  })
})

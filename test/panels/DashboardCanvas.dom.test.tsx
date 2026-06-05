// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardCanvas } from '../../src/panels/Dashboard/DashboardCanvas'
import { useUIStore } from '../../src/store/ui'
import { useWalletStore } from '../../src/store/wallet'
import {
  BLOCK_SCANNER_HANDOFF_KEY,
  REPLAY_HANDOFF_KEY,
} from '../../src/lib/surfaceHandoffs'

const defaultOpenWorkspaceTool = useUIStore.getState().openWorkspaceTool
const MINT = 'So11111111111111111111111111111111111111112'

function installDaemonBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      launch: {
        listTokens: vi.fn().mockResolvedValue({
          ok: true,
          data: [{ mint: MINT, name: 'Wrapped SOL', symbol: 'SOL' }],
        }),
      },
      dashboard: {
        tokenMetadata: vi.fn().mockResolvedValue({
          ok: true,
          data: { name: 'Wrapped SOL', symbol: 'SOL', image: null, supply: 1_000_000_000, decimals: 9 },
        }),
        tokenPrice: vi.fn().mockResolvedValue({
          ok: true,
          data: { price: 150, priceChange24h: 1.2 },
        }),
        tokenHolders: vi.fn().mockResolvedValue({
          ok: true,
          data: { count: 1, topHolders: [{ address: '7Y12wallet9AbC', amount: 1_000_000_000 }] },
        }),
        importToken: vi.fn().mockResolvedValue({ ok: true }),
        detectTokens: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      pumpfun: {
        collectFees: vi.fn().mockResolvedValue({ ok: true }),
      },
      shell: {
        openExternal: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
  })
}

describe('DashboardCanvas', () => {
  beforeEach(() => {
    window.localStorage.clear()
    installDaemonBridge()
    useWalletStore.setState({
      dashboard: {
        wallets: [{
          id: 'wallet-1',
          name: 'Main Wallet',
          address: '7Y12wallet9AbC',
          isDefault: true,
        }],
      } as any,
    })
    useUIStore.setState({
      activeDashboardMint: MINT,
      workspaceToolTabs: [],
      activeWorkspaceToolId: null,
      dashboardTabActive: true,
      browserTabActive: false,
      openWorkspaceTool: defaultOpenWorkspaceTool,
    } as any)
  })

  it('hands selected dashboard mint to Block Scanner and Replay', async () => {
    render(<DashboardCanvas />)

    expect(await screen.findByText('Forensics')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Inspect in Block Scanner' }))
    expect(useUIStore.getState().activeWorkspaceToolId).toBe('block-scanner')
    expect(window.localStorage.getItem(BLOCK_SCANNER_HANDOFF_KEY)).toContain(MINT)

    await userEvent.click(screen.getByRole('button', { name: 'Replay recent activity' }))
    expect(useUIStore.getState().activeWorkspaceToolId).toBe('replay-engine')
    expect(window.localStorage.getItem(REPLAY_HANDOFF_KEY)).toContain(MINT)
  })
})

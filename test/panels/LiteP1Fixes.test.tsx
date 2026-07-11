// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LiteComposer } from '../../src/lite/LiteComposer'
import { LiteOnboarding } from '../../src/lite/LiteOnboarding'
import { LiteSettings } from '../../src/lite/LiteSettings'
import { LiteWallet } from '../../src/lite/wallet/LiteWallet'

const openInIde = vi.fn().mockResolvedValue({ ok: true, data: { launched: false } })

function installBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      lite: {
        getFlavorInfo: vi.fn().mockResolvedValue({ ok: true, data: { flavor: 'lite', version: '4.7.0', ideInstalled: false } }),
        openInIde,
      },
      claude: {
        listKeys: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        storeKey: vi.fn().mockResolvedValue({ ok: true }),
        deleteKey: vi.fn().mockResolvedValue({ ok: true }),
      },
      provider: {
        verifyAll: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      },
      shell: {
        openExternal: vi.fn().mockResolvedValue(undefined),
      },
      aria: {
        models: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      wallet: {
        dashboard: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            heliusConfigured: false,
            market: [],
            portfolio: { totalUsd: 0, delta24hUsd: 0, delta24hPct: 0, walletCount: 0 },
            wallets: [],
            activeWallet: null,
            feed: [],
            recentActivity: [],
          },
        }),
        create: vi.fn().mockResolvedValue({ ok: true }),
        setDefault: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
  })
}

describe('DAEMON Lite P1 fixes', () => {
  beforeEach(() => {
    installBridge()
    openInIde.mockClear()
  })

  afterEach(() => cleanup())

  it('gives onboarding and composer inputs persistent accessible names', () => {
    const { unmount } = render(<LiteOnboarding onDone={vi.fn()} />)
    expect(screen.getByLabelText('Anthropic API key')).toBeTruthy()
    unmount()

    render(<LiteComposer value="" onChange={vi.fn()} onSend={vi.fn()} ariaLabel="Reply to ARIA" />)
    expect(screen.getByLabelText('Reply to ARIA')).toBeTruthy()
  })

  it('labels provider key fields in Settings', async () => {
    render(<LiteSettings onBack={vi.fn()} />)
    expect(await screen.findByLabelText('Anthropic')).toBeTruthy()
    expect(screen.getByLabelText('GLM (Z.AI)')).toBeTruthy()
  })

  it('states the watch-only and Helius boundaries without a dead upgrade route', async () => {
    render(<LiteWallet onAskAria={vi.fn()} />)

    expect(await screen.findByText(/Addresses stay watch-only/)).toBeTruthy()
    expect(screen.getByText(/Direct configuration is not available in this build yet/)).toBeTruthy()
    expect(screen.queryByText(/Add a Helius API key in Settings/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open DAEMON IDE' })).toBeNull()
  })

  it('collapses the shell to an icon rail and stacks the wallet at narrow widths', () => {
    const appCss = readFileSync(path.resolve('src/lite/LiteApp.module.css'), 'utf8')
    const sidebarCss = readFileSync(path.resolve('src/lite/LiteSidebar.module.css'), 'utf8')
    const walletCss = readFileSync(path.resolve('src/lite/wallet/LiteWallet.module.css'), 'utf8')

    expect(appCss).toContain('@media (max-width: 640px)')
    expect(appCss).toContain('grid-template-columns: 60px minmax(0, 1fr)')
    expect(sidebarCss).toContain('.sessions,')
    expect(sidebarCss).toContain('display: none')
    expect(walletCss).toContain('@container (max-width: 760px)')
    expect(walletCss).toContain('grid-template-columns: minmax(0, 1fr)')
  })
})

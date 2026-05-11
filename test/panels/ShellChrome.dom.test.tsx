// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../src/store/ui'
import { useWalletStore } from '../../src/store/wallet'
import { useWorkspaceProfileStore } from '../../src/store/workspaceProfile'
import { useOnboardingStore } from '../../src/store/onboarding'

vi.mock('../../src/panels/ClaudePanel/ClaudePanel', () => ({
  ClaudePanel: () => <div data-testid="claude-panel">Claude Panel</div>,
}))

vi.mock('../../src/panels/CodexPanel/CodexPanel', () => ({
  CodexPanel: () => <div data-testid="codex-panel">Codex Panel</div>,
}))

vi.mock('../../src/panels/ClaudePanel/AriaChat', () => ({
  AriaChat: () => <div data-testid="aria-chat">ARIA</div>,
}))

vi.mock('../../src/components/QuickView/WalletQuickView', () => ({
  WalletQuickView: () => <div data-testid="wallet-quickview">Wallet Quick View</div>,
}))

vi.mock('../../src/hooks/useShellLayout', () => ({
  useShellLayout: () => ({
    width: 1440,
    tier: 'desktop',
    isDesktop: true,
    isCompact: false,
    isTablet: false,
    isSmall: false,
  }),
}))

const { RightPanel } = await import('../../src/panels/RightPanel/RightPanel')
const { Titlebar } = await import('../../src/panels/Titlebar/Titlebar')
const { SettingsPanel } = await import('../../src/panels/SettingsPanel/SettingsPanel')

function installDaemonBridge() {
  const setShowMarketTape = vi.fn().mockResolvedValue({ ok: true })
  const setShowTitlebarWallet = vi.fn().mockResolvedValue({ ok: true })
  const setLayout = vi.fn().mockResolvedValue({ ok: true })
  const windowControls = {
    close: vi.fn(),
    maximize: vi.fn(),
    minimize: vi.fn(),
    reload: vi.fn(),
  }

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      agents: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      claude: {
        status: vi.fn().mockResolvedValue({ ok: true, data: { indicator: 'none' } }),
        listKeys: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        projectMcpAll: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        verifyConnection: vi.fn().mockResolvedValue({
          ok: true,
          data: { authMode: 'cli', isAuthenticated: true, claudePath: 'claude' },
        }),
      },
      codex: {
        verifyConnection: vi.fn().mockResolvedValue({
          ok: true,
          data: { authMode: 'cli', isAuthenticated: true },
        }),
      },
      events: {
        on: vi.fn(() => () => {}),
      },
      feedback: {
        openUrl: vi.fn().mockResolvedValue({ ok: true }),
      },
      provider: {
        getDefault: vi.fn().mockResolvedValue({ ok: true, data: 'claude' }),
        setDefault: vi.fn().mockResolvedValue({ ok: true }),
        verifyAll: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            claude: { isAuthenticated: true, authMode: 'cli' },
            codex: { isAuthenticated: true, authMode: 'cli' },
          },
        }),
      },
      settings: {
        getAppMeta: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            version: '2.0.17',
            electronVersion: '33.2.0',
            platform: 'win32',
            updateChannel: 'stable',
            releaseUrl: 'https://example.com/release',
          },
        }),
        getCrashes: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        getUi: vi.fn().mockResolvedValue({
          ok: true,
          data: { showMarketTape: true, showTitlebarWallet: true },
        }),
        recoverUiState: vi.fn().mockResolvedValue({ ok: true }),
        setLayout,
        setOnboardingComplete: vi.fn().mockResolvedValue({ ok: true }),
        setOnboardingProgress: vi.fn().mockResolvedValue({ ok: true }),
        setShowMarketTape,
        setShowTitlebarWallet,
      },
      window: windowControls,
    },
  })

  return { setLayout, setShowMarketTape, setShowTitlebarWallet, windowControls }
}

function resetStores() {
  useUIStore.setState({
    activeProjectId: 'project-1',
    activeProjectPath: 'C:/work/daemon-app',
    browserTabOpen: false,
    browserTabActive: false,
    centerMode: 'canvas',
    rightPanelTab: 'claude',
    walletQuickViewOpen: false,
  })

  useWalletStore.setState({
    dashboard: {
      heliusConfigured: true,
      market: [],
      portfolio: {
        totalUsd: 4235.4,
        delta24hUsd: 120.5,
        delta24hPct: 2.9,
        walletCount: 1,
      },
      wallets: [
        {
          id: 'wallet-1',
          name: 'Main Wallet',
          address: 'So11111111111111111111111111111111111111112',
          isDefault: true,
          totalUsd: 4235.4,
          tokenCount: 3,
          assignedProjectIds: ['project-1'],
        },
      ],
      activeWallet: {
        id: 'wallet-1',
        name: 'Main Wallet',
        address: 'So11111111111111111111111111111111111111112',
        holdings: [],
      },
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

  useWorkspaceProfileStore.setState({
    profileName: 'custom',
    toolVisibility: {},
    loaded: true,
  })

  useOnboardingStore.setState({
    isOpen: false,
    progress: {
      profile: 'complete',
      claude: 'complete',
      gmail: 'pending',
      vercel: 'pending',
      railway: 'pending',
      tour: 'pending',
    },
    activeStep: 'profile',
    runTourOnClose: false,
  })
}

describe('Shell chrome DOM coverage', () => {
  beforeEach(() => {
    installDaemonBridge()
    resetStores()
  })

  it('switches assistant tabs in the right rail and keeps ARIA mounted', async () => {
    render(<RightPanel />)

    expect(await screen.findByTestId('claude-panel')).toBeInTheDocument()
    expect(screen.getByTestId('aria-chat')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Claude' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: 'Codex' }))

    expect(screen.getByRole('tab', { name: 'Codex' })).toHaveAttribute('aria-selected', 'true')
    expect(useUIStore.getState().rightPanelTab).toBe('codex')
    expect(screen.getByTestId('codex-panel')).toBeInTheDocument()
  })

  it('opens the titlebar wallet quick view from the portfolio chip', async () => {
    const { container } = render(
      <Titlebar
        projects={[{ id: 'project-1', name: 'Daemon', path: 'C:/work/daemon-app' } as Project]}
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
      />,
    )

    const portfolioButton = container.querySelector('.titlebar-portfolio')
    expect(portfolioButton).not.toBeNull()
    expect(portfolioButton).toHaveClass('titlebar-portfolio')

    await userEvent.click(portfolioButton as HTMLElement)

    expect(useUIStore.getState().walletQuickViewOpen).toBe(true)
    expect(screen.getByTestId('wallet-quickview')).toBeInTheDocument()
  })

  it('wires titlebar window controls to the daemon bridge', async () => {
    const { windowControls } = installDaemonBridge()

    render(
      <Titlebar
        projects={[{ id: 'project-1', name: 'Daemon', path: 'C:/work/daemon-app' } as Project]}
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    await userEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(windowControls.minimize).toHaveBeenCalledTimes(1)
    expect(windowControls.maximize).toHaveBeenCalledTimes(1)
    expect(windowControls.close).toHaveBeenCalledTimes(1)
  })

  it('asks whether the project plus should open a codebase or scaffold a project', async () => {
    const onAddProject = vi.fn()

    render(
      <Titlebar
        projects={[{ id: 'project-1', name: 'Daemon', path: 'C:/work/daemon-app' } as Project]}
        onAddProject={onAddProject}
        onRemoveProject={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add project' }))
    expect(screen.getByRole('menuitem', { name: 'Open Codebase' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Scaffold Project' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Scaffold Project' }))
    expect(useUIStore.getState().activeWorkspaceToolId).toBe('starter')
    expect(onAddProject).not.toHaveBeenCalled()
  })

  it('routes settings search to display and persists display toggles', async () => {
    const { setShowMarketTape, setShowTitlebarWallet } = installDaemonBridge()

    render(<SettingsPanel />)

    await userEvent.type(screen.getByLabelText('Search settings'), 'titlebar')

    expect(screen.getByRole('button', { name: 'Display' })).toHaveClass('active')
    expect(await screen.findByText('Titlebar wallet balance')).toBeInTheDocument()

    const titlebarRow = screen.getByText('Titlebar wallet balance').closest('.settings-display-row')
    const marketRow = screen.getByText('Market ticker tape').closest('.settings-display-row')

    expect(titlebarRow).not.toBeNull()
    expect(marketRow).not.toBeNull()

    const titlebarSwitch = titlebarRow!.querySelector('[role="switch"]')
    const marketSwitch = marketRow!.querySelector('[role="switch"]')

    expect(titlebarSwitch).not.toBeNull()
    expect(marketSwitch).not.toBeNull()

    await userEvent.click(titlebarSwitch as HTMLElement)
    await userEvent.click(marketSwitch as HTMLElement)

    await waitFor(() => {
      expect(setShowTitlebarWallet).toHaveBeenCalledWith(false)
      expect(setShowMarketTape).toHaveBeenCalledWith(false)
    })
  })
})

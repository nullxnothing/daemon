// @vitest-environment happy-dom

import axe from 'axe-core'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../src/store/ui'
import { useWalletStore } from '../../src/store/wallet'
import { useWorkspaceProfileStore } from '../../src/store/workspaceProfile'
import { useOnboardingStore } from '../../src/store/onboarding'

vi.mock('../../src/panels/AgentWorkbench/AgentWorkbench', () => ({
  AgentWorkbench: () => <div data-testid="agent-workbench">Agent Workbench</div>,
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
const { CommandPalette } = await import('../../src/components/CommandPalette/CommandPalette')

function installDaemonBridge() {
  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      agents: { list: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
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
      meterflow: {
        status: vi.fn().mockResolvedValue({
          ok: true,
          data: { configured: true, executionReady: true },
        }),
      },
      events: { on: vi.fn(() => () => {}) },
      settings: {
        getAppMeta: vi.fn().mockResolvedValue({
          ok: true,
          data: { version: '4.0.0', electronVersion: '41.5.0', platform: 'win32', updateChannel: 'stable', releaseUrl: '' },
        }),
        getCrashes: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        getUi: vi.fn().mockResolvedValue({
          ok: true,
          data: { showMarketTape: true, showTitlebarWallet: true, lowPowerMode: false },
        }),
      },
      window: { close: vi.fn(), maximize: vi.fn(), minimize: vi.fn(), reload: vi.fn() },
    },
  })
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
      portfolio: { totalUsd: 4235.4, delta24hUsd: 120.5, delta24hPct: 2.9, walletCount: 1 },
      wallets: [],
      activeWallet: null,
      feed: [],
      recentActivity: [],
    },
    showMarketTape: true,
    showTitlebarWallet: true,
    lowPowerMode: false,
    loading: false,
    error: null,
    agentWallets: null,
    transactions: null,
    activeView: 'overview',
    activeTab: 'wallet',
  })
  useWorkspaceProfileStore.setState({ profileName: 'custom', toolVisibility: {}, loaded: true })
  useOnboardingStore.setState({
    isOpen: false,
    progress: { profile: 'complete', project: 'complete', runtime: 'pending', ai: 'pending', firstRun: 'pending', tour: 'pending' },
    activeStep: 'profile',
    runTourOnClose: false,
  })
}

// Axe rules to skip for unit-render of isolated components:
// - color-contrast: requires real layout; happy-dom always reports false-positives
// - region: standalone components are intentionally rendered outside the page landmark hierarchy
const AXE_OPTIONS = {
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
}

async function expectNoViolations(container: HTMLElement) {
  const results = await axe.run(container, AXE_OPTIONS)
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
}

describe('Shell chrome accessibility', () => {
  beforeEach(() => {
    installDaemonBridge()
    resetStores()
  })

  it('Titlebar has no axe violations', async () => {
    const { container } = render(
      <Titlebar
        projects={[{ id: 'project-1', name: 'Daemon', path: 'C:/work/daemon-app' } as Project]}
        onAddProject={vi.fn()}
        onRemoveProject={vi.fn()}
      />,
    )
    await expectNoViolations(container)
  })

  it('RightPanel has no axe violations', async () => {
    const { container } = render(<RightPanel />)
    await expectNoViolations(container)
  })

  it('CommandPalette (commands mode) has no axe violations', async () => {
    const { container } = render(
      <CommandPalette
        mode="commands"
        commands={[
          { id: 'a', label: 'Open Settings', category: 'Workspace', action: vi.fn() },
          { id: 'b', label: 'Toggle Terminal', category: 'Workspace', action: vi.fn() },
        ] as any}
        files={[]}
        projectRoot="C:/work/daemon-app"
        onClose={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    )
    await expectNoViolations(container)
  })

  it('CommandPalette (files mode) has no axe violations', async () => {
    const { container } = render(
      <CommandPalette
        mode="files"
        commands={[]}
        files={[
          { name: 'App.tsx', path: 'src/App.tsx' },
          { name: 'main.tsx', path: 'src/main.tsx' },
        ]}
        projectRoot="C:/work/daemon-app"
        onClose={vi.fn()}
        onSelectFile={vi.fn()}
      />,
    )
    await expectNoViolations(container)
  })
})

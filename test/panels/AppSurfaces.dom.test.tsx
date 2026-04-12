// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../src/store/ui'
import { usePluginStore } from '../../src/store/plugins'
import { useSolanaToolboxStore } from '../../src/store/solanaToolbox'
import { useWorkflowShellStore } from '../../src/store/workflowShell'
import { useWorkspaceProfileStore } from '../../src/store/workspaceProfile'
import { WalletSendForm } from '../../src/panels/WalletPanel/WalletSendForm'
import { SolanaToolbox } from '../../src/panels/SolanaToolbox/SolanaToolbox'
import { TokenLaunchTool } from '../../src/panels/TokenLaunchTool/TokenLaunchTool'
import { IntegrationCommandCenter } from '../../src/panels/IntegrationCommandCenter/IntegrationCommandCenter'

vi.mock('../../src/utils/lazyWithReload', () => ({
  lazyWithReload: () => () => null,
  lazyNamedWithReload: () => () => null,
}))

const { CommandDrawer } = await import('../../src/components/CommandDrawer/CommandDrawer')

function installDaemonBridge() {
  const readFile = vi.fn().mockImplementation(async (filePath: string) => {
    if (filePath.endsWith('package.json')) {
      return {
        ok: true,
        data: {
          path: filePath,
          content: JSON.stringify({
            packageManager: 'pnpm@9.15.3',
            dependencies: {
              'solana-agent-kit': '^2.0.0',
              '@metaplex-foundation/umi': '^1.0.0',
            },
            scripts: {
              dev: 'vite',
            },
          }),
        },
      }
    }

    if (filePath.endsWith('pnpm-lock.yaml')) {
      return { ok: true, data: { path: filePath, content: 'lockfileVersion: 9.0' } }
    }

    return { ok: false, error: 'File not found' }
  })
  const writeFile = vi.fn().mockResolvedValue({ ok: true })
  const createDir = vi.fn().mockResolvedValue({ ok: true })
  const createTerminal = vi.fn().mockImplementation(async ({ startupCommand }: { startupCommand?: string }) => ({
    ok: true,
    data: {
      id: startupCommand?.includes('agent:first-solana') ? 'terminal-sendai-run' : 'terminal-sendai',
      pid: 123,
      agentId: null,
    },
  }))
  const transactionPreview = vi.fn().mockResolvedValue({
    ok: true,
    data: {
      title: 'Network Preview',
      backendLabel: 'Priority RPC',
      signerLabel: 'Main Wallet',
      targetLabel: '7Y12...9AbC',
      amountLabel: '1.25 SOL',
      feeLabel: '~0.00001 SOL',
      warnings: ['Check the destination before signing.'],
      notes: ['This transaction is simulated before send.'],
    },
  })

  Object.defineProperty(window, 'daemon', {
    configurable: true,
    value: {
      claude: {
        projectMcpAll: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            { name: 'helius', enabled: true },
            { name: 'solana-mcp-server', enabled: true },
            { name: 'phantom-docs', enabled: false },
          ],
        }),
        projectMcpToggle: vi.fn().mockResolvedValue({ ok: true }),
      },
      env: {
        projectVars: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            {
              filePath: 'C:/work/daemon-app/.env',
              fileName: '.env',
              vars: [
                { key: 'RPC_URL', value: 'https://example-rpc.test', isComment: false, isSecret: false, secretLabel: null, lineIndex: 0, raw: 'RPC_URL=https://example-rpc.test' },
              ],
            },
          ],
        }),
      },
      fs: {
        readFile,
        writeFile,
        createDir,
      },
      terminal: {
        create: createTerminal,
      },
      launch: {
        listLaunchpads: vi.fn().mockResolvedValue({
          ok: true,
          data: [
            { id: 'pumpfun', name: 'Pump.fun', description: 'Bonding curve launches', enabled: true },
            { id: 'raydium', name: 'Raydium LaunchLab', description: 'LaunchLab config path', enabled: false, reason: 'Config required' },
            { id: 'meteora', name: 'Meteora DBC', description: 'DBC launch path', enabled: false, reason: 'Config required' },
          ],
        }),
        listTokens: vi.fn().mockResolvedValue({ ok: true, data: [] }),
      },
      settings: {
        getTokenLaunchSettings: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            raydium: { configId: '', quoteMint: '' },
            meteora: { configId: '', quoteMint: '', baseSupply: '' },
          },
        }),
        setLayout: vi.fn().mockResolvedValue({ ok: true }),
        getSolanaRuntimeStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            rpc: { label: 'Helius', detail: 'RPC ready', status: 'live' },
            walletPath: { label: 'Phantom-first', detail: 'Wallet UX ready', status: 'live' },
            swapEngine: { label: 'Jupiter', detail: 'Swap preview ready', status: 'partial' },
            executionBackend: {
              label: 'Shared RPC executor',
              detail: 'Shared confirmation path ready',
              status: 'live',
            },
            executionCoverage: [
              { label: 'Wallet sends', detail: 'Uses shared executor', status: 'live' },
            ],
            troubleshooting: [],
          },
        }),
        setTokenLaunchSettings: vi.fn().mockResolvedValue({ ok: true }),
        setWorkspaceProfile: vi.fn().mockResolvedValue({ ok: true }),
      },
      shell: {
        openExternal: vi.fn().mockResolvedValue({ ok: true }),
      },
      validator: {
        detectProject: vi.fn().mockResolvedValue({
          ok: true,
          data: { isSolanaProject: true, framework: 'anchor', indicators: ['Anchor.toml'], suggestedMcps: [] },
        }),
        start: vi.fn().mockResolvedValue({ ok: true, data: { terminalId: 'validator-1', port: 8899 } }),
        status: vi.fn().mockResolvedValue({ ok: true, data: { type: null, status: 'stopped', terminalId: null, port: null } }),
        stop: vi.fn().mockResolvedValue({ ok: true }),
        toolchainStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            solanaCli: { installed: true, version: '2.0.0' },
            anchor: { installed: true, version: '0.31.0' },
            avm: { installed: false, version: null },
            surfpool: { installed: false, version: null },
            testValidator: { installed: true, version: '2.0.0' },
            litesvm: { installed: false, source: 'none' },
          },
        }),
      },
      wallet: {
        list: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 'wallet-1', name: 'Main Wallet', address: '7Y12wallet9AbC', is_default: 1, created_at: 1, assigned_project_ids: [] }] }),
        hasHeliusKey: vi.fn().mockResolvedValue({ ok: true, data: true }),
        hasJupiterKey: vi.fn().mockResolvedValue({ ok: true, data: false }),
        balance: vi.fn().mockResolvedValue({ ok: true, data: { sol: 2.5, lamports: 2500000000 } }),
        transactionPreview,
      },
    },
  })

  return { createDir, createTerminal, readFile, transactionPreview, writeFile }
}

function resetStores() {
  usePluginStore.setState({ plugins: [], loaded: true, activePluginId: null })
  useWorkflowShellStore.setState({
    drawerTool: null,
    drawerOpen: false,
    drawerFullscreen: false,
    launchWizardOpen: false,
  })
  useWorkspaceProfileStore.setState({ profileName: 'custom', toolVisibility: {}, loaded: true })
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
  useSolanaToolboxStore.setState({
    mcps: [],
    validator: { type: null, status: 'stopped', terminalId: null, port: null },
    projectInfo: null,
    toolchain: null,
    loading: false,
    dismissed: false,
    collapsedSections: { capabilities: true },
  })
}

describe('App surface DOM coverage', () => {
  beforeEach(() => {
    installDaemonBridge()
    resetStores()
  })

  it('renders the tool drawer and opens a searched tool', async () => {
    useWorkflowShellStore.setState({ drawerOpen: true })

    render(<CommandDrawer />)

    expect(screen.getByText('New Project')).toBeInTheDocument()
    expect(screen.getByText('Token Launch')).toBeInTheDocument()
    expect(screen.getByText('Solana')).toBeInTheDocument()
    expect(screen.getByText('Integrations')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Search tools...'), 'solana')
    await userEvent.click(screen.getByText('Solana').closest('button')!)

    expect(useUIStore.getState().activeWorkspaceToolId).toBe('solana-toolbox')
    expect(useWorkflowShellStore.getState().drawerOpen).toBe(false)
  })

  it('renders Integration Command Center setup status and safe checks', async () => {
    render(<IntegrationCommandCenter />)

    expect(await screen.findByText('Integration Command Center')).toBeInTheDocument()
    expect(screen.getAllByText('SendAI Agent Kit').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Helius').length).toBeGreaterThan(0)
    expect(screen.getByText('safe checks')).toBeInTheDocument()
    expect(screen.getByText('Add Solana Agent Kit to this project')).toBeInTheDocument()
    expect(screen.getByText('Create your first Solana agent')).toBeInTheDocument()
    expect(await screen.findByText(/pnpm add @solana-agent-kit\/plugin-token/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Apply Setup' }))

    expect(await screen.findByText('SendAI setup started')).toBeInTheDocument()
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/.env.example',
      expect.stringContaining('SOLANA_PRIVATE_KEY=replace_with_devnet_wallet_private_key_or_use_daemon_wallet'),
    )
    expect(window.daemon.terminal.create).toHaveBeenCalledWith(expect.objectContaining({
      cwd: 'C:/work/daemon-app',
      startupCommand: expect.stringContaining('pnpm add @solana-agent-kit/plugin-token'),
    }))
    expect(useUIStore.getState().terminals.some((terminal) => terminal.id === 'terminal-sendai')).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Create Starter Files' }))

    expect(await screen.findByText('Starter agent scaffolded')).toBeInTheDocument()
    expect(window.daemon.fs.createDir).toHaveBeenCalledWith('C:/work/daemon-app/src')
    expect(window.daemon.fs.createDir).toHaveBeenCalledWith('C:/work/daemon-app/src/agents')
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/package.json',
      expect.stringContaining('"agent:first-solana": "node src/agents/first-solana-agent.mjs"'),
    )
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/agents/first-solana-agent.mjs',
      expect.stringContaining("console.log('SendAI Solana agent is ready.')"),
    )
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/agents/README.md',
      expect.stringContaining('pnpm run agent:first-solana'),
    )

    await userEvent.click(screen.getByRole('button', { name: 'DeFi' }))
    expect(screen.getByRole('heading', { name: 'Jupiter' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await userEvent.click(screen.getByText('Phantom'))
    await userEvent.click(screen.getByRole('button', { name: /Check balance/ }))

    expect(await screen.findByText('Wallet balance')).toBeInTheDocument()
    expect(screen.getByText(/2.5 SOL/)).toBeInTheDocument()
  })

  it('renders Solana toolbox workflow tabs and switches views', async () => {
    render(<SolanaToolbox />)

    expect(await screen.findByText('Solana Workspace')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Connect/ }))
    expect(screen.getByRole('tab', { name: /Connect/ })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: /Integrate/ }))
    expect(screen.getByRole('tab', { name: /Integrate/ })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: /Diagnose/ }))
    expect(screen.getByRole('tab', { name: /Diagnose/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps Token Launch actions and config obvious', async () => {
    render(<TokenLaunchTool />)

    expect(screen.getByRole('heading', { name: 'Token Launch' })).toBeInTheDocument()
    expect(await screen.findByText('Launchpad config')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Launch Token' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh Data' })).toBeInTheDocument()
    expect(screen.getAllByText('Raydium LaunchLab').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Meteora DBC').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Launch Token' }))

    expect(useWorkflowShellStore.getState().launchWizardOpen).toBe(true)
  })

  it('renders wallet transaction previews before sending', async () => {
    const { transactionPreview } = installDaemonBridge()

    render(
      <WalletSendForm
        walletId="wallet-1"
        walletName="Main Wallet"
        sendMode="sol"
        sendDest="7Y12destination9AbC"
        sendAmount="1.25"
        sendMint=""
        sendMax={false}
        selectedRecipientWalletId=""
        recipientWallets={[]}
        tokenOptions={[]}
        walletBalanceSol={3}
        executionMode="rpc"
        sendLoading={false}
        sendError={null}
        sendResult={null}
        pendingSend={{ walletId: 'wallet-1', mode: 'sol', dest: '7Y12destination9AbC', amount: 1.25 }}
        onRecipientWalletChange={vi.fn()}
        onDestChange={vi.fn()}
        onAmountChange={vi.fn()}
        onMintChange={vi.fn()}
        onToggleSendMax={vi.fn()}
        onConfirmSend={vi.fn()}
        onExecuteSend={vi.fn()}
        onCancelSend={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByText('Network Preview')).toBeInTheDocument()
    expect(screen.getByText('Priority RPC')).toBeInTheDocument()
    expect(screen.getByText('1.25 SOL')).toBeInTheDocument()
    expect(screen.getByText('Check the destination before signing.')).toBeInTheDocument()

    await waitFor(() => {
      expect(transactionPreview).toHaveBeenCalledWith({
        kind: 'send-sol',
        walletId: 'wallet-1',
        destination: '7Y12destination9AbC',
        amount: 1.25,
        sendMax: undefined,
        mint: undefined,
        tokenSymbol: undefined,
      })
    })
  })
})

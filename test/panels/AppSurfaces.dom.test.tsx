// @vitest-environment happy-dom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUIStore } from '../../src/store/ui'
import { usePluginStore } from '../../src/store/plugins'
import { useSolanaToolboxStore } from '../../src/store/solanaToolbox'
import { useWorkflowShellStore } from '../../src/store/workflowShell'
import { useWorkspaceProfileStore } from '../../src/store/workspaceProfile'
import { useNotificationsStore } from '../../src/store/notifications'
import { useAppActions } from '../../src/store/appActions'
import { WalletSendForm } from '../../src/panels/WalletPanel/WalletSendForm'
import { SolanaToolbox } from '../../src/panels/SolanaToolbox/SolanaToolbox'
import { TokenLaunchTool } from '../../src/panels/TokenLaunchTool/TokenLaunchTool'
import { IntegrationCommandCenter } from '../../src/panels/IntegrationCommandCenter/IntegrationCommandCenter'
import { ProjectReadiness } from '../../src/panels/ProjectReadiness/ProjectReadiness'
import { ProjectStarter } from '../../src/panels/ProjectStarter/ProjectStarter'
import DeployPanel from '../../src/panels/plugins/Deploy/Deploy'

vi.mock('../../src/utils/lazyWithReload', () => ({
  lazyWithReload: () => () => null,
  lazyNamedWithReload: () => () => null,
}))

const { CommandDrawer } = await import('../../src/components/CommandDrawer/CommandDrawer')

function installDaemonBridge(options: {
  packageJson?: Record<string, unknown>
  envVars?: Array<{ key: string; value: string; isSecret?: boolean }>
} = {}) {
  const writtenFiles = new Map<string, string>()
  const packageJson = options.packageJson ?? {
    packageManager: 'pnpm@9.15.3',
    dependencies: {
      'solana-agent-kit': '^2.0.0',
      '@metaplex-foundation/umi': '^1.0.0',
    },
    scripts: {
      dev: 'vite',
    },
  }
  const envVars = options.envVars ?? [
    { key: 'RPC_URL', value: 'https://example-rpc.test' },
  ]
  const readFile = vi.fn().mockImplementation(async (filePath: string) => {
    if (writtenFiles.has(filePath)) {
      return { ok: true, data: { path: filePath, content: writtenFiles.get(filePath)! } }
    }

    if (filePath.endsWith('package.json')) {
      return {
        ok: true,
        data: {
          path: filePath,
          content: JSON.stringify(packageJson),
        },
      }
    }

    if (filePath.endsWith('pnpm-lock.yaml')) {
      return { ok: true, data: { path: filePath, content: 'lockfileVersion: 9.0' } }
    }

    return { ok: false, error: 'File not found' }
  })
  const writeFile = vi.fn().mockImplementation(async (filePath: string, content: string) => {
    writtenFiles.set(filePath, content)
    return { ok: true }
  })
  const createDir = vi.fn().mockResolvedValue({ ok: true })
  const appendActivity = vi.fn().mockResolvedValue({ ok: true })
  const redeploy = vi.fn().mockResolvedValue({ ok: true, data: { id: 'dep-123', url: 'https://daemon-app.vercel.app' } })
  const linkDeploy = vi.fn().mockResolvedValue({ ok: true })
  const createProject = vi.fn().mockResolvedValue({
    ok: true,
    data: { id: 'project-new', name: 'MyFirstBot', path: 'C:/work/MyFirstBot' },
  })
  const listProjects = vi.fn().mockResolvedValue({
    ok: true,
    data: [
      { id: 'project-new', name: 'MyFirstBot', path: 'C:/work/MyFirstBot' },
      { id: 'project-1', name: 'daemon-app', path: 'C:/work/daemon-app' },
    ],
  })
  const createTerminal = vi.fn().mockImplementation(async ({ startupCommand }: { startupCommand?: string }) => ({
    ok: true,
    data: {
      id: startupCommand?.includes('MyFirstBot')
        ? 'terminal-project-build'
        : startupCommand?.includes('agent:first-solana')
        ? 'terminal-sendai-run'
        : startupCommand?.includes('npx skills add')
          ? 'terminal-sendai-skills'
          : 'terminal-sendai',
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
  const holdings = vi.fn().mockResolvedValue({
    ok: true,
    data: [
      {
        mint: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        amount: 2.5,
        priceUsd: 150,
        valueUsd: 375,
        logoUri: null,
      },
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
  })
  const swapQuote = vi.fn().mockResolvedValue({
    ok: true,
    data: {
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      inAmount: '100000000',
      outAmount: '14.82',
      priceImpactPct: '0.17',
      routePlan: [{ label: 'Jupiter', percent: 100 }],
      rawQuoteResponse: {},
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
              vars: envVars.map((entry, lineIndex) => ({
                key: entry.key,
                value: entry.value,
                isComment: false,
                isSecret: Boolean(entry.isSecret),
                secretLabel: entry.isSecret ? `${entry.key.slice(0, 4)}...` : null,
                lineIndex,
                raw: `${entry.key}=${entry.value}`,
              })),
            },
          ],
        }),
        updateVar: vi.fn().mockResolvedValue({ ok: true }),
      },
      fs: {
        readFile,
        writeFile,
        createDir,
      },
      activity: {
        append: appendActivity,
        list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        saveSummary: vi.fn().mockResolvedValue({ ok: true }),
        clear: vi.fn().mockResolvedValue({ ok: true }),
      },
      deploy: {
        authStatus: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            vercel: { authenticated: true, user: 'builder@daemon.test' },
            railway: { authenticated: false, user: null },
          },
        }),
        connectVercel: vi.fn().mockResolvedValue({ ok: true, data: { name: 'Builder', email: 'builder@daemon.test' } }),
        connectRailway: vi.fn().mockResolvedValue({ ok: true, data: { name: 'Builder', email: 'builder@daemon.test' } }),
        disconnect: vi.fn().mockResolvedValue({ ok: true }),
        vercelProjects: vi.fn().mockResolvedValue({ ok: true, data: [{ id: 'vercel-project-1', name: 'daemon-app' }] }),
        railwayProjects: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        link: linkDeploy,
        unlink: vi.fn().mockResolvedValue({ ok: true }),
        status: vi.fn()
          .mockResolvedValueOnce({ ok: true, data: [] })
          .mockResolvedValue({ ok: true, data: [{ platform: 'vercel', linked: true, projectName: 'daemon-app', productionUrl: 'https://daemon-app.vercel.app', latestStatus: null, latestUrl: null, latestBranch: null, latestCreatedAt: null }] }),
        deployments: vi.fn().mockResolvedValue({
          ok: true,
          data: [{ id: 'dep-123', platform: 'vercel', status: 'READY', url: 'https://daemon-app.vercel.app', branch: 'main', commitSha: 'abcdef123', commitMessage: 'ship deploy', createdAt: Date.now() }],
        }),
        redeploy,
        envVars: vi.fn().mockResolvedValue({ ok: true, data: [] }),
        autoDetect: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      },
      terminal: {
        create: createTerminal,
      },
      projects: {
        list: listProjects,
        create: createProject,
        delete: vi.fn().mockResolvedValue({ ok: true }),
        openDialog: vi.fn().mockResolvedValue({ ok: true, data: 'C:/work' }),
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
        getWalletInfrastructureSettings: vi.fn().mockResolvedValue({
          ok: true,
          data: {
            rpcProvider: 'helius',
            quicknodeRpcUrl: '',
            customRpcUrl: '',
            swapProvider: 'jupiter',
            preferredWallet: 'wallet-standard',
            executionMode: 'rpc',
            jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
          },
        }),
        setLayout: vi.fn().mockResolvedValue({ ok: true }),
        setWalletInfrastructureSettings: vi.fn().mockResolvedValue({ ok: true }),
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
        generate: vi.fn().mockResolvedValue({ ok: true, data: { id: 'wallet-2', name: 'DAEMON Solana Dev Wallet', address: '8Y12wallet9AbC', is_default: 1, created_at: 2, assigned_project_ids: ['project-1'] } }),
        hasKeypair: vi.fn().mockResolvedValue({ ok: true, data: true }),
        hasHeliusKey: vi.fn().mockResolvedValue({ ok: true, data: true }),
        hasJupiterKey: vi.fn().mockResolvedValue({ ok: true, data: false }),
        assignProject: vi.fn().mockResolvedValue({ ok: true }),
        setDefault: vi.fn().mockResolvedValue({ ok: true }),
        balance: vi.fn().mockResolvedValue({ ok: true, data: { sol: 2.5, lamports: 2500000000 } }),
        holdings,
        swapQuote,
        transactionPreview,
      },
    },
  })

  return { appendActivity, createDir, createProject, createTerminal, holdings, linkDeploy, listProjects, readFile, redeploy, swapQuote, transactionPreview, writeFile, writtenFiles }
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
  useNotificationsStore.setState({ toasts: [], activity: [] })
  useAppActions.setState({ filePaletteRequestId: 0, agentLauncherRequestId: 0, terminalFocusRequestId: 0 })
  useUIStore.setState({
    activeProjectId: 'project-1',
    activeProjectPath: 'C:/work/daemon-app',
    drawerToolOrder: [],
    workspaceToolTabs: [],
    activeWorkspaceToolId: null,
    integrationCommandSelectionId: null,
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

async function selectIntegrationCard(name: string) {
  const target = screen.getAllByText(name).find((element) => element.closest('.icc-card'))
  expect(target).toBeTruthy()
  await userEvent.click(target!.closest('button')!)
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
    expect(screen.getByText('Project Readiness')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Search tools...'), 'solana')
    await userEvent.click(screen.getByText('Solana').closest('button')!)

    expect(useUIStore.getState().activeWorkspaceToolId).toBe('solana-toolbox')
    expect(useWorkflowShellStore.getState().drawerOpen).toBe(false)
  })

  it('keeps token launch out of New Project templates', async () => {
    render(<ProjectStarter />)

    expect(await screen.findByText('Project Templates')).toBeInTheDocument()
    expect(screen.getByText('Anchor Program')).toBeInTheDocument()
    expect(screen.getByText('Trading Bot')).toBeInTheDocument()
    expect(screen.queryByText('Token Launch')).not.toBeInTheDocument()
    expect(screen.queryByText('Pump.fun Token')).not.toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Filter templates'), 'launch')

    expect(screen.getByText('No templates match "launch"')).toBeInTheDocument()
  })

  it('hands off New Project scaffolds to the terminal instead of leaving the starter active', async () => {
    render(<ProjectStarter />)
    useUIStore.setState({
      workspaceToolTabs: ['starter'],
      activeWorkspaceToolId: 'starter',
    })

    await userEvent.click(await screen.findByText('Trading Bot'))
    await userEvent.type(screen.getByPlaceholderText('my-solana-project'), 'MyFirstBot')
    await userEvent.click(screen.getByRole('button', { name: 'Browse' }))
    await screen.findByText('C:/work/MyFirstBot')

    await userEvent.click(screen.getByRole('button', { name: 'Build Project' }))

    await waitFor(() => {
      expect(window.daemon.terminal.create).toHaveBeenCalledWith(expect.objectContaining({
        cwd: 'C:/work/MyFirstBot',
        startupCommand: expect.stringContaining('MyFirstBot'),
      }))
    })
    expect(useUIStore.getState().activeProjectId).toBe('project-new')
    expect(useUIStore.getState().activeWorkspaceToolId).toBeNull()
    expect(useUIStore.getState().activeTerminalIdByProject['project-new']).toBe('terminal-project-build')
    expect(useAppActions.getState().terminalFocusRequestId).toBe(1)
  })

  it('renders Integration Command Center setup status and safe checks', async () => {
    render(<IntegrationCommandCenter />)

    expect(await screen.findByText('Integration Command Center')).toBeInTheDocument()
    expect(screen.getAllByText('SendAI Agent Kit').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Helius').length).toBeGreaterThan(0)
    expect(screen.getByText('safe checks')).toBeInTheDocument()
    expect(screen.getByText('Get this project to a first working SendAI agent')).toBeInTheDocument()
    expect(screen.getAllByText('Next step').length).toBeGreaterThan(0)
    expect(await screen.findByText(/pnpm add @solana-agent-kit\/plugin-token/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Apply project setup' }))

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
    expect(screen.getByRole('button', { name: 'Create starter files' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Create starter files' }))

    expect(await screen.findByText('Starter agent scaffolded')).toBeInTheDocument()
    expect(window.daemon.fs.createDir).toHaveBeenCalledWith('C:/work/daemon-app/src')
    expect(window.daemon.fs.createDir).toHaveBeenCalledWith('C:/work/daemon-app/src/agents')
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/package.json',
      expect.stringContaining('"agent:first-solana": "node src/agents/first-solana-agent.mjs"'),
    )
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/agents/first-solana-agent.mjs',
      expect.stringContaining('Wallet balance:'),
    )
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/agents/README.md',
      expect.stringContaining('pnpm run agent:first-solana'),
    )
    expect(screen.getByRole('button', { name: 'Run starter check' })).toBeInTheDocument()

    expect(screen.getByText('Bring protocol knowledge into this project')).toBeInTheDocument()
    expect(screen.getByText(/solana-agent-kit, helius, metaplex/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Install skills in terminal' }))
    expect((await screen.findAllByText('Skills install opened')).length).toBeGreaterThan(0)
    expect(window.daemon.terminal.create).toHaveBeenCalledWith(expect.objectContaining({
      cwd: 'C:/work/daemon-app',
      startupCommand: 'npx skills add sendaifun/skills',
    }))
    expect(useUIStore.getState().terminals.some((terminal) => terminal.id === 'terminal-sendai-skills')).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'DeFi' }))
    expect(screen.getByRole('heading', { name: 'Jupiter' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.queryByText('Token Launch Stack')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('Phantom'))
    expect(screen.getByText('Set up the Phantom route')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use wallet for current project' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use wallet for current project' }))
    expect(await screen.findByText('Project wallet linked')).toBeInTheDocument()
    expect(window.daemon.wallet.assignProject).toHaveBeenCalledWith('project-1', 'wallet-1')
    expect(screen.getByRole('button', { name: 'Set Phantom-first' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Set Phantom-first' }))
    expect(await screen.findByText('Preferred wallet updated')).toBeInTheDocument()
    expect(window.daemon.settings.setWalletInfrastructureSettings).toHaveBeenCalledWith(expect.objectContaining({
      preferredWallet: 'phantom',
    }))
    expect(screen.getByRole('button', { name: 'Preview signing flow' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview signing flow' }))

    expect(await screen.findByText('Phantom signing preview ready')).toBeInTheDocument()
    expect(window.daemon.wallet.transactionPreview).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'send-sol',
      walletId: 'wallet-1',
      destination: '7Y12wallet9AbC',
      amount: 0.01,
    }))

    await userEvent.click(screen.getByText('Helius'))
    expect(screen.getByText('Verify the Helius-backed wallet data path')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Read wallet with Helius' }))
    expect(await screen.findByText('Helius wallet read complete')).toBeInTheDocument()
    expect(window.daemon.wallet.holdings).toHaveBeenCalledWith('wallet-1')

    await userEvent.click(screen.getByText('Jupiter'))
    expect(screen.getByText('Get to a first Jupiter quote before any signing')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Preview Jupiter quote' }))
    expect(await screen.findByText('Jupiter quote ready')).toBeInTheDocument()
    expect(window.daemon.wallet.swapQuote).toHaveBeenCalledWith({
      walletId: 'wallet-1',
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: 0.1,
      slippageBps: 50,
    })

    await userEvent.click(screen.getByText('Metaplex'))
    expect(screen.getByText('Create a first metadata draft inside the project')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create metadata draft' }))
    expect(await screen.findByText('Metaplex draft created')).toBeInTheDocument()
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/assets/metaplex/metadata.example.json',
      expect.stringContaining('"name": "DAEMON Collection Example"'),
    )

    await userEvent.click(screen.getByText('Light Protocol'))
    expect(screen.getByText('Scaffold the first Light compression starter')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Install Light SDK' }))
    expect(await screen.findByText('Install Light SDK opened')).toBeInTheDocument()
    expect(window.daemon.terminal.create).toHaveBeenCalledWith(expect.objectContaining({
      startupCommand: 'pnpm add @lightprotocol/stateless.js @lightprotocol/compressed-token',
    }))

    await userEvent.click(screen.getByText('Streamlock'))
    expect(screen.getByText('Scaffold the first Streamlock Operator API check')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create operator starter' }))
    expect(await screen.findByText('Streamlock starter created')).toBeInTheDocument()
    expect(window.daemon.fs.writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/streamlock/operator-readiness.mjs',
      expect.stringContaining('Streamlock Operator API is configured'),
    )
    expect(screen.getByRole('button', { name: 'Open env manager' })).toBeInTheDocument()

    useUIStore.getState().setIntegrationCommandSelectionId('metaplex')
    expect(await screen.findByRole('heading', { name: 'Metaplex' })).toBeInTheDocument()
  })

  it('scaffolds integration starters into the active project directories', async () => {
    const fullPackageJson = {
      packageManager: 'pnpm@9.15.3',
      dependencies: {
        'solana-agent-kit': '^2.0.0',
        '@metaplex-foundation/umi': '^1.0.0',
        '@lightprotocol/stateless.js': '^0.21.0',
        '@lightprotocol/compressed-token': '^0.21.0',
        '@magicblock-labs/ephemeral-rollups-sdk': '^0.2.0',
        '@debridge-finance/dln-client': '^3.0.0',
        '@sqds/multisig': '^2.1.0',
        '@solana/web3.js': '^1.98.0',
      },
      scripts: {
        dev: 'vite',
      },
    }
    const { createDir, createTerminal, writeFile, writtenFiles } = installDaemonBridge({
      packageJson: fullPackageJson,
      envVars: [
        { key: 'RPC_URL', value: 'https://example-rpc.test' },
        { key: 'STREAMLOCK_OPERATOR_KEY', value: 'sk_test_operator', isSecret: true },
      ],
    })

    render(<IntegrationCommandCenter />)
    expect(await screen.findByText('Integration Command Center')).toBeInTheDocument()

    await selectIntegrationCard('Streamlock')
    await userEvent.click(screen.getByRole('button', { name: 'Create operator starter' }))
    expect(await screen.findByText('Streamlock starter created')).toBeInTheDocument()
    expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/src')
    expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/src/streamlock')
    expect(writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/.env.example',
      expect.stringContaining('STREAMLOCK_OPERATOR_KEY=sk_replace_with_operator_key'),
    )
    expect(writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/streamlock/operator-readiness.mjs',
      expect.stringContaining('Streamlock Operator API is configured'),
    )
    expect(writtenFiles.get('C:/work/daemon-app/package.json')).toContain('"streamlock:operator-check"')
    await userEvent.click(screen.getByRole('button', { name: 'Run operator check' }))
    expect(await screen.findByText('Streamlock check opened')).toBeInTheDocument()
    expect(createTerminal).toHaveBeenCalledWith(expect.objectContaining({
      cwd: 'C:/work/daemon-app',
      startupCommand: 'pnpm run streamlock:operator-check',
    }))

    await selectIntegrationCard('Metaplex')
    await userEvent.click(screen.getByRole('button', { name: 'Create metadata draft' }))
    expect(await screen.findByText('Metaplex draft created')).toBeInTheDocument()
    expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/assets')
    expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/assets/metaplex')
    expect(writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/assets/metaplex/metadata.example.json',
      expect.stringContaining('"name": "DAEMON Collection Example"'),
    )

    await selectIntegrationCard('Light Protocol')
    await userEvent.click(screen.getByRole('button', { name: 'Create compression starter' }))
    expect(await screen.findByText('Light starter created')).toBeInTheDocument()
    expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/src/light')
    expect(writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/light/compression-check.mjs',
      expect.stringContaining('@lightprotocol/stateless.js'),
    )
    expect(writtenFiles.get('C:/work/daemon-app/package.json')).toContain('"light:check"')

    await selectIntegrationCard('MagicBlock')
    await userEvent.click(screen.getByRole('button', { name: 'Create ER readiness starter' }))
    expect(await screen.findByText('MagicBlock starter created')).toBeInTheDocument()
    expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/src/magicblock')
    expect(writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/magicblock/er-readiness.mjs',
      expect.stringContaining('@magicblock-labs/ephemeral-rollups-sdk'),
    )
    expect(writtenFiles.get('C:/work/daemon-app/package.json')).toContain('"magicblock:check"')

    await selectIntegrationCard('deBridge')
    await userEvent.click(screen.getByRole('button', { name: 'Create route preview starter' }))
    expect(await screen.findByText('deBridge starter created')).toBeInTheDocument()
    expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/src/debridge')
    expect(writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/debridge/dln-route-preview.mjs',
      expect.stringContaining('@debridge-finance/dln-client'),
    )
    expect(writtenFiles.get('C:/work/daemon-app/package.json')).toContain('"debridge:preview"')

    await selectIntegrationCard('Squads')
    await userEvent.click(screen.getByRole('button', { name: 'Create multisig inspection starter' }))
    expect(await screen.findByText('Squads starter created')).toBeInTheDocument()
    expect(createDir).toHaveBeenCalledWith('C:/work/daemon-app/src/squads')
    expect(writeFile).toHaveBeenCalledWith(
      'C:/work/daemon-app/src/squads/multisig-inspect.mjs',
      expect.stringContaining('@sqds/multisig'),
    )
    expect(writtenFiles.get('C:/work/daemon-app/package.json')).toContain('"squads:inspect"')
  })

  it('renders Project Readiness as the Solana entry point and routes into first actions', async () => {
    render(<ProjectReadiness />)

    expect(await screen.findByText('Project Readiness')).toBeInTheDocument()
    expect(screen.getByText('Solana project status')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('Refreshing readiness...')).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Solana readiness score')).toBeInTheDocument()
    expect(screen.getByText('Project open')).toBeInTheDocument()
    expect(screen.getByText('Blocking checks')).toBeInTheDocument()
    expect(screen.getByText('Create dev wallet')).toBeInTheDocument()
    expect(screen.getByText('Link wallet to project')).toBeInTheDocument()
    expect(screen.getByText('Enable Solana MCP')).toBeInTheDocument()
    expect(screen.getByText('Write RPC_URL')).toBeInTheDocument()
    expect(screen.getAllByText('Wallet route').length).toBeGreaterThan(0)
    expect(screen.getByText('Provider path')).toBeInTheDocument()
    expect(screen.getByText('MCP tools')).toBeInTheDocument()
    expect(screen.getByText('SendAI first agent')).toBeInTheDocument()
    expect(screen.getByText('First actions')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Assign wallet' })[0])

    expect(await screen.findByText('Linked the default wallet to this project.')).toBeInTheDocument()
    expect(window.daemon.wallet.assignProject).toHaveBeenCalledWith('project-1', 'wallet-1')

    await userEvent.click(screen.getByText('SendAI Agent Kit').closest('button')!)

    expect(useUIStore.getState().activeWorkspaceToolId).toBe('integrations')
    expect(useUIStore.getState().integrationCommandSelectionId).toBe('sendai-agent-kit')
  })

  it('resets hidden integration filters when another surface targets a workflow', async () => {
    render(<IntegrationCommandCenter />)

    expect(await screen.findByText('Integration Command Center')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText('Search integrations, actions, protocols...'), 'phantom')
    expect(screen.getByDisplayValue('phantom')).toBeInTheDocument()

    useUIStore.getState().setIntegrationCommandSelectionId('sendai-solana-mcp')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'SendAI Agent Kit' })).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('')).toBeInTheDocument()
  })

  it('opens MCP setup without leaving stale integration selection behind', async () => {
    render(<IntegrationCommandCenter />)

    expect(await screen.findByText('Integration Command Center')).toBeInTheDocument()

    await userEvent.click(screen.getAllByText('SendAI Agent Kit')[0].closest('button')!)
    await userEvent.click(screen.getByRole('button', { name: 'Open MCP setup' }))

    expect(useUIStore.getState().integrationCommandSelectionId).toBeNull()
    expect(useUIStore.getState().activeWorkspaceToolId).toBe('solana-toolbox')
    expect((await screen.findAllByText('Open MCP setup', { selector: '.icc-result-title' })).length).toBeGreaterThan(0)
  })

  it('renders Solana toolbox workflow tabs and switches views', async () => {
    render(<SolanaToolbox />)

    expect(await screen.findByText('Solana Workspace')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /Connect/ }))
    expect(screen.getByRole('tab', { name: /Connect/ })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: /Launch/ }))
    expect(screen.getByRole('tab', { name: /Launch/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Onboard ecosystem integrations deliberately')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Open Integration' })[0]!)
    expect(useUIStore.getState().activeWorkspaceToolId).toBe('integrations')
    expect(useUIStore.getState().integrationCommandSelectionId).toBe('jupiter')

    await userEvent.click(screen.getByRole('tab', { name: /Debug/ }))
    expect(screen.getByRole('tab', { name: /Debug/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('records deploy link and launch handoff activity', async () => {
    const { linkDeploy, redeploy } = installDaemonBridge()

    render(<DeployPanel />)

    expect(await screen.findByRole('heading', { name: 'Deploy' })).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Link Project' }))
    await userEvent.selectOptions(await screen.findByRole('combobox'), 'vercel-project-1')
    await userEvent.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() => expect(linkDeploy).toHaveBeenCalledWith(
      'project-1',
      'vercel',
      expect.objectContaining({ projectId: 'vercel-project-1', projectName: 'daemon-app' }),
    ))
    expect(useNotificationsStore.getState().activity.some((entry) => (
      entry.context === 'Deploy' &&
      entry.sessionId === 'deploy-project-1-vercel' &&
      entry.message.includes('Vercel project linked') &&
      entry.artifacts?.some((artifact) => artifact.label === 'Provider project ID')
    ))).toBe(true)

    await userEvent.click(await screen.findByRole('button', { name: 'Deploy' }))

    await waitFor(() => expect(redeploy).toHaveBeenCalledWith('project-1', 'vercel'))
    expect(useNotificationsStore.getState().activity.some((entry) => (
      entry.context === 'Deploy' &&
      entry.sessionStatus === 'complete' &&
      entry.artifacts?.some((artifact) => artifact.label === 'Deploy URL' && artifact.href === artifact.value)
    ))).toBe(true)
  })

  it('keeps Token Launch actions and config obvious', async () => {
    render(<TokenLaunchTool />)

    expect(screen.getByRole('heading', { name: 'Token Launch' })).toBeInTheDocument()
    expect(await screen.findByText('Launchpad config')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Streamlock' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh Data' })).toBeInTheDocument()
    expect(screen.getAllByText('Raydium LaunchLab').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Meteora DBC').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: 'Open Streamlock' }))

    expect(window.daemon.shell.openExternal).toHaveBeenCalledWith('https://app.streamlock.fun/')
    expect(useWorkflowShellStore.getState().launchWizardOpen).toBe(false)
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

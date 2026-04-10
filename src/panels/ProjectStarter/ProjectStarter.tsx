import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import './ProjectStarter.css'

// --- Template definitions ---

interface Template {
  id: string
  name: string
  description: string
  tags: string[]
  icon: string
  prompt: string
}

const TEMPLATES: Template[] = [
  {
    id: 'token-launch',
    name: 'Token Launch',
    description: 'SPL token with metadata, mint authority, and launch script',
    tags: ['Token', 'SPL'],
    icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    prompt: `Scaffold a Solana SPL token launch project. Include:
- Anchor program with mint, metadata (Metaplex), and freeze authority setup
- TypeScript client scripts: create-token, mint-supply, transfer, burn
- Deployment scripts for devnet and mainnet
- .env.example with RPC_URL, WALLET_PATH, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS, INITIAL_SUPPLY
- README with setup instructions
Use Anchor 0.32+, AVM-managed toolchains, and @solana/kit (or @solana/web3-compat only when required by third-party SDKs). Initialize git repo.`,
  },
  {
    id: 'nft-collection',
    name: 'NFT Collection',
    description: 'Metaplex collection with minting, metadata, and candy machine',
    tags: ['NFT', 'Metaplex'],
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    prompt: `Scaffold a Solana NFT collection project using Metaplex. Include:
- Anchor program for collection creation and minting
- Candy Machine v3 configuration
- Asset upload scripts (images + JSON metadata)
- TypeScript mint client with allowlist/public phases
- Example metadata JSON and asset folder structure
- .env.example with RPC_URL, WALLET_PATH, COLLECTION_NAME, COLLECTION_SIZE
- README with full setup and deployment guide
Use Metaplex Umi plus @solana/kit-compatible client code. Initialize git repo.`,
  },
  {
    id: 'trading-bot',
    name: 'Trading Bot',
    description: 'Jupiter swap bot with price monitoring and auto-execution',
    tags: ['DeFi', 'Jupiter'],
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    prompt: `Scaffold a Solana trading bot project. Include:
- Jupiter integration for quote, execution, and token routing using the current public APIs
- Price monitoring loop with configurable intervals
- Wallet management with keypair loading from file
- Position tracking and P&L calculation
- Configurable slippage, amount, and token pairs
- Optional Jito bundle-send hook for fast execution
- Logging with timestamps
- .env.example with RPC_URL, WALLET_PATH, TOKEN_MINT_A, TOKEN_MINT_B, SLIPPAGE_BPS, CHECK_INTERVAL_MS
- TypeScript with strict mode
- README with setup and running instructions
Initialize git repo. Use @solana/kit and Helius or QuickNode as the transport layer.`,
  },
  {
    id: 'dapp-nextjs',
    name: 'dApp (Next.js)',
    description: 'Full-stack Solana dApp with wallet connect and on-chain interactions',
    tags: ['Frontend', 'Next.js'],
    icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
    prompt: `Scaffold a full-stack Solana dApp with Next.js. Include:
- Next.js 15 App Router with TypeScript
- Base the project on create-solana-dapp conventions where practical
- Phantom Connect or Wallet Standard setup (Phantom, Solflare, Backpack compatible)
- Connection provider with devnet/mainnet toggle
- Example pages: home (connect wallet), dashboard (show SOL balance, recent txs)
- Helius RPC integration for enhanced data
- Tailwind CSS for styling
- .env.example with NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_HELIUS_API_KEY
- README with dev server and deployment instructions
Initialize git repo. Prefer @solana/client, @solana/react-hooks, and @solana/web3-compat only when compatibility shims are needed.`,
  },
  {
    id: 'anchor-program',
    name: 'Anchor Program',
    description: 'Custom on-chain program with tests, client SDK, and IDL',
    tags: ['Anchor', 'Rust'],
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    prompt: `Scaffold a custom Solana Anchor program. Include:
- Anchor workspace with program, tests, and client
- Example instruction: initialize, update, close (demonstrating PDA patterns)
- Account validation with proper constraints
- Custom error codes
- TypeScript test suite using Anchor's current testing framework with LiteSVM-ready structure
- Client SDK with typed instruction builders
- IDL generation setup
- AVM setup notes and optional Mollusk test harness stub
- Deployment scripts for devnet
- .env.example with RPC_URL, WALLET_PATH, PROGRAM_ID
- README with build, test, and deploy instructions
Use Anchor 0.32+ with AVM. Initialize git repo.`,
  },
  {
    id: 'pump-token',
    name: 'Pump.fun Token',
    description: 'Token launch via Pump.fun with bonding curve and migration',
    tags: ['PumpFun', 'Launch'],
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    prompt: `Scaffold a Pump.fun token launch project. Include:
- Token creation script using Pump.fun API
- Bonding curve buy/sell scripts
- Migration monitoring (bonding curve → Raydium)
- Metadata preparation (name, symbol, description, image URL)
- Bundle buying strategy scripts (multi-wallet)
- Jito bundle integration for MEV protection
- Wallet generation and fund distribution utilities
- .env.example with RPC_URL, MASTER_WALLET_PATH, TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DESCRIPTION, IMAGE_URL
- README with full workflow guide
Use @solana/kit plus web3 compatibility only where Pump tooling requires it. Initialize git repo.`,
  },
  {
    id: 'telegram-bot',
    name: 'Telegram Bot',
    description: 'Solana wallet bot for Telegram with swap and snipe commands',
    tags: ['Bot', 'Telegram'],
    icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z',
    prompt: `Scaffold a Solana Telegram trading bot. Include:
- Telegram Bot API integration (grammy or telegraf)
- Wallet creation and management per user (encrypted storage)
- /start, /wallet, /balance, /buy, /sell, /snipe commands
- Jupiter swap integration for token buying/selling
- Token price checking via DexScreener or Birdeye API
- Auto-buy on new token detection (configurable)
- Position tracking per user
- SQLite database for user wallets and settings
- .env.example with TELEGRAM_BOT_TOKEN, RPC_URL, MASTER_WALLET_PATH
- README with setup and deployment guide
Use TypeScript with strict mode and @solana/kit for transaction construction. Initialize git repo.`,
  },
  {
    id: 'mcp-server',
    name: 'MCP Server',
    description: 'Model Context Protocol server with custom Solana tools',
    tags: ['MCP', 'AI'],
    icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z',
    prompt: `Scaffold a Model Context Protocol (MCP) server for Solana. Include:
- MCP server setup using @modelcontextprotocol/sdk
- Tools: get-balance, get-token-balances, send-sol, send-token, get-transaction-history
- Helius RPC integration for enhanced data
- Optional provider abstraction so the same server can target Helius or QuickNode
- Input validation with zod schemas
- Error handling with descriptive messages
- stdio transport for Claude Code integration
- .env.example with RPC_URL, HELIUS_API_KEY
- README with installation and Claude Code integration instructions
- Example .mcp.json configuration
Use TypeScript. Initialize git repo.`,
  },
  {
    id: 'solana-foundation',
    name: 'Solana Foundation App',
    description: 'Modern frontend starter aligned with current Solana app architecture',
    tags: ['Frontend', 'Kit'],
    icon: 'M5 12h14M12 5l7 7-7 7',
    prompt: `Scaffold a modern Solana application foundation. Include:
- create-solana-dapp-style project structure
- Next.js or React app shell with TypeScript
- @solana/client and @solana/react-hooks setup
- Wallet Standard integration with Phantom as the primary wallet experience
- Helius-backed RPC configuration plus a provider abstraction layer
- Example balance, token list, and send transaction flows
- .env.example with RPC_URL, HELIUS_API_KEY, NEXT_PUBLIC_CLUSTER
- README explaining how @solana/kit, @solana/client, and @solana/web3-compat fit together
Initialize git repo.`,
  },
]

// --- Wizard state machine ---

type WizardStep = 'templates' | 'configure' | 'building'

interface WizardState {
  step: WizardStep
  template: Template | null
  projectName: string
  savePath: string
}

function buildRuntimePrompt(settings: WalletInfrastructureSettings | null): string {
  if (!settings) return ''

  const rpcPreference = settings.rpcProvider === 'quicknode'
    ? `Use QuickNode as the preferred RPC provider. Endpoint hint: ${settings.quicknodeRpcUrl || 'expect QUICKNODE_RPC_URL from env'}.`
    : settings.rpcProvider === 'custom'
      ? `Use a custom RPC provider. Endpoint hint: ${settings.customRpcUrl || 'expect RPC_URL from env'}.`
      : settings.rpcProvider === 'public'
        ? 'Default to the public Solana RPC path and keep provider config overridable via env.'
        : 'Default to Helius-backed RPC and keep HELIUS_API_KEY support first-class.'

  const walletPreference = settings.preferredWallet === 'wallet-standard'
    ? 'Prefer Wallet Standard integration and keep Backpack, Solflare, and Phantom compatibility explicit.'
    : 'Prefer Phantom-first wallet integration while keeping Wallet Standard fallback paths available.'

  const executionPreference = settings.executionMode === 'jito'
    ? `Add an optional Jito execution path and environment variable for the block engine URL (${settings.jitoBlockEngineUrl || 'JITO_BLOCK_ENGINE_URL'}).`
    : 'Use standard RPC submission as the default transaction execution path.'

  return [
    'Runtime stack requirements from this DAEMON workspace:',
    `- ${rpcPreference}`,
    `- ${walletPreference}`,
    `- Use ${settings.swapProvider === 'jupiter' ? 'Jupiter' : settings.swapProvider} as the default swap and routing layer when swaps are part of the scaffold.`,
    `- ${executionPreference}`,
  ].join('\n')
}

function buildTemplateSpecificPrompt(templateId: string, settings: WalletInfrastructureSettings | null): string {
  if (!settings) return ''

  const walletFlow = settings.preferredWallet === 'phantom'
    ? [
        'For wallet scaffolding:',
        '- Build a dedicated `providers/phantom-provider` or equivalent app-level wallet wrapper.',
        '- Use the current official Phantom Connect SDK for the primary connect/sign flow.',
        '- Keep a secondary Wallet Standard compatibility layer so the app can expand beyond Phantom later.',
        '- Include clear connect, disconnect, sign message, and send transaction examples.',
      ]
    : [
        'For wallet scaffolding:',
        '- Build around Wallet Standard as the primary abstraction.',
        '- Keep Phantom, Backpack, and Solflare compatibility explicit in the provider layer.',
        '- Add a dedicated adapter boundary so wallet-specific behavior stays isolated from app pages and hooks.',
        '- Include connect, disconnect, sign message, and send transaction examples using the shared wallet abstraction.',
      ]

  const providerFlow = settings.rpcProvider === 'helius'
    ? '- Add a transport module that defaults to Helius and reads `HELIUS_API_KEY` plus `NEXT_PUBLIC_RPC_URL` or `RPC_URL` from env.'
    : settings.rpcProvider === 'quicknode'
      ? '- Add a transport module that defaults to QuickNode and reads `QUICKNODE_RPC_URL` from env while still allowing override via `RPC_URL`.'
      : settings.rpcProvider === 'custom'
        ? '- Add a transport module that reads `RPC_URL` from env and keeps provider-specific logic out of feature code.'
        : '- Add a transport module that defaults to public Solana RPC and allows easy switch-over to Helius or QuickNode later.'

  const executionFlow = settings.executionMode === 'jito'
    ? '- Include an execution service with a toggleable Jito path and `JITO_BLOCK_ENGINE_URL` in `.env.example`.'
    : '- Include an execution service boundary so RPC submission can later be upgraded to Jito without refactoring page-level code.'

  if (templateId === 'dapp-nextjs' || templateId === 'solana-foundation') {
    return [
      'Frontend architecture requirements:',
      ...walletFlow,
      providerFlow,
      executionFlow,
      '- Create `lib/solana/transport`, `lib/solana/wallet`, and `lib/solana/transactions` modules instead of mixing RPC logic into React components.',
      '- Add an example page that shows connected wallet, SOL balance, token list, and one transaction action using the chosen wallet path.',
      '- Include `.env.example` entries that match the selected provider and execution stack.',
    ].join('\n')
  }

  if (templateId === 'trading-bot' || templateId === 'pump-token' || templateId === 'telegram-bot') {
    return [
      'Execution architecture requirements:',
      providerFlow,
      executionFlow,
      '- Keep quote, build, sign, and submit steps separated into explicit services.',
      '- Add transaction logging that records provider choice, execution path, and signature.',
      '- Document how to switch between standard RPC submission and Jito in configuration.',
    ].join('\n')
  }

  if (templateId === 'mcp-server') {
    return [
      'MCP architecture requirements:',
      providerFlow,
      executionFlow,
      '- Separate read-only RPC methods from signing or transaction-submission methods.',
      '- Expose provider config through env vars and document failover behavior clearly.',
    ].join('\n')
  }

  return ''
}

export function ProjectStarter() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const setProjects = useUIStore((s) => s.setProjects)
  const projects = useUIStore((s) => s.projects)
  const closeDrawer = useWorkflowShellStore((s) => s.closeDrawer)

  const [wizard, setWizard] = useState<WizardState>({
    step: 'templates',
    template: null,
    projectName: '',
    savePath: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [walletInfrastructure, setWalletInfrastructure] = useState<WalletInfrastructureSettings | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // Focus name input when entering configure step
  useEffect(() => {
    if (wizard.step === 'configure') {
      setTimeout(() => nameRef.current?.focus(), 50)
    }
  }, [wizard.step])

  useEffect(() => {
    let cancelled = false
    void window.daemon.settings.getWalletInfrastructureSettings().then((res) => {
      if (cancelled || !res.ok || !res.data) return
      setWalletInfrastructure(res.data)
    }).catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const selectTemplate = useCallback((template: Template) => {
    setWizard({
      step: 'configure',
      template,
      projectName: '',
      savePath: '',
    })
    setError(null)
  }, [])

  const goBack = useCallback(() => {
    setWizard({ step: 'templates', template: null, projectName: '', savePath: '' })
    setError(null)
  }, [])

  const pickFolder = useCallback(async () => {
    const res = await window.daemon.projects.openDialog()
    if (res.ok && res.data) {
      setWizard((prev) => ({ ...prev, savePath: res.data as string }))
    }
  }, [])

  const startBuild = useCallback(async () => {
    if (!wizard.template || !wizard.projectName.trim() || !wizard.savePath) {
      setError('Fill in all fields')
      return
    }

    const name = wizard.projectName.trim()
    const projectPath = `${wizard.savePath}/${name}`

    setWizard((prev) => ({ ...prev, step: 'building' }))
    setError(null)

    try {
      // Create directory
      const mkdirRes = await window.daemon.fs.createDir(projectPath)
      if (!mkdirRes.ok) {
        setError(mkdirRes.error ?? 'Failed to create directory')
        setWizard((prev) => ({ ...prev, step: 'configure' }))
        return
      }

      // Register project in DB
      const projRes = await window.daemon.projects.create({ name, path: projectPath })
      if (!projRes.ok || !projRes.data) {
        setError(projRes.error ?? 'Failed to register project')
        setWizard((prev) => ({ ...prev, step: 'configure' }))
        return
      }

      const newProject = projRes.data as { id: string; name: string; path: string }

      // Refresh project list and switch to new project
      const listRes = await window.daemon.projects.list()
      if (listRes.ok && listRes.data) {
        setProjects(listRes.data as Project[])
      }
      setActiveProject(newProject.id, projectPath)

      // Spawn a terminal with Claude agent to scaffold the project
      const runtimePrompt = buildRuntimePrompt(walletInfrastructure)
      const templateSpecificPrompt = buildTemplateSpecificPrompt(wizard.template.id, walletInfrastructure)
      const agentPrompt = [
        `You are scaffolding a new project called "${name}" in the current directory.`,
        `The directory is empty and ready for you to create files.`,
        ``,
        wizard.template.prompt,
        runtimePrompt,
        templateSpecificPrompt,
        ``,
        `IMPORTANT: Create all files directly. Do not ask questions. Just build it.`,
        `After scaffolding, run any install commands (npm install / cargo build) as needed.`,
        `Keep output concise. When done, print "Project scaffolding complete."`,
      ].filter(Boolean).join('\n')

      const termRes = await window.daemon.terminal.create({
        cwd: projectPath,
        startupCommand: `claude --model claude-sonnet-4-20250514 --dangerously-skip-permissions -p "${agentPrompt.replace(/"/g, '\\"')}"`,
        userInitiated: true,
      })

      if (termRes.ok && termRes.data) {
        addTerminal(newProject.id, termRes.data.id, `Build: ${name}`, null)
        setCenterMode('canvas')
        closeDrawer()
      } else {
        setError(termRes.error ?? 'Failed to start build agent')
        setWizard((prev) => ({ ...prev, step: 'configure' }))
      }
    } catch (err) {
      setError(String(err))
      setWizard((prev) => ({ ...prev, step: 'configure' }))
    }
  }, [wizard, addTerminal, setCenterMode, setActiveProject, setProjects, closeDrawer])

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && wizard.projectName.trim() && wizard.savePath) {
      startBuild()
    }
  }

  const filteredTemplates = filter
    ? TEMPLATES.filter((t) =>
        t.name.toLowerCase().includes(filter.toLowerCase()) ||
        t.description.toLowerCase().includes(filter.toLowerCase()) ||
        t.tags.some((tag) => tag.toLowerCase().includes(filter.toLowerCase()))
      )
    : TEMPLATES

  // --- Templates grid ---
  if (wizard.step === 'templates') {
    return (
      <div className="starter-panel">
        <div className="starter-hero">
          <h2 className="starter-title">What do you want to build?</h2>
          <p className="starter-subtitle">Pick a template and we'll scaffold it with AI</p>
          <input
            className="starter-filter"
            placeholder="Filter templates..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="starter-grid">
          {filteredTemplates.map((t) => (
            <button key={t.id} className="starter-card" onClick={() => selectTemplate(t)}>
              <div className="starter-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.icon} />
                </svg>
              </div>
              <div className="starter-card-body">
                <div className="starter-card-name">{t.name}</div>
                <div className="starter-card-desc">{t.description}</div>
              </div>
              <div className="starter-card-tags">
                {t.tags.map((tag) => (
                  <span key={tag} className="starter-tag">{tag}</span>
                ))}
              </div>
            </button>
          ))}
          {filteredTemplates.length === 0 && (
            <div className="starter-empty">No templates match "{filter}"</div>
          )}
        </div>
      </div>
    )
  }

  // --- Configure step ---
  if (wizard.step === 'configure' && wizard.template) {
    const displayPath = wizard.savePath
      ? `${wizard.savePath}/${wizard.projectName.trim() || '...'}`
      : 'Choose a location...'
    const runtimeSummary = walletInfrastructure ? [
      walletInfrastructure.rpcProvider === 'quicknode' ? 'QuickNode RPC' : walletInfrastructure.rpcProvider === 'custom' ? 'Custom RPC' : walletInfrastructure.rpcProvider === 'public' ? 'Public RPC' : 'Helius RPC',
      walletInfrastructure.preferredWallet === 'phantom' ? 'Phantom-first wallet flow' : 'Wallet Standard flow',
      walletInfrastructure.executionMode === 'jito' ? 'Jito execution' : 'RPC execution',
    ] : []

    return (
      <div className="starter-panel">
        <button className="starter-back" onClick={goBack}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to templates
        </button>

        <div className="starter-configure">
          <div className="starter-configure-header">
            <div className="starter-card-icon starter-card-icon--lg">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={wizard.template.icon} />
              </svg>
            </div>
            <div>
              <h2 className="starter-configure-title">{wizard.template.name}</h2>
              <p className="starter-configure-desc">{wizard.template.description}</p>
            </div>
          </div>

          <div className="starter-field">
            <label className="starter-label">Project Name</label>
            <input
              ref={nameRef}
              className="starter-input"
              placeholder="my-solana-project"
              value={wizard.projectName}
              onChange={(e) => setWizard((prev) => ({ ...prev, projectName: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') }))}
              onKeyDown={handleNameKeyDown}
              maxLength={64}
            />
          </div>

          <div className="starter-field">
            <label className="starter-label">Save Location</label>
            <div className="starter-path-row">
              <div className="starter-path-display">{displayPath}</div>
              <button className="starter-browse-btn" onClick={pickFolder}>Browse</button>
            </div>
          </div>

          {runtimeSummary.length > 0 && (
            <div className="starter-runtime-card">
              <div className="starter-runtime-title">Solana Runtime Preset</div>
              <div className="starter-runtime-copy">
                This scaffold will follow the current DAEMON Solana runtime preferences.
              </div>
              <div className="starter-runtime-tags">
                {runtimeSummary.map((item) => (
                  <span key={item} className="starter-tag">{item}</span>
                ))}
              </div>
            </div>
          )}

          {error && <div className="starter-error">{error}</div>}

          <button
            className="starter-build-btn"
            onClick={startBuild}
            disabled={!wizard.projectName.trim() || !wizard.savePath}
          >
            Build Project
          </button>
        </div>
      </div>
    )
  }

  // --- Building step ---
  return (
    <div className="starter-panel">
      <div className="starter-building">
        <div className="starter-spinner" />
        <h3 className="starter-building-title">Scaffolding {wizard.projectName}...</h3>
        <p className="starter-building-desc">
          A Claude agent is building your {wizard.template?.name} project.
          Check the terminal for progress.
        </p>
      </div>
    </div>
  )
}

export default ProjectStarter

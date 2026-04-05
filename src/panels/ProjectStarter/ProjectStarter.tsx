import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
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
Use @solana/web3.js v2 and anchor. Initialize git repo.`,
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
Use Metaplex Umi framework. Initialize git repo.`,
  },
  {
    id: 'trading-bot',
    name: 'Trading Bot',
    description: 'Jupiter swap bot with price monitoring and auto-execution',
    tags: ['DeFi', 'Jupiter'],
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    prompt: `Scaffold a Solana trading bot project. Include:
- Jupiter API v6 integration for swaps (quote + execute)
- Price monitoring loop with configurable intervals
- Wallet management with keypair loading from file
- Position tracking and P&L calculation
- Configurable slippage, amount, and token pairs
- Logging with timestamps
- .env.example with RPC_URL, WALLET_PATH, TOKEN_MINT_A, TOKEN_MINT_B, SLIPPAGE_BPS, CHECK_INTERVAL_MS
- TypeScript with strict mode
- README with setup and running instructions
Initialize git repo. Use @solana/web3.js v2.`,
  },
  {
    id: 'dapp-nextjs',
    name: 'dApp (Next.js)',
    description: 'Full-stack Solana dApp with wallet connect and on-chain interactions',
    tags: ['Frontend', 'Next.js'],
    icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
    prompt: `Scaffold a full-stack Solana dApp with Next.js. Include:
- Next.js 15 App Router with TypeScript
- Wallet adapter setup (Phantom, Solflare, Backpack)
- Connection provider with devnet/mainnet toggle
- Example pages: home (connect wallet), dashboard (show SOL balance, recent txs)
- Helius RPC integration for enhanced data
- Tailwind CSS for styling
- .env.example with NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_HELIUS_API_KEY
- README with dev server and deployment instructions
Initialize git repo. Use @solana/wallet-adapter-react.`,
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
- TypeScript test suite using anchor's testing framework
- Client SDK with typed instruction builders
- IDL generation setup
- Deployment scripts for devnet
- .env.example with RPC_URL, WALLET_PATH, PROGRAM_ID
- README with build, test, and deploy instructions
Use anchor 0.30+. Initialize git repo.`,
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
Use @solana/web3.js v2. Initialize git repo.`,
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
Use TypeScript with strict mode. Initialize git repo.`,
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
- Input validation with zod schemas
- Error handling with descriptive messages
- stdio transport for Claude Code integration
- .env.example with RPC_URL, HELIUS_API_KEY
- README with installation and Claude Code integration instructions
- Example .mcp.json configuration
Use TypeScript. Initialize git repo.`,
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

export function ProjectStarter() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const setProjects = useUIStore((s) => s.setProjects)
  const projects = useUIStore((s) => s.projects)
  const closeDrawer = useUIStore((s) => s.closeDrawer)

  const [wizard, setWizard] = useState<WizardState>({
    step: 'templates',
    template: null,
    projectName: '',
    savePath: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  // Focus name input when entering configure step
  useEffect(() => {
    if (wizard.step === 'configure') {
      setTimeout(() => nameRef.current?.focus(), 50)
    }
  }, [wizard.step])

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
      const agentPrompt = [
        `You are scaffolding a new project called "${name}" in the current directory.`,
        `The directory is empty and ready for you to create files.`,
        ``,
        wizard.template.prompt,
        ``,
        `IMPORTANT: Create all files directly. Do not ask questions. Just build it.`,
        `After scaffolding, run any install commands (npm install / cargo build) as needed.`,
        `Keep output concise. When done, print "Project scaffolding complete."`,
      ].join('\n')

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

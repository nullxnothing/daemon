import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useNotificationsStore } from '../../store/notifications'
import { useAppActions } from '../../store/appActions'
import './ProjectStarter.css'

// --- Template definitions ---

export interface Template {
  id: string
  name: string
  description: string
  tags: string[]
  icon: string
  prompt: string
}

export const TEMPLATES: Template[] = [
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
  {
    id: 'perps-trading-bot',
    name: 'Perps Trading Bot',
    description: 'Automated perps trader on Drift, Jupiter Perps, or Ranger (multi-venue)',
    tags: ['Perps', 'Bot', 'DeFi'],
    icon: 'M3 3v18h18M7 14l4-4 4 4 6-6',
    prompt: `Scaffold a Solana perps trading bot. Include:
- Venue abstraction layer that can target Drift (@drift-labs/sdk), Jupiter Perps API, or Ranger SDK
- Default to Ranger SDK for multi-venue smart-order routing; allow swap to direct Drift via env flag
- Position management: open, close, adjust leverage, set TP/SL
- Funding rate monitor across venues with arbitrage hooks
- Pyth or Switchboard price feed integration for mark price + liquidation guard
- Risk module: max position size, max drawdown circuit breaker, kill switch
- Helius RPC + Sender for tx submission with priority fee estimation
- Optional Jito bundle path for atomic open+hedge
- Strategy interface so users can drop in their own signal logic
- .env.example with RPC_URL, HELIUS_API_KEY, WALLET_PATH, VENUE, MARKET_INDEX, MAX_POSITION_USD
- TypeScript strict mode, structured logging, graceful shutdown
- README with setup, devnet test path, and mainnet deploy guide
Initialize git repo. Use @solana/kit for transaction construction.`,
  },
  {
    id: 'perps-vault',
    name: 'Perps Vault Strategy',
    description: 'Delegated vault running a perps strategy (basis, funding farm, market making)',
    tags: ['Perps', 'Vault', 'DeFi'],
    icon: 'M12 2l9 4.9V17L12 22 3 17V6.9L12 2zM12 22V12M3 6.9L12 12l9-5.1',
    prompt: `Scaffold a Solana perps vault strategy. Include:
- Drift Vaults SDK integration (@drift-labs/vaults-sdk) as the primary path; GLAM as alternate
- Vault initialization, deposit, withdraw, and management instructions
- Strategy template: delta-neutral funding farm (long spot + short perp) with periodic rebalance
- Performance accounting: NAV, share price, high-water-mark, management/perf fees
- Depositor flow: subscription, redemption queue, lock-up handling
- Risk guardrails: max leverage, max concentration, oracle deviation halt
- Pyth Lazer for sub-second price + Helius LaserStream for fill events
- Manager UI stub (Next.js) showing vault stats, position, depositor list
- .env.example with RPC_URL, HELIUS_API_KEY, WALLET_PATH, VAULT_NAME, MAX_LEVERAGE
- TypeScript strict, Vitest unit tests for accounting math
- README covering Surfpool fork test, devnet deploy, mainnet checklist
Initialize git repo.`,
  },
  {
    id: 'perps-frontend',
    name: 'Perps Frontend (dApp)',
    description: 'Next.js trading interface on top of Drift, Jupiter Perps, or Adrena',
    tags: ['Perps', 'Frontend', 'Next.js'],
    icon: 'M4 6h16M4 12h16M4 18h10',
    prompt: `Scaffold a Solana perps trading frontend. Include:
- Next.js 15 App Router with TypeScript and Tailwind
- Venue selection at build time: Drift / Jupiter Perps / Adrena (default Jupiter Perps for breadth of markets)
- Phantom Connect SDK + Wallet Standard fallback
- Trading UI: market selector, orderbook or quote panel, leverage slider, size input, TP/SL
- Position list with live PnL via Pyth + WebSocket subscriptions
- Funding rate display, mark vs index basis, liquidation price
- Helius RPC proxy route to keep API key server-side
- Sender endpoint for tx submission with priority fee estimation
- Skeletons, optimistic updates, error toasts, mobile-responsive layout
- .env.example with NEXT_PUBLIC_RPC_URL, HELIUS_API_KEY, NEXT_PUBLIC_VENUE
- Vercel deploy preset
- README with screenshots placeholder and venue switch guide
Initialize git repo.`,
  },
  {
    id: 'perps-liquidator',
    name: 'Perps Liquidator Bot',
    description: 'Liquidation keeper for Drift, Adrena, or Flash perps with profit guard',
    tags: ['Perps', 'Bot', 'MEV'],
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    prompt: `Scaffold a Solana perps liquidator bot. Include:
- Helius LaserStream subscription for account-state deltas on perps markets (Drift primary)
- Health-factor scanner that ranks accounts by margin ratio in real time
- Liquidation tx builder using Drift SDK with proper IX ordering and account loading
- Pyth price refresh ix bundling so oracle is fresh at liquidation slot
- Jito bundle submission with tip strategy and bundle revert protection
- Profit guard: simulate before send, abort if estimated payout < threshold
- Account watchlist persistence (sqlite) and resume after restart
- Metrics: liquidations attempted, won, lost, gross PnL, tip burn
- .env.example with RPC_URL, HELIUS_API_KEY, LASERSTREAM_URL, JITO_BLOCK_ENGINE_URL, WALLET_PATH, MIN_PROFIT_USD
- TypeScript strict, structured logging, panic-handler for hot loops
- README with mainnet caveats and devnet simulation path
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

export function buildRuntimePrompt(settings: WalletInfrastructureSettings | null): string {
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
    '- Read the generated `daemon.solana-runtime.json` file and wire the scaffold around that runtime preset instead of inventing a different stack.',
  ].join('\n')
}

export function buildRuntimePreset(settings: WalletInfrastructureSettings | null) {
  if (!settings) return null

  return {
    version: 1,
    generatedBy: 'DAEMON',
    generatedAt: new Date().toISOString(),
    transport: {
      provider: settings.rpcProvider,
      quicknodeRpcUrl: settings.quicknodeRpcUrl || null,
      customRpcUrl: settings.customRpcUrl || null,
    },
    wallet: {
      preferredWallet: settings.preferredWallet,
    },
    execution: {
      mode: settings.executionMode,
      jitoBlockEngineUrl: settings.jitoBlockEngineUrl,
    },
    swaps: {
      provider: settings.swapProvider,
    },
  }
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

  if (templateId === 'trading-bot' || templateId === 'telegram-bot') {
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

  if (PERPS_TEMPLATE_IDS.includes(templateId)) {
    return buildPerpsPromptAddon(templateId, settings)
  }

  return ''
}

export const PERPS_TEMPLATE_IDS: string[] = [
  'perps-trading-bot',
  'perps-vault',
  'perps-frontend',
  'perps-liquidator',
]

export function buildPerpsPromptAddon(
  templateId: string,
  settings: WalletInfrastructureSettings | null,
): string {
  if (!settings) return ''

  const senderHint = settings.executionMode === 'jito'
    ? `- Wire Helius Sender as the default tx submission path with Jito fallback at ${settings.jitoBlockEngineUrl || 'JITO_BLOCK_ENGINE_URL'}.`
    : '- Wire Helius Sender as the default tx submission path so the user can flip on Jito later without refactoring.'

  const rpcHint = settings.rpcProvider === 'helius'
    ? '- Default to Helius RPC; read HELIUS_API_KEY from env. Use LaserStream for sub-second account/price subscriptions.'
    : settings.rpcProvider === 'quicknode'
      ? '- Default to QuickNode RPC via QUICKNODE_RPC_URL; document Helius LaserStream as the streaming option for liquidations and fill events.'
      : '- Read RPC_URL from env; document Helius LaserStream as the recommended streaming option for liquidations and fill events.'

  const walletHint = settings.preferredWallet === 'phantom'
    ? '- Use Phantom Connect SDK as the primary signer for any frontend surface.'
    : '- Use Wallet Standard as the primary signer abstraction; keep Phantom/Backpack/Solflare adapters wired.'

  const common = [
    'Perps architecture requirements:',
    rpcHint,
    senderHint,
    '- Keep venue selection behind a single VENUE env flag so the same bundle can target Drift, Jupiter Perps, Ranger, or Adrena.',
    '- Treat Pyth (or Pyth Lazer) as the canonical price source; never use mark price from the venue alone for risk decisions.',
    '- Never hardcode market indices or program IDs; load from a config module that can be swapped per cluster.',
    '- Add a Surfpool fork script (`pnpm dev:surfpool`) that clones mainnet state for the chosen venue programs.',
  ]

  if (templateId === 'perps-trading-bot') {
    return [
      ...common,
      walletHint,
      '- Strategy interface must be a single file the user can edit without touching venue plumbing.',
      '- Include a kill-switch CLI command and a max-drawdown circuit breaker that halts new entries.',
      '- Default routing layer: Ranger SDK; add an env flag VENUE=drift|jupiter|ranger to switch.',
    ].join('\n')
  }

  if (templateId === 'perps-vault') {
    return [
      ...common,
      '- Use Drift Vaults SDK by default; expose a manager CLI with init/deposit/withdraw/rebalance commands.',
      '- Accounting math (NAV, share price, HWM, perf fee) must live in a pure module with Vitest coverage.',
      '- Document the strategy invariant clearly in README so depositors understand the risk profile.',
    ].join('\n')
  }

  if (templateId === 'perps-frontend') {
    return [
      ...common,
      walletHint,
      '- Proxy all signed-RPC calls through a Next.js route handler so HELIUS_API_KEY never reaches the browser.',
      '- Stream prices and fills via WebSocket/LaserStream; never poll on a tight interval from the client.',
      '- Default venue: Jupiter Perps (broadest market coverage). Make venue switch a build-time env.',
    ].join('\n')
  }

  if (templateId === 'perps-liquidator') {
    return [
      ...common,
      '- Use Helius LaserStream for account deltas; do not poll getProgramAccounts in a hot loop.',
      '- Always bundle a Pyth price refresh ix in front of the liquidate ix; abort if oracle is stale.',
      '- Profit guard must simulate the bundle and compare estimated payout to MIN_PROFIT_USD before send.',
      '- Default submission path: Jito bundles via Helius Sender with tip estimation.',
    ].join('\n')
  }

  return common.join('\n')
}

interface ScaffoldFile {
  path: string
  content: string
}

interface DeterministicScaffold {
  dirs: string[]
  files: ScaffoldFile[]
}

function packageName(projectName: string): string {
  return projectName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'daemon-project'
}

function quotedJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function envForTemplate(templateId: string): string {
  const common = [
    'RPC_URL=https://api.devnet.solana.com',
    'HELIUS_API_KEY=',
    'WALLET_PATH=~/.config/solana/id.json',
  ]

  const byTemplate: Record<string, string[]> = {
    'nft-collection': ['COLLECTION_NAME=Daemon Collection', 'COLLECTION_SIZE=1000'],
    'trading-bot': ['TOKEN_MINT_A=So11111111111111111111111111111111111111112', 'TOKEN_MINT_B=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'SLIPPAGE_BPS=50', 'CHECK_INTERVAL_MS=10000'],
    'telegram-bot': ['TELEGRAM_BOT_TOKEN=', 'MASTER_WALLET_PATH=~/.config/solana/id.json'],
    'mcp-server': [],
    'solana-foundation': ['NEXT_PUBLIC_CLUSTER=devnet'],
    'dapp-nextjs': ['NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com', 'NEXT_PUBLIC_HELIUS_API_KEY='],
    'perps-trading-bot': ['VENUE=drift', 'MARKET_INDEX=0', 'MAX_POSITION_USD=100'],
    'perps-vault': ['VAULT_NAME=daemon-vault', 'MAX_LEVERAGE=2'],
    'perps-frontend': ['NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com', 'NEXT_PUBLIC_VENUE=jupiter', 'HELIUS_API_KEY='],
    'perps-liquidator': ['LASERSTREAM_URL=', 'JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf/api/v1/transactions', 'MIN_PROFIT_USD=5'],
  }

  return [...common, ...(byTemplate[templateId] ?? [])].join('\n') + '\n'
}

function buildPackageJson(template: Template, projectName: string) {
  const isNext = ['dapp-nextjs', 'solana-foundation', 'perps-frontend'].includes(template.id)
  const isAnchor = template.id === 'anchor-program'
  const dependencies: Record<string, string> = isNext
    ? {
        '@solana/kit': '^2.3.0',
        next: '^15.5.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        zod: '^3.25.0',
      }
    : {
        '@solana/kit': '^2.3.0',
        dotenv: '^16.4.7',
        pino: '^9.7.0',
        zod: '^3.25.0',
      }

  if (template.id === 'mcp-server') dependencies['@modelcontextprotocol/sdk'] = '^1.17.0'
  if (template.id === 'telegram-bot') dependencies.grammy = '^1.37.0'
  if (template.id.startsWith('perps-')) dependencies['@pythnetwork/price-service-client'] = '^1.9.0'
  if (template.id === 'trading-bot') dependencies['@jup-ag/api'] = '^6.0.42'
  if (template.id === 'nft-collection') dependencies['@metaplex-foundation/umi'] = '^1.2.0'

  return {
    name: packageName(projectName),
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: isNext
      ? {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          typecheck: 'tsc --noEmit',
        }
      : isAnchor
        ? {
            build: 'anchor build',
            test: 'anchor test',
            typecheck: 'tsc --noEmit',
          }
        : {
            dev: 'tsx src/index.ts',
            build: 'tsc',
            start: 'node dist/index.js',
            typecheck: 'tsc --noEmit',
          },
    dependencies,
    devDependencies: isNext
      ? {
          '@types/node': '^22.10.0',
          '@types/react': '^19.0.0',
          '@types/react-dom': '^19.0.0',
          typescript: '^5.9.0',
        }
      : {
          '@types/node': '^22.10.0',
          tsx: '^4.20.0',
          typescript: '^5.9.0',
          vitest: '^2.1.0',
        },
  }
}

function readmeForTemplate(template: Template, projectName: string): string {
  return `# ${projectName}

Deterministic DAEMON scaffold for **${template.name}**.

## Setup

\`\`\`bash
pnpm install
cp .env.example .env
pnpm dev
\`\`\`

## Runtime

DAEMON writes \`daemon.solana-runtime.json\` at project creation time. Keep RPC, wallet, execution, and venue settings configurable from that file and environment variables.

## Template Scope

${template.prompt.replace(/^/gm, '> ')}

## Next Steps

- Fill in \`.env\`.
- Run \`pnpm typecheck\`.
- Add protocol-specific credentials and program IDs in \`src/config.ts\`.
- Ask Claude or Codex only when you want custom strategy logic, audits, or feature work beyond this base scaffold.
`
}

function nextAppFiles(template: Template, projectName: string): ScaffoldFile[] {
  return [
    {
      path: 'src/config.ts',
      content: `export const runtimeConfig = {\n  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? process.env.RPC_URL ?? 'https://api.devnet.solana.com',\n  venue: process.env.NEXT_PUBLIC_VENUE ?? process.env.VENUE ?? 'jupiter',\n  cluster: process.env.NEXT_PUBLIC_CLUSTER ?? 'devnet',\n}\n`,
    },
    {
      path: 'app/layout.tsx',
      content: `import type { ReactNode } from 'react'\nimport './globals.css'\n\nexport const metadata = { title: '${projectName}', description: '${template.description}' }\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>\n}\n`,
    },
    {
      path: 'app/page.tsx',
      content: `import { runtimeConfig } from '../src/config'\n\nexport default function Home() {\n  return (\n    <main className="page-shell">\n      <section className="workspace-header">\n        <p className="eyebrow">DAEMON Scaffold</p>\n        <h1>${projectName}</h1>\n        <p>${template.description}</p>\n      </section>\n      <section className="panel-grid">\n        <div><span>RPC</span><strong>{runtimeConfig.rpcUrl}</strong></div>\n        <div><span>Venue</span><strong>{runtimeConfig.venue}</strong></div>\n        <div><span>Cluster</span><strong>{runtimeConfig.cluster}</strong></div>\n      </section>\n    </main>\n  )\n}\n`,
    },
    {
      path: 'app/globals.css',
      content: `:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #080b0f; color: #f5f7fb; }\nbody { margin: 0; }\n.page-shell { min-height: 100vh; padding: 48px; background: #080b0f; }\n.workspace-header { max-width: 760px; }\n.eyebrow { color: #14f195; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }\nh1 { font-size: 44px; margin: 8px 0; }\np { color: #a8b3c7; line-height: 1.6; }\n.panel-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 32px; max-width: 960px; }\n.panel-grid div { border: 1px solid #263040; border-radius: 8px; padding: 16px; background: #101620; }\n.panel-grid span { display: block; color: #7d8aa3; font-size: 12px; margin-bottom: 8px; }\n.panel-grid strong { font-size: 14px; overflow-wrap: anywhere; }\n@media (max-width: 720px) { .page-shell { padding: 28px; } .panel-grid { grid-template-columns: 1fr; } h1 { font-size: 34px; } }\n`,
    },
    { path: 'next.config.mjs', content: `const nextConfig = {}\nexport default nextConfig\n` },
  ]
}

function anchorFiles(projectName: string): ScaffoldFile[] {
  const crateName = packageName(projectName).replace(/-/g, '_')
  return [
    { path: 'Anchor.toml', content: `[features]\nseeds = false\nskip-lint = false\n\n[programs.localnet]\n${crateName} = "11111111111111111111111111111111"\n\n[provider]\ncluster = "localnet"\nwallet = "~/.config/solana/id.json"\n\n[scripts]\ntest = "pnpm vitest run"\n` },
    { path: 'programs/' + crateName + '/Cargo.toml', content: `[package]\nname = "${crateName}"\nversion = "0.1.0"\nedition = "2021"\n\n[lib]\ncrate-type = ["cdylib", "lib"]\nname = "${crateName}"\n\n[dependencies]\nanchor-lang = "0.32.0"\n` },
    { path: 'programs/' + crateName + '/src/lib.rs', content: `use anchor_lang::prelude::*;\n\ndeclare_id!("11111111111111111111111111111111");\n\n#[program]\npub mod ${crateName} {\n    use super::*;\n\n    pub fn initialize(ctx: Context<Initialize>, value: u64) -> Result<()> {\n        ctx.accounts.state.authority = ctx.accounts.authority.key();\n        ctx.accounts.state.value = value;\n        Ok(())\n    }\n\n    pub fn update(ctx: Context<Update>, value: u64) -> Result<()> {\n        ctx.accounts.state.value = value;\n        Ok(())\n    }\n}\n\n#[derive(Accounts)]\npub struct Initialize<'info> {\n    #[account(init, payer = authority, space = 8 + State::INIT_SPACE)]\n    pub state: Account<'info, State>,\n    #[account(mut)]\n    pub authority: Signer<'info>,\n    pub system_program: Program<'info, System>,\n}\n\n#[derive(Accounts)]\npub struct Update<'info> {\n    #[account(mut, has_one = authority)]\n    pub state: Account<'info, State>,\n    pub authority: Signer<'info>,\n}\n\n#[account]\n#[derive(InitSpace)]\npub struct State {\n    pub authority: Pubkey,\n    pub value: u64,\n}\n` },
    { path: 'tests/' + crateName + '.test.ts', content: `import { describe, expect, it } from 'vitest'\n\ndescribe('${crateName}', () => {\n  it('has a placeholder client test', () => {\n    expect('${crateName}').toContain('${crateName}')\n  })\n})\n` },
  ]
}

function nodeAppFiles(template: Template): ScaffoldFile[] {
  const title = template.name
  return [
    {
      path: 'src/config.ts',
      content: `import 'dotenv/config'\n\nexport const config = {\n  rpcUrl: process.env.RPC_URL ?? 'https://api.devnet.solana.com',\n  heliusApiKey: process.env.HELIUS_API_KEY ?? '',\n  walletPath: process.env.WALLET_PATH ?? '~/.config/solana/id.json',\n  venue: process.env.VENUE ?? 'drift',\n  marketIndex: Number(process.env.MARKET_INDEX ?? '0'),\n}\n`,
    },
    {
      path: 'src/logger.ts',
      content: `import pino from 'pino'\n\nexport const logger = pino({\n  level: process.env.LOG_LEVEL ?? 'info',\n})\n`,
    },
    {
      path: 'src/index.ts',
      content: `import { config } from './config'\nimport { logger } from './logger'\n\nlet shuttingDown = false\n\nasync function main() {\n  logger.info({ template: '${title}', rpcUrl: config.rpcUrl, venue: config.venue }, 'starting DAEMON scaffold')\n  logger.info('replace src/strategy.ts with your project-specific logic')\n}\n\nprocess.on('SIGINT', () => { shuttingDown = true; logger.warn({ shuttingDown }, 'shutdown requested'); process.exit(0) })\nprocess.on('SIGTERM', () => { shuttingDown = true; logger.warn({ shuttingDown }, 'shutdown requested'); process.exit(0) })\n\nmain().catch((err) => {\n  logger.error({ err }, 'fatal startup error')\n  process.exit(1)\n})\n`,
    },
    {
      path: 'src/strategy.ts',
      content: `export interface StrategySignal {\n  action: 'hold' | 'buy' | 'sell' | 'open-long' | 'open-short' | 'close'\n  reason: string\n}\n\nexport async function evaluateStrategy(): Promise<StrategySignal> {\n  return { action: 'hold', reason: 'starter scaffold: implement your signal logic here' }\n}\n`,
    },
  ]
}

function commonFiles(template: Template, projectName: string): ScaffoldFile[] {
  return [
    { path: 'package.json', content: quotedJson(buildPackageJson(template, projectName)) },
    { path: '.gitignore', content: `node_modules\ndist\n.next\n.env\n.DS_Store\ntarget\n.anchor\n` },
    { path: '.env.example', content: envForTemplate(template.id) },
    { path: 'README.md', content: readmeForTemplate(template, projectName) },
    { path: 'tsconfig.json', content: quotedJson({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, esModuleInterop: true, skipLibCheck: true, outDir: 'dist' }, include: ['src', 'app', 'tests'] }) },
  ]
}

export function buildDeterministicScaffold(template: Template, projectName: string): DeterministicScaffold {
  const isNext = ['dapp-nextjs', 'solana-foundation', 'perps-frontend'].includes(template.id)
  const files = [
    ...commonFiles(template, projectName),
    ...(template.id === 'anchor-program' ? anchorFiles(projectName) : isNext ? nextAppFiles(template, projectName) : nodeAppFiles(template)),
  ]

  const dirs = new Set<string>(['src'])
  for (const file of files) {
    const parts = file.path.split('/').slice(0, -1)
    for (let i = 1; i <= parts.length; i += 1) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }

  return {
    dirs: [...dirs].filter(Boolean),
    files,
  }
}

export function ProjectStarter() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const addTerminal = useUIStore((s) => s.addTerminal)
  const setCenterMode = useUIStore((s) => s.setCenterMode)
  const setActiveProject = useUIStore((s) => s.setActiveProject)
  const setActiveWorkspaceTool = useUIStore((s) => s.setActiveWorkspaceTool)
  const setProjects = useUIStore((s) => s.setProjects)
  const projects = useUIStore((s) => s.projects)
  const closeDrawer = useWorkflowShellStore((s) => s.closeDrawer)
  const focusTerminal = useAppActions((s) => s.focusTerminal)

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
    const sessionId = `scaffold-${crypto.randomUUID()}`

    setWizard((prev) => ({ ...prev, step: 'building' }))
    setError(null)
    useNotificationsStore.getState().addActivity({
      kind: 'info',
      context: 'Scaffold',
      message: `Started ${wizard.template.name} scaffold for ${name} at ${projectPath}`,
      sessionId,
      sessionStatus: 'created',
      projectName: name,
    })

    try {
      // Register the project before using sandboxed filesystem APIs so the
      // target path is treated as a valid project root during scaffolding.
      const projRes = await window.daemon.projects.create({ name, path: projectPath })
      if (!projRes.ok || !projRes.data) {
        useNotificationsStore.getState().addActivity({
          kind: 'error',
          context: 'Scaffold',
          message: projRes.error ?? `Failed to register project ${name}`,
          sessionId,
          sessionStatus: 'failed',
          projectName: name,
        })
        setError(projRes.error ?? 'Failed to register project')
        setWizard((prev) => ({ ...prev, step: 'configure' }))
        return
      }

      const newProject = projRes.data as { id: string; name: string; path: string }
      const cleanupProject = async () => {
        await window.daemon.projects.delete(newProject.id)
      }

      const mkdirRes = await window.daemon.fs.createDir(projectPath)
      if (!mkdirRes.ok) {
        useNotificationsStore.getState().addActivity({
          kind: 'error',
          context: 'Scaffold',
          message: mkdirRes.error ?? `Failed to create project directory for ${name}`,
          sessionId,
          sessionStatus: 'failed',
          projectId: newProject.id,
          projectName: name,
        })
        await cleanupProject()
        setError(mkdirRes.error ?? 'Failed to create directory')
        setWizard((prev) => ({ ...prev, step: 'configure' }))
        return
      }

      // Refresh project list and switch to new project
      const listRes = await window.daemon.projects.list()
      if (listRes.ok && listRes.data) {
        setProjects(listRes.data as Project[])
      }
      setActiveProject(newProject.id, projectPath)

      const runtimePreset = buildRuntimePreset(walletInfrastructure)
      if (runtimePreset) {
        const runtimePresetRes = await window.daemon.fs.writeFile(
          `${projectPath}/daemon.solana-runtime.json`,
          `${JSON.stringify(runtimePreset, null, 2)}\n`,
        )
        if (!runtimePresetRes.ok) {
          useNotificationsStore.getState().addActivity({
            kind: 'error',
            context: 'Scaffold',
            message: runtimePresetRes.error ?? `Failed to write runtime preset for ${name}`,
            sessionId,
            sessionStatus: 'failed',
            projectId: newProject.id,
            projectName: name,
          })
          await cleanupProject()
          setError(runtimePresetRes.error ?? 'Failed to write runtime preset')
          setWizard((prev) => ({ ...prev, step: 'configure' }))
          return
        }
      }


      const scaffold = buildDeterministicScaffold(wizard.template, name)
      try {
        for (const dir of scaffold.dirs) {
          const dirRes = await window.daemon.fs.createDir(`${projectPath}/${dir}`)
          if (!dirRes.ok) {
            throw new Error(dirRes.error ?? `Failed to create ${dir}`)
          }
        }

        for (const file of scaffold.files) {
          const fileRes = await window.daemon.fs.writeFile(`${projectPath}/${file.path}`, file.content)
          if (!fileRes.ok) {
            throw new Error(fileRes.error ?? `Failed to write ${file.path}`)
          }
        }
      } catch (scaffoldErr) {
        useNotificationsStore.getState().addActivity({
          kind: 'error',
          context: 'Scaffold',
          message: scaffoldErr instanceof Error ? scaffoldErr.message : String(scaffoldErr),
          sessionId,
          sessionStatus: 'failed',
          projectId: newProject.id,
          projectName: name,
        })
        await cleanupProject()
        setError(scaffoldErr instanceof Error ? scaffoldErr.message : String(scaffoldErr))
        setWizard((prev) => ({ ...prev, step: 'configure' }))
        return
      }

      const termRes = await window.daemon.terminal.create({
        cwd: projectPath,
        userInitiated: true,
      })

      if (termRes.ok && termRes.data) {
        addTerminal(newProject.id, termRes.data.id, `Terminal: ${name}`, null)
        useNotificationsStore.getState().addActivity({
          kind: 'success',
          context: 'Scaffold',
          message: `Project scaffold written for ${name}. Open terminal is idle; run pnpm install when ready.`,
          sessionId,
          sessionStatus: 'running',
          projectId: newProject.id,
          projectName: name,
        })
        setCenterMode('canvas')
        setActiveWorkspaceTool(null)
        focusTerminal()
        closeDrawer()
      } else {
        useNotificationsStore.getState().addActivity({
          kind: 'error',
          context: 'Scaffold',
          message: termRes.error ?? `Scaffold written, but setup terminal failed for ${name}`,
          sessionId,
          sessionStatus: 'failed',
          projectId: newProject.id,
          projectName: name,
        })
        setError(termRes.error ?? 'Scaffold written, but setup terminal failed')
        setWizard((prev) => ({ ...prev, step: 'configure' }))
      }
    } catch (err) {
      useNotificationsStore.getState().addActivity({
        kind: 'error',
        context: 'Scaffold',
        message: err instanceof Error ? err.message : String(err),
        sessionId,
        sessionStatus: 'failed',
        projectName: name,
      })
      setError(String(err))
      setWizard((prev) => ({ ...prev, step: 'configure' }))
    }
  }, [wizard, addTerminal, setCenterMode, setActiveProject, setActiveWorkspaceTool, setProjects, closeDrawer, focusTerminal])

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
          <h2 className="starter-title">Project Templates</h2>
          <input
            className="starter-filter"
            placeholder="Filter templates"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="starter-grid">
          {filteredTemplates.map((t) => (
            <button type="button" key={t.id} className="starter-card" onClick={() => selectTemplate(t)}>
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
      `${walletInfrastructure.swapProvider === 'jupiter' ? 'Jupiter' : walletInfrastructure.swapProvider} swaps`,
      walletInfrastructure.executionMode === 'jito' ? 'Jito execution' : 'RPC execution',
    ] : []

    return (
      <div className="starter-panel">
        <button type="button" className="starter-back" onClick={goBack}>
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
              <button type="button" className="starter-browse-btn" onClick={pickFolder}>Browse</button>
            </div>
          </div>

          {runtimeSummary.length > 0 && (
            <div className="starter-runtime-card">
              <div className="starter-runtime-title">Solana Runtime Preset</div>
              <div className="starter-runtime-copy">
                This scaffold will follow the current DAEMON Solana runtime preferences and include a `daemon.solana-runtime.json` file that the generated app should read.
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
          Writing {wizard.template?.name} starter files.
        </p>
      </div>
    </div>
  )
}

export default ProjectStarter

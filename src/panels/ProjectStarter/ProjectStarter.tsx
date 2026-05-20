import { useState, useRef, useEffect, useCallback } from 'react'
import { useUIStore } from '../../store/ui'
import { useWorkflowShellStore } from '../../store/workflowShell'
import { useNotificationsStore } from '../../store/notifications'
import { useAppActions } from '../../store/appActions'
import { useBrowserStore } from '../../store/browser'
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

const MEME_COIN_WEBSITE_TEMPLATE_ID = 'meme-coin-website'

export const TEMPLATES: Template[] = [
  {
    id: 'nft-collection',
    name: 'NFT Collection',
    description: 'Metaplex Core collection with DAS reads, metadata, and Core Candy Machine',
    tags: ['NFT', 'Metaplex'],
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    prompt: `Scaffold a Solana NFT collection project using current Metaplex docs. Include:
- Metaplex Core collection and asset flow using Umi
- Core Candy Machine configuration for collection launches
- DAS read helpers for asset, owner, and collection lookups
- Asset upload scripts or clear metadata URI hooks for images + JSON metadata
- TypeScript mint client with guard-aware allowlist/public phases
- Example Core asset and collection metadata JSON with attribute structure
- .env.example with RPC_URL, WALLET_PATH, COLLECTION_NAME, COLLECTION_SIZE, METAPLEX_ASSET_ID
- README with full setup and deployment guide
Use Metaplex Umi, MPL Core, Token Metadata, and DAS-compatible client code. Keep mainnet minting behind explicit wallet approval. Initialize git repo.`,
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
    id: MEME_COIN_WEBSITE_TEMPLATE_ID,
    name: 'Meme Coin Website',
    description: 'High-end token landing page with CA copy, social links, chart CTA, and asset slots',
    tags: ['Meme', 'Website', 'Next.js'],
    icon: 'M12 2l2.4 6.2L21 9l-5 4.1L17.5 20 12 16.4 6.5 20 8 13.1 3 9l6.6-.8L12 2z',
    prompt: `Scaffold a premium meme coin website. Include:
- Next.js 15 App Router with TypeScript
- A high-impact first viewport with token name, ticker, hero media, contract address copy, buy/chart/social calls to action
- Token metadata configured from DAEMON setup fields: name, ticker, contract address, links, and brand assets
- Responsive sections for thesis, ticker tape, meme wall, roadmap, and community CTA
- Asset folders under public/assets with safe placeholders when no uploads are supplied
- .env.example with public override variables for token metadata and links
- README with setup, asset replacement, and deploy instructions
Keep the scaffold static/read-only by default. Do not add wallet signing or transaction submission unless requested later.`,
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
type ScaffoldTargetMode = 'new' | 'current'

interface WizardState {
  step: WizardStep
  template: Template | null
  projectName: string
  savePath: string
  targetMode: ScaffoldTargetMode
  meme: MemeCoinWebsiteSettings
}

interface MemeCoinWebsiteSettings {
  tokenName: string
  ticker: string
  contractAddress: string
  tagline: string
  xUrl: string
  telegramUrl: string
  chartUrl: string
  buyUrl: string
  logoAssetPath: string
  heroAssetPath: string
}

interface MemeCoinWebsiteScaffoldSettings extends MemeCoinWebsiteSettings {
  logoFileName: string
  heroFileName: string
}

function defaultMemeSettings(): MemeCoinWebsiteSettings {
  return {
    tokenName: '',
    ticker: '',
    contractAddress: '',
    tagline: '',
    xUrl: '',
    telegramUrl: '',
    chartUrl: '',
    buyUrl: '',
    logoAssetPath: '',
    heroAssetPath: '',
  }
}

function isMemeCoinWebsiteTemplate(templateId: string | null | undefined): boolean {
  return templateId === MEME_COIN_WEBSITE_TEMPLATE_ID
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
    `- Target ${settings.cluster} by default. Mainnet-beta actions must keep explicit review and confirmation states.`,
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
      cluster: settings.cluster,
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

function cleanTicker(value: string, fallback: string): string {
  const source = value.trim() || fallback.trim() || 'MEME'
  const cleaned = source.replace(/^\$/, '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12).toUpperCase()
  return cleaned || 'MEME'
}

function publicEnvOrLiteral(envName: string, value: string): string {
  return `process.env.${envName} ?? ${JSON.stringify(value)}`
}

function sanitizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '#'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('@')) return `https://x.com/${trimmed.slice(1)}`
  return trimmed
}

function pickedAssetFileName(filePath: string, fallbackBase: string): string {
  const ext = filePath.split(/[\\/]/).pop()?.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase()
  if (!ext) return `${fallbackBase}.png`
  return `${fallbackBase}${ext}`
}

function normalizeMemeSettings(settings: MemeCoinWebsiteSettings, projectName: string): MemeCoinWebsiteScaffoldSettings {
  const tokenName = settings.tokenName.trim() || projectName.replace(/[-_]+/g, ' ') || 'Meme Coin'
  const ticker = cleanTicker(settings.ticker, tokenName)
  const contractAddress = settings.contractAddress.trim() || 'CA coming soon'
  const tagline = settings.tagline.trim() || `${ticker} is the internet's next absurdly serious community coin.`

  return {
    ...settings,
    tokenName,
    ticker,
    contractAddress,
    tagline,
    xUrl: sanitizeUrl(settings.xUrl),
    telegramUrl: sanitizeUrl(settings.telegramUrl),
    chartUrl: sanitizeUrl(settings.chartUrl),
    buyUrl: sanitizeUrl(settings.buyUrl),
    logoFileName: settings.logoAssetPath ? pickedAssetFileName(settings.logoAssetPath, 'logo') : 'brand-mark.svg',
    heroFileName: settings.heroAssetPath ? pickedAssetFileName(settings.heroAssetPath, 'hero') : 'hero-poster.svg',
  }
}

function base64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',')
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function trimPathEnd(filePath: string): string {
  return filePath.trim().replace(/[\\/]+$/, '')
}

function pathBaseName(filePath: string): string {
  const cleaned = trimPathEnd(filePath)
  return cleaned.split(/[\\/]/).filter(Boolean).pop() ?? ''
}

function pathDirName(filePath: string): string {
  const cleaned = trimPathEnd(filePath)
  const parts = cleaned.split(/[\\/]/)
  if (parts.length <= 1) return ''
  parts.pop()
  const separator = cleaned.includes('\\') ? '\\' : '/'
  return parts.join(separator)
}

function joinProjectPath(basePath: string, projectName: string): string {
  const cleaned = trimPathEnd(basePath)
  if (!cleaned) return projectName
  const separator = cleaned.includes('\\') ? '\\' : '/'
  return `${cleaned}${separator}${projectName}`
}

function normalizeProjectPath(filePath: string): string {
  return trimPathEnd(filePath).replace(/[\\/]+/g, '/').toLowerCase()
}

function sameProjectPath(a: string, b: string): boolean {
  return normalizeProjectPath(a) === normalizeProjectPath(b)
}

async function chooseMemeWebsiteDevPort(): Promise<number> {
  const preferredPorts = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010]
  try {
    const scanRes = await window.daemon.ports.scan()
    const listening = new Set(scanRes.ok && scanRes.data ? scanRes.data.map((entry) => entry.port) : [])
    return preferredPorts.find((port) => !listening.has(port)) ?? 3011
  } catch {
    return 3000
  }
}

function buildMemeWebsiteStartupCommand(port: number): string {
  const url = `http://127.0.0.1:${port}`
  const isWindows = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
  if (isWindows) {
    return [
      'Write-Host "DAEMON: installing website dependencies..."',
      'pnpm install',
      'if ($LASTEXITCODE -ne 0) { Write-Host "DAEMON: install failed"; exit $LASTEXITCODE }',
      'Write-Host "DAEMON: building the site..."',
      'pnpm run build',
      'if ($LASTEXITCODE -ne 0) { Write-Host "DAEMON: build failed"; exit $LASTEXITCODE }',
      `Write-Host "DAEMON: starting website at ${url}"`,
      `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    ].join('; ')
  }

  return [
    'printf "DAEMON: installing website dependencies...\\n"',
    'pnpm install',
    'printf "DAEMON: building the site...\\n"',
    'pnpm run build',
    `printf "DAEMON: starting website at ${url}\\n"`,
    `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
  ].join(' && ')
}

async function isPortListening(port: number): Promise<boolean> {
  try {
    const scanRes = await window.daemon.ports.scan()
    return Boolean(scanRes.ok && scanRes.data?.some((entry) => entry.port === port))
  } catch {
    return false
  }
}

async function waitForMemeWebsiteReady(terminalId: string, port: number, timeoutMs = 300_000): Promise<boolean> {
  let sawReadyOutput = false
  let terminalExited = false
  const readyPattern = new RegExp(`(127\\.0\\.0\\.1|localhost):${port}|ready in|compiled`, 'i')
  const offData = window.daemon.terminal.onData((payload) => {
    if (payload.id === terminalId && readyPattern.test(payload.data)) sawReadyOutput = true
  })
  const offExit = window.daemon.terminal.onExit((payload) => {
    if (payload.id === terminalId) terminalExited = true
  })

  try {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (sawReadyOutput || await isPortListening(port)) return true
      if (terminalExited) return false
      await sleep(1000)
    }
    return false
  } finally {
    offData()
    offExit()
  }
}

async function openMemeWebsiteWhenReady(input: {
  terminalId: string
  port: number
  projectId: string
  projectName: string
  sessionId: string
}) {
  const url = `http://127.0.0.1:${input.port}`
  const ready = await waitForMemeWebsiteReady(input.terminalId, input.port)
  const notifications = useNotificationsStore.getState()
  if (!ready) {
    notifications.addActivity({
      kind: 'warning',
      context: 'Scaffold',
      message: `Website build did not report a running server for ${input.projectName}. Check the terminal for install or build errors.`,
      sessionId: input.sessionId,
      sessionStatus: 'blocked',
      projectId: input.projectId,
      projectName: input.projectName,
    })
    notifications.pushToast({
      kind: 'warning',
      context: 'Meme Website',
      message: 'Website build needs attention. Check the terminal output.',
    })
    return
  }

  useBrowserStore.getState().setUrl(url)
  useUIStore.getState().openBrowserTab()
  notifications.addActivity({
    kind: 'success',
    context: 'Scaffold',
    message: `Website is running for ${input.projectName} at ${url}.`,
    sessionId: input.sessionId,
    sessionStatus: 'complete',
    projectId: input.projectId,
    projectName: input.projectName,
    artifacts: [{ type: 'project', label: 'Local website', value: url, href: url }],
  })
  notifications.pushSuccess(`Opened ${input.projectName} in DAEMON browser`, 'Meme Website')
}

function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function quotedJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function isNextTemplate(templateId: string): boolean {
  return ['dapp-nextjs', 'solana-foundation', 'perps-frontend', MEME_COIN_WEBSITE_TEMPLATE_ID].includes(templateId)
}

function tsconfigForTemplate(template: Template): Record<string, unknown> {
  if (isNextTemplate(template.id)) {
    return {
      compilerOptions: {
        target: 'ES2022',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    }
  }

  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: 'dist',
    },
    include: ['src', 'app', 'tests'],
  }
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
    [MEME_COIN_WEBSITE_TEMPLATE_ID]: [
      'NEXT_PUBLIC_TOKEN_NAME=',
      'NEXT_PUBLIC_TOKEN_TICKER=',
      'NEXT_PUBLIC_CONTRACT_ADDRESS=',
      'NEXT_PUBLIC_X_URL=',
      'NEXT_PUBLIC_TELEGRAM_URL=',
      'NEXT_PUBLIC_CHART_URL=',
      'NEXT_PUBLIC_BUY_URL=',
    ],
    'perps-trading-bot': ['VENUE=drift', 'MARKET_INDEX=0', 'MAX_POSITION_USD=100'],
    'perps-vault': ['VAULT_NAME=daemon-vault', 'MAX_LEVERAGE=2'],
    'perps-frontend': ['NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com', 'NEXT_PUBLIC_VENUE=jupiter', 'HELIUS_API_KEY='],
    'perps-liquidator': ['LASERSTREAM_URL=', 'JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf/api/v1/transactions', 'MIN_PROFIT_USD=5'],
  }

  return [...common, ...(byTemplate[templateId] ?? [])].join('\n') + '\n'
}

function buildPackageJson(template: Template, projectName: string) {
  const isNext = isNextTemplate(template.id)
  const isAnchor = template.id === 'anchor-program'
  const dependencies: Record<string, string> = isNext
    ? {
        next: '^15.5.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      }
    : {
        '@solana/kit': '^2.3.0',
        dotenv: '^16.4.7',
        pino: '^9.7.0',
        zod: '^3.25.0',
      }

  if (template.id === 'mcp-server') dependencies['@modelcontextprotocol/sdk'] = '^1.17.0'
  if (isNext && template.id !== MEME_COIN_WEBSITE_TEMPLATE_ID) {
    dependencies['@solana/kit'] = '^2.3.0'
    dependencies.zod = '^3.25.0'
  }
  if (template.id === 'telegram-bot') dependencies.grammy = '^1.37.0'
  if (template.id.startsWith('perps-')) dependencies['@pythnetwork/price-service-client'] = '^1.9.0'
  if (template.id === 'trading-bot') dependencies['@jup-ag/api'] = '^6.0.42'
  if (template.id === 'nft-collection') {
    dependencies['@metaplex-foundation/umi'] = '^1.2.0'
    dependencies['@metaplex-foundation/umi-bundle-defaults'] = '^1.2.0'
    dependencies['@metaplex-foundation/mpl-core'] = '^1.4.0'
    dependencies['@metaplex-foundation/mpl-token-metadata'] = '^3.4.0'
    dependencies['@metaplex-foundation/digital-asset-standard-api'] = '^1.0.0'
    dependencies['@metaplex-foundation/mpl-core-candy-machine'] = '^0.3.0'
  }

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

function readmeForTemplate(template: Template, projectName: string, memeSettings?: MemeCoinWebsiteScaffoldSettings | null): string {
  if (template.id === MEME_COIN_WEBSITE_TEMPLATE_ID && memeSettings) {
    return `# ${projectName}

Premium DAEMON scaffold for **${memeSettings.tokenName}**.

## Setup

\`\`\`bash
pnpm install
cp .env.example .env
pnpm dev
\`\`\`

## Token Settings

- Token: ${memeSettings.tokenName}
- Ticker: $${memeSettings.ticker}
- Contract address: ${memeSettings.contractAddress}
- X: ${memeSettings.xUrl}
- Telegram: ${memeSettings.telegramUrl}
- Chart: ${memeSettings.chartUrl}
- Buy: ${memeSettings.buyUrl}

The generated site reads env overrides first, then falls back to the values captured during scaffold setup.

## Assets

- Logo: \`public/assets/${memeSettings.logoFileName}\`
- Hero media: \`public/assets/${memeSettings.heroFileName}\`

Files chosen in DAEMON setup are copied into \`public/assets\`. If no file is chosen, the site tries a CA-based token image first, then falls back to generated placeholders.
Replace either file with production artwork whenever the brand is final.

## Deploy

This is a static/read-only marketing site. Deploy to Vercel, Netlify, or any Next.js host after replacing placeholder links and checking the CA.
`
  }

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

function memeCoinWebsiteFiles(template: Template, projectName: string, settings: MemeCoinWebsiteScaffoldSettings): ScaffoldFile[] {
  const logoSrc = `/assets/${settings.logoFileName}`
  const heroSrc = `/assets/${settings.heroFileName}`
  const fallbackLogoSrc = '/assets/brand-mark.svg'
  const fallbackHeroSrc = '/assets/hero-poster.svg'
  const logoSourcesExpression = settings.logoAssetPath
    ? '[localLogoSrc, tokenMetadataImageSrc, fallbackLogoSrc].filter(Boolean)'
    : '[tokenMetadataImageSrc, localLogoSrc].filter(Boolean)'
  const heroSourcesExpression = settings.heroAssetPath
    ? '[localHeroSrc, tokenMetadataImageSrc, fallbackHeroSrc].filter(Boolean)'
    : '[tokenMetadataImageSrc, localHeroSrc].filter(Boolean)'
  const placeholderFiles: ScaffoldFile[] = []

  if (!settings.logoAssetPath) {
    placeholderFiles.push({
      path: `public/assets/${settings.logoFileName}`,
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#070709"/>
  <circle cx="160" cy="156" r="92" fill="#f8e15c"/>
  <circle cx="344" cy="188" r="112" fill="#58e6c4"/>
  <path d="M110 349c64-78 150-107 258-88 18 3 28 22 19 38-30 57-82 88-155 93-44 3-85-9-122-43Z" fill="#ff5c8a"/>
  <text x="256" y="288" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="88" fill="#070709">${escapeMarkup(settings.ticker)}</text>
</svg>
`,
    })
  } else {
    placeholderFiles.push({
      path: 'public/assets/brand-mark.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#070709"/>
  <circle cx="160" cy="156" r="92" fill="#f8e15c"/>
  <circle cx="344" cy="188" r="112" fill="#58e6c4"/>
  <path d="M110 349c64-78 150-107 258-88 18 3 28 22 19 38-30 57-82 88-155 93-44 3-85-9-122-43Z" fill="#ff5c8a"/>
  <text x="256" y="288" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="88" fill="#070709">${escapeMarkup(settings.ticker)}</text>
</svg>
`,
    })
  }

  if (!settings.heroAssetPath) {
    placeholderFiles.push({
      path: `public/assets/${settings.heroFileName}`,
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900">
  <rect width="1400" height="900" fill="#070709"/>
  <path d="M0 696c160-76 320-94 480-54s319 37 476-9 305-31 444 45v222H0Z" fill="#58e6c4"/>
  <path d="M0 176c130 58 247 72 352 43s210-27 315 7 212 25 321-29 247-58 412-12v212c-170-45-310-39-420 18s-220 66-330 28-220-38-330 0S113 466 0 420Z" fill="#ff5c8a"/>
  <circle cx="1042" cy="260" r="156" fill="#f8e15c"/>
  <circle cx="458" cy="462" r="188" fill="#ffffff"/>
  <circle cx="407" cy="421" r="24" fill="#070709"/>
  <circle cx="508" cy="421" r="24" fill="#070709"/>
  <path d="M381 511c52 47 104 47 156 0" stroke="#070709" stroke-width="26" stroke-linecap="round" fill="none"/>
  <text x="700" y="802" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="132" fill="#070709">${escapeMarkup(settings.tokenName)}</text>
</svg>
`,
    })
  } else {
    placeholderFiles.push({
      path: 'public/assets/hero-poster.svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 900">
  <rect width="1400" height="900" fill="#070709"/>
  <path d="M0 696c160-76 320-94 480-54s319 37 476-9 305-31 444 45v222H0Z" fill="#58e6c4"/>
  <path d="M0 176c130 58 247 72 352 43s210-27 315 7 212 25 321-29 247-58 412-12v212c-170-45-310-39-420 18s-220 66-330 28-220-38-330 0S113 466 0 420Z" fill="#ff5c8a"/>
  <circle cx="1042" cy="260" r="156" fill="#f8e15c"/>
  <circle cx="458" cy="462" r="188" fill="#ffffff"/>
  <circle cx="407" cy="421" r="24" fill="#070709"/>
  <circle cx="508" cy="421" r="24" fill="#070709"/>
  <path d="M381 511c52 47 104 47 156 0" stroke="#070709" stroke-width="26" stroke-linecap="round" fill="none"/>
  <text x="700" y="802" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="132" fill="#070709">${escapeMarkup(settings.tokenName)}</text>
</svg>
`,
    })
  }

  return [
    {
      path: 'src/token-site.ts',
      content: `const tokenName = ${publicEnvOrLiteral('NEXT_PUBLIC_TOKEN_NAME', settings.tokenName)}
const ticker = ${publicEnvOrLiteral('NEXT_PUBLIC_TOKEN_TICKER', settings.ticker)}
const contractAddress = ${publicEnvOrLiteral('NEXT_PUBLIC_CONTRACT_ADDRESS', settings.contractAddress)}
const tagline = ${publicEnvOrLiteral('NEXT_PUBLIC_TOKEN_TAGLINE', settings.tagline)}
const xUrl = ${publicEnvOrLiteral('NEXT_PUBLIC_X_URL', settings.xUrl)}
const telegramUrl = ${publicEnvOrLiteral('NEXT_PUBLIC_TELEGRAM_URL', settings.telegramUrl)}
const chartUrl = ${publicEnvOrLiteral('NEXT_PUBLIC_CHART_URL', settings.chartUrl)}
const buyUrl = ${publicEnvOrLiteral('NEXT_PUBLIC_BUY_URL', settings.buyUrl)}
const localLogoSrc = '${logoSrc}'
const localHeroSrc = '${heroSrc}'
const fallbackLogoSrc = '${fallbackLogoSrc}'
const fallbackHeroSrc = '${fallbackHeroSrc}'

function isSolanaMintAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)
}

const tokenMetadataImageSrc = isSolanaMintAddress(contractAddress)
  ? \`https://dd.dexscreener.com/ds-data/tokens/solana/\${contractAddress}.png\`
  : ''

export const tokenSite = {
  tokenName,
  ticker,
  contractAddress,
  tagline,
  xUrl,
  telegramUrl,
  chartUrl,
  buyUrl,
  logoSrc: localLogoSrc,
  heroSrc: localHeroSrc,
  tokenMetadataImageSrc,
  logoSources: ${logoSourcesExpression},
  heroSources: ${heroSourcesExpression},
}
`,
    },
    {
      path: 'app/CopyCaButton.tsx',
      content: `'use client'

import { useState } from 'react'

export function CopyCaButton({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)

  async function copyAddress() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button type="button" className="copy-ca" onClick={copyAddress}>
      <span>{copied ? 'Copied' : 'Copy CA'}</span>
    </button>
  )
}
`,
    },
    {
      path: 'app/TokenImage.tsx',
      content: `'use client'

import { useState } from 'react'

interface TokenImageProps {
  sources: string[]
  alt?: string
  className?: string
}

export function TokenImage({ sources, alt = '', className }: TokenImageProps) {
  const usableSources = sources.filter(Boolean)
  const [sourceIndex, setSourceIndex] = useState(0)
  const src = usableSources[sourceIndex] ?? usableSources[usableSources.length - 1] ?? ''

  if (!src) return null

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        setSourceIndex((current) => Math.min(current + 1, usableSources.length - 1))
      }}
    />
  )
}
`,
    },
    {
      path: 'app/layout.tsx',
      content: `import type { ReactNode } from 'react'
import './globals.css'

export const metadata = {
  title: '${settings.tokenName}',
  description: '${template.description}',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>
}
`,
    },
    {
      path: 'app/page.tsx',
      content: `import { CopyCaButton } from './CopyCaButton'
import { TokenImage } from './TokenImage'
import { tokenSite } from '../src/token-site'

const linkItems = [
  { label: 'Buy', href: tokenSite.buyUrl },
  { label: 'Chart', href: tokenSite.chartUrl },
  { label: 'X', href: tokenSite.xUrl },
  { label: 'Telegram', href: tokenSite.telegramUrl },
].filter((item) => item.href && item.href !== '#')

function shortAddress(address: string) {
  if (address.length < 16) return address
  return \`\${address.slice(0, 6)}...\${address.slice(-6)}\`
}

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label={tokenSite.tokenName}>
          <TokenImage sources={tokenSite.logoSources} />
          <span>{tokenSite.ticker}</span>
        </a>
        <nav className="top-links" aria-label="Primary links">
          {linkItems.slice(0, 3).map((item) => (
            <a key={item.label} href={item.href}>{item.label}</a>
          ))}
        </nav>
      </header>

      <section id="top" className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Solana meme asset</p>
          <h1>{tokenSite.tokenName}</h1>
          <p className="hero-line">{tokenSite.tagline}</p>
          <div className="hero-actions">
            {linkItems.slice(0, 2).map((item) => (
              <a key={item.label} className={item.label === 'Buy' ? 'primary-link' : 'secondary-link'} href={item.href}>
                {item.label}
              </a>
            ))}
          </div>
        </div>

        <div className="hero-media" aria-label="Token artwork">
          <TokenImage sources={tokenSite.heroSources} />
          <div className="price-stamp">
            <span>\${tokenSite.ticker}</span>
            <strong>community owned chaos</strong>
          </div>
        </div>
      </section>

      <section className="contract-strip" aria-label="Contract address">
        <span>CA</span>
        <code>{shortAddress(tokenSite.contractAddress)}</code>
        <CopyCaButton address={tokenSite.contractAddress} />
      </section>

      <section className="ticker-tape" aria-label="Token ticker tape">
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index}>\${tokenSite.ticker}</span>
        ))}
      </section>

      <section className="thesis-grid">
        <article>
          <span>01</span>
          <h2>Instantly legible</h2>
          <p>Big symbol, obvious contract, and one click from discovery to chart or buy flow.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Meme first</h2>
          <p>Designed for screenshots, raids, pinned posts, and fast edits when the narrative moves.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Launch ready</h2>
          <p>Static by default, safe to host, and easy to wire into analytics, merch, or community pages.</p>
        </article>
      </section>

      <section className="meme-wall">
        <div>
          <p className="eyebrow">Media kit</p>
          <h2>Drop the meme, keep the site polished.</h2>
        </div>
        <div className="wall-grid">
          <TokenImage sources={tokenSite.logoSources} />
          <TokenImage sources={tokenSite.heroSources} />
          <div className="wall-card"><strong>raid kit</strong><span>stickers / banners / posts</span></div>
          <div className="wall-card"><strong>lore</strong><span>community-written fuel</span></div>
        </div>
      </section>

      <section className="roadmap">
        {['Site live', 'Community raids', 'Chart expansion', 'Meme machine'].map((item, index) => (
          <div key={item}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{item}</strong>
          </div>
        ))}
      </section>

      <footer className="footer-cta">
        <h2>Join \${tokenSite.ticker} before the timeline gets loud.</h2>
        <div className="footer-links">
          {linkItems.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}
        </div>
      </footer>
    </main>
  )
}
`,
    },
    {
      path: 'app/globals.css',
      content: `:root {
  color-scheme: dark;
  --ink: #070709;
  --paper: #f8f5ef;
  --line: rgba(248, 245, 239, 0.18);
  --pink: #ff5c8a;
  --mint: #58e6c4;
  --yellow: #f8e15c;
  --blue: #6ea8ff;
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--ink);
  color: var(--paper);
}
a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; }

.site-shell {
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 18% 12%, rgba(255, 92, 138, 0.28), transparent 24%),
    radial-gradient(circle at 86% 16%, rgba(88, 230, 196, 0.24), transparent 23%),
    #070709;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px clamp(18px, 4vw, 56px);
  background: rgba(7, 7, 9, 0.78);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(18px);
}

.brand-lockup, .top-links, .hero-actions, .footer-links {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-lockup img {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  object-fit: cover;
}

.brand-lockup span, .eyebrow {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.top-links a, .secondary-link, .primary-link, .footer-links a, .copy-ca {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.primary-link {
  background: var(--yellow);
  color: var(--ink);
  border-color: var(--yellow);
}

.secondary-link, .footer-links a, .copy-ca {
  background: rgba(248, 245, 239, 0.07);
  color: var(--paper);
}

.hero {
  min-height: min(760px, calc(100vh - 68px));
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 0.82fr);
  gap: clamp(24px, 5vw, 72px);
  align-items: start;
  padding: clamp(26px, 5vw, 64px) clamp(18px, 5vw, 72px) 30px;
}

.hero-copy {
  align-self: start;
  padding-top: clamp(8px, 3vw, 34px);
}

.hero-copy h1 {
  max-width: 980px;
  margin: 10px 0 18px;
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif;
  font-size: clamp(64px, 13vw, 180px);
  line-height: 0.82;
  letter-spacing: 0;
  text-transform: uppercase;
}

.hero-line {
  max-width: 650px;
  margin: 0 0 24px;
  color: rgba(248, 245, 239, 0.78);
  font-size: clamp(18px, 2vw, 28px);
  line-height: 1.25;
}

.eyebrow {
  margin: 0;
  color: var(--mint);
}

.hero-media {
  position: relative;
  align-self: stretch;
  min-height: clamp(320px, 46vw, 560px);
  display: grid;
  place-items: center;
}

.hero-media img {
  width: min(100%, 620px);
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: 0 30px 120px rgba(0, 0, 0, 0.55);
  transform: rotate(2deg);
}

.price-stamp {
  position: absolute;
  right: 4%;
  bottom: 6%;
  width: min(240px, 46vw);
  padding: 16px;
  background: var(--paper);
  color: var(--ink);
  border-radius: 10px;
  transform: rotate(-4deg);
}

.price-stamp span {
  display: block;
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif;
  font-size: 48px;
}

.price-stamp strong {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
}

.contract-strip {
  margin: 0 clamp(18px, 5vw, 72px) 36px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(248, 245, 239, 0.06);
}

.contract-strip span {
  color: var(--mint);
  font-weight: 900;
}

.contract-strip code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: "SFMono-Regular", Consolas, monospace;
  color: rgba(248, 245, 239, 0.86);
}

.copy-ca {
  cursor: pointer;
  font-family: inherit;
}

.ticker-tape {
  display: flex;
  gap: 10px;
  width: max-content;
  padding: 18px 0;
  border-block: 1px solid var(--line);
  animation: tape 22s linear infinite;
}

.ticker-tape span {
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif;
  font-size: clamp(36px, 7vw, 88px);
  color: var(--pink);
}

@keyframes tape {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

.thesis-grid, .roadmap {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 54px clamp(18px, 5vw, 72px);
}

.thesis-grid article, .roadmap div, .wall-card {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 22px;
  background: rgba(248, 245, 239, 0.055);
}

.thesis-grid span, .roadmap span {
  color: var(--yellow);
  font-weight: 900;
}

.thesis-grid h2, .meme-wall h2, .footer-cta h2 {
  margin: 10px 0;
  font-size: clamp(28px, 4vw, 58px);
  line-height: 0.95;
  letter-spacing: 0;
}

.thesis-grid p {
  color: rgba(248, 245, 239, 0.7);
  line-height: 1.55;
}

.meme-wall {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 22px;
  align-items: start;
  padding: 30px clamp(18px, 5vw, 72px) 64px;
}

.wall-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.wall-grid img, .wall-card {
  aspect-ratio: 1 / 1;
  width: 100%;
  object-fit: cover;
  border-radius: 10px;
}

.wall-card {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
}

.wall-card strong {
  font-family: Impact, Haettenschweiler, "Arial Black", sans-serif;
  font-size: 42px;
  line-height: 0.9;
  text-transform: uppercase;
}

.wall-card span {
  color: rgba(248, 245, 239, 0.72);
}

.roadmap {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding-top: 0;
}

.roadmap strong {
  display: block;
  margin-top: 20px;
  font-size: 20px;
}

.footer-cta {
  min-height: 44vh;
  display: grid;
  align-content: center;
  gap: 24px;
  padding: 60px clamp(18px, 5vw, 72px);
  background: var(--paper);
  color: var(--ink);
}

.footer-cta h2 {
  max-width: 880px;
}

.footer-links a {
  border-color: rgba(7, 7, 9, 0.2);
  color: var(--ink);
  background: rgba(7, 7, 9, 0.06);
}

@media (max-width: 860px) {
  .top-links { display: none; }
  .hero, .meme-wall { grid-template-columns: 1fr; }
  .hero { min-height: auto; }
  .hero-copy { padding-top: 0; }
  .hero-media { min-height: 340px; }
  .thesis-grid, .roadmap { grid-template-columns: 1fr; }
  .contract-strip { grid-template-columns: 1fr; align-items: stretch; }
  .copy-ca { width: 100%; }
}
`,
    },
    ...placeholderFiles,
    {
      path: 'next.config.mjs',
      content: `import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig = {
  outputFileTracingRoot: __dirname,
}

export default nextConfig
`,
    },
  ]
}

function nextAppFiles(template: Template, projectName: string, memeSettings?: MemeCoinWebsiteScaffoldSettings | null): ScaffoldFile[] {
  if (template.id === MEME_COIN_WEBSITE_TEMPLATE_ID && memeSettings) {
    return memeCoinWebsiteFiles(template, projectName, memeSettings)
  }

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
    {
      path: 'next.config.mjs',
      content: `import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig = {
  outputFileTracingRoot: __dirname,
}

export default nextConfig
`,
    },
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

function commonFiles(template: Template, projectName: string, memeSettings?: MemeCoinWebsiteScaffoldSettings | null): ScaffoldFile[] {
  return [
    { path: 'package.json', content: quotedJson(buildPackageJson(template, projectName)) },
    { path: '.gitignore', content: `node_modules\ndist\n.next\n.env\n.DS_Store\ntarget\n.anchor\n` },
    { path: '.env.example', content: envForTemplate(template.id) },
    { path: 'README.md', content: readmeForTemplate(template, projectName, memeSettings) },
    { path: 'tsconfig.json', content: quotedJson(tsconfigForTemplate(template)) },
  ]
}

export function buildDeterministicScaffold(
  template: Template,
  projectName: string,
  options: { memeSettings?: MemeCoinWebsiteScaffoldSettings | null } = {},
): DeterministicScaffold {
  const isNext = isNextTemplate(template.id)
  const files = [
    ...commonFiles(template, projectName, options.memeSettings),
    ...(template.id === 'anchor-program' ? anchorFiles(projectName) : isNext ? nextAppFiles(template, projectName, options.memeSettings) : nodeAppFiles(template)),
  ]

  const dirs = new Set<string>(['src'])
  for (const file of files) {
    const parts = file.path.split('/').slice(0, -1)
    for (let i = 1; i <= parts.length; i += 1) {
      dirs.add(parts.slice(0, i).join('/'))
    }
  }
  if (template.id === MEME_COIN_WEBSITE_TEMPLATE_ID) {
    dirs.add('public')
    dirs.add('public/assets')
  }

  return {
    dirs: [...dirs].filter(Boolean),
    files,
  }
}

async function copyPickedMemeAssets(projectPath: string, settings: MemeCoinWebsiteScaffoldSettings): Promise<void> {
  const assetDirRes = await window.daemon.fs.createDir(`${projectPath}/public/assets`)
  if (!assetDirRes.ok) {
    throw new Error(assetDirRes.error ?? 'Failed to create public/assets')
  }

  const assets = [
    { sourcePath: settings.logoAssetPath, fileName: settings.logoFileName },
    { sourcePath: settings.heroAssetPath, fileName: settings.heroFileName },
  ].filter((asset) => asset.sourcePath)

  for (const asset of assets) {
    const readRes = await window.daemon.fs.readPickedImageBase64(asset.sourcePath)
    if (!readRes.ok || !readRes.data) {
      throw new Error(readRes.error ?? `Failed to read ${asset.sourcePath}`)
    }

    const writeRes = await window.daemon.fs.writeImageFromBase64(
      `${projectPath}/public/assets/${asset.fileName}`,
      base64FromDataUrl(readRes.data.dataUrl),
    )
    if (!writeRes.ok) {
      throw new Error(writeRes.error ?? `Failed to write ${asset.fileName}`)
    }
  }
}

export function ProjectStarter() {
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const activeProjectPath = useUIStore((s) => s.activeProjectPath)
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
    targetMode: 'new',
    meme: defaultMemeSettings(),
  })
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [walletInfrastructure, setWalletInfrastructure] = useState<WalletInfrastructureSettings | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null
  const currentProjectTarget = activeProjectId && activeProjectPath
    ? {
        id: activeProjectId,
        name: activeProject?.name ?? pathBaseName(activeProjectPath),
        path: activeProjectPath,
      }
    : null

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
    const suggestedSavePath = activeProjectPath ? pathDirName(activeProjectPath) : ''
    setWizard({
      step: 'configure',
      template,
      projectName: '',
      savePath: suggestedSavePath,
      targetMode: 'new',
      meme: defaultMemeSettings(),
    })
    setError(null)
  }, [activeProjectPath])

  const goBack = useCallback(() => {
    setWizard({ step: 'templates', template: null, projectName: '', savePath: '', targetMode: 'new', meme: defaultMemeSettings() })
    setError(null)
  }, [])

  const pickFolder = useCallback(async () => {
    const res = await window.daemon.projects.openDialog()
    if (res.ok && res.data) {
      setWizard((prev) => ({ ...prev, savePath: res.data as string, targetMode: 'new' }))
    }
  }, [])

  const useCurrentProjectFolder = useCallback(() => {
    if (!currentProjectTarget?.path) return
    setWizard((prev) => ({
      ...prev,
      projectName: currentProjectTarget.name || pathBaseName(currentProjectTarget.path) || prev.projectName,
      savePath: currentProjectTarget.path,
      targetMode: 'current',
    }))
  }, [currentProjectTarget?.name, currentProjectTarget?.path])

  const updateMemeField = useCallback(<K extends keyof MemeCoinWebsiteSettings,>(
    field: K,
    value: MemeCoinWebsiteSettings[K],
  ) => {
    setWizard((prev) => ({ ...prev, meme: { ...prev.meme, [field]: value } }))
  }, [])

  const pickMemeAsset = useCallback(async (field: 'logoAssetPath' | 'heroAssetPath') => {
    const res = await window.daemon.fs.pickImage()
    if (res.ok && res.data) {
      setWizard((prev) => ({ ...prev, meme: { ...prev.meme, [field]: res.data as string } }))
    }
  }, [])

  const startBuild = useCallback(async () => {
    if (!wizard.template || !wizard.savePath || (wizard.targetMode === 'new' && !wizard.projectName.trim())) {
      setError('Fill in all fields')
      return
    }

    const name = wizard.projectName.trim() || pathBaseName(wizard.savePath) || 'daemon-site'
    const projectPath = wizard.targetMode === 'current'
      ? trimPathEnd(wizard.savePath)
      : joinProjectPath(wizard.savePath, name)
    const memeSettings = isMemeCoinWebsiteTemplate(wizard.template.id)
      ? normalizeMemeSettings(wizard.meme, name)
      : null
    const memeDevPort = memeSettings ? await chooseMemeWebsiteDevPort() : null
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
      const existingProject = projects.find((project) => sameProjectPath(project.path, projectPath))
        ?? (currentProjectTarget?.path && sameProjectPath(currentProjectTarget.path, projectPath)
          ? currentProjectTarget
          : null)
      let newProject: { id: string; name: string; path: string }
      let createdProject = false

      if (existingProject?.id) {
        newProject = {
          id: existingProject.id,
          name: existingProject.name || name,
          path: existingProject.path,
        }
      } else {
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
        newProject = projRes.data as { id: string; name: string; path: string }
        createdProject = true
      }

      const cleanupProject = async () => {
        if (createdProject && newProject.id) {
          await window.daemon.projects.delete(newProject.id)
        }
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


      const scaffold = buildDeterministicScaffold(wizard.template, name, { memeSettings })
      try {
        for (const dir of scaffold.dirs) {
          const dirRes = await window.daemon.fs.createDir(`${projectPath}/${dir}`)
          if (!dirRes.ok) {
            throw new Error(dirRes.error ?? `Failed to create ${dir}`)
          }
        }

        if (memeSettings) {
          await copyPickedMemeAssets(projectPath, memeSettings)
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
        startupCommand: memeDevPort ? buildMemeWebsiteStartupCommand(memeDevPort) : undefined,
        userInitiated: true,
      })

      if (termRes.ok && termRes.data) {
        addTerminal(newProject.id, termRes.data.id, memeDevPort ? `Website: ${name}` : `Terminal: ${name}`, null)
        if (memeDevPort) {
          await window.daemon.ports.register(memeDevPort, newProject.id, `${name} website`)
        }
        useNotificationsStore.getState().addActivity({
          kind: 'success',
          context: 'Scaffold',
          message: memeDevPort
            ? `Project scaffold written for ${name}. Installing dependencies, building, then starting http://127.0.0.1:${memeDevPort}.`
            : `Project scaffold written for ${name}. Open terminal is idle; run pnpm install when ready.`,
          sessionId,
          sessionStatus: 'running',
          projectId: newProject.id,
          projectName: name,
        })
        setCenterMode('canvas')
        setActiveWorkspaceTool(null)
        focusTerminal()
        closeDrawer()
        if (memeDevPort) {
          void openMemeWebsiteWhenReady({
            terminalId: termRes.data.id,
            port: memeDevPort,
            projectId: newProject.id,
            projectName: name,
            sessionId,
          })
        }
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
  }, [wizard, projects, currentProjectTarget, addTerminal, setCenterMode, setActiveProject, setActiveWorkspaceTool, setProjects, closeDrawer, focusTerminal])

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && wizard.savePath && (wizard.targetMode === 'current' || wizard.projectName.trim())) {
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
      ? wizard.targetMode === 'current'
        ? trimPathEnd(wizard.savePath)
        : joinProjectPath(wizard.savePath, wizard.projectName.trim() || '...')
      : 'Choose a location...'
    const runtimeSummary = walletInfrastructure ? [
      walletInfrastructure.rpcProvider === 'quicknode' ? 'QuickNode RPC' : walletInfrastructure.rpcProvider === 'custom' ? 'Custom RPC' : walletInfrastructure.rpcProvider === 'public' ? 'Public RPC' : 'Helius RPC',
      walletInfrastructure.preferredWallet === 'phantom' ? 'Phantom-first wallet flow' : 'Wallet Standard flow',
      `${walletInfrastructure.swapProvider === 'jupiter' ? 'Jupiter' : walletInfrastructure.swapProvider} swaps`,
      walletInfrastructure.executionMode === 'jito' ? 'Jito execution' : 'RPC execution',
    ] : []
    const isMemeTemplate = isMemeCoinWebsiteTemplate(wizard.template.id)
    const assetLabel = (assetPath: string, fallback: string) => assetPath.split(/[\\/]/).pop() || fallback
    const canBuild = Boolean(wizard.savePath && (wizard.targetMode === 'current' || wizard.projectName.trim()))

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
              {currentProjectTarget && (
                <button
                  type="button"
                  className={`starter-browse-btn${wizard.targetMode === 'current' ? ' starter-browse-btn--active' : ''}`}
                  onClick={useCurrentProjectFolder}
                  title={currentProjectTarget.path}
                >
                  Use current folder
                </button>
              )}
            </div>
          </div>

          {isMemeTemplate && (
            <div className="starter-meme-config">
              <div className="starter-meme-grid">
                <div className="starter-field">
                  <label className="starter-label">Token Name</label>
                  <input
                    className="starter-input"
                    placeholder="Bipolar Sol"
                    value={wizard.meme.tokenName}
                    onChange={(e) => updateMemeField('tokenName', e.target.value)}
                    maxLength={48}
                  />
                </div>
                <div className="starter-field">
                  <label className="starter-label">Ticker</label>
                  <input
                    className="starter-input"
                    placeholder="BIPOLAR"
                    value={wizard.meme.ticker}
                    onChange={(e) => updateMemeField('ticker', e.target.value.replace(/[^a-zA-Z0-9$]/g, '').slice(0, 13))}
                    maxLength={13}
                  />
                </div>
              </div>

              <div className="starter-field">
                <label className="starter-label">CA</label>
                <input
                  className="starter-input"
                  placeholder="Token contract address or CA coming soon"
                  value={wizard.meme.contractAddress}
                  onChange={(e) => updateMemeField('contractAddress', e.target.value)}
                />
              </div>

              <div className="starter-field">
                <label className="starter-label">Tagline</label>
                <input
                  className="starter-input"
                  placeholder="The timeline is not ready."
                  value={wizard.meme.tagline}
                  onChange={(e) => updateMemeField('tagline', e.target.value)}
                  maxLength={120}
                />
              </div>

              <div className="starter-meme-grid">
                <div className="starter-field">
                  <label className="starter-label">X Link</label>
                  <input
                    className="starter-input"
                    placeholder="https://x.com/..."
                    value={wizard.meme.xUrl}
                    onChange={(e) => updateMemeField('xUrl', e.target.value)}
                  />
                </div>
                <div className="starter-field">
                  <label className="starter-label">Telegram</label>
                  <input
                    className="starter-input"
                    placeholder="https://t.me/..."
                    value={wizard.meme.telegramUrl}
                    onChange={(e) => updateMemeField('telegramUrl', e.target.value)}
                  />
                </div>
                <div className="starter-field">
                  <label className="starter-label">Chart Link</label>
                  <input
                    className="starter-input"
                    placeholder="DexScreener or Birdeye URL"
                    value={wizard.meme.chartUrl}
                    onChange={(e) => updateMemeField('chartUrl', e.target.value)}
                  />
                </div>
                <div className="starter-field">
                  <label className="starter-label">Buy Link</label>
                  <input
                    className="starter-input"
                    placeholder="Jupiter, Pump.fun, or launch URL"
                    value={wizard.meme.buyUrl}
                    onChange={(e) => updateMemeField('buyUrl', e.target.value)}
                  />
                </div>
              </div>

              <div className="starter-asset-grid">
                <div className="starter-asset-picker">
                  <span>Logo / PFP</span>
                  <strong>{assetLabel(wizard.meme.logoAssetPath, 'Generated placeholder')}</strong>
                  <button type="button" className="starter-browse-btn" onClick={() => void pickMemeAsset('logoAssetPath')}>Choose</button>
                </div>
                <div className="starter-asset-picker">
                  <span>Hero Art</span>
                  <strong>{assetLabel(wizard.meme.heroAssetPath, 'Generated placeholder')}</strong>
                  <button type="button" className="starter-browse-btn" onClick={() => void pickMemeAsset('heroAssetPath')}>Choose</button>
                </div>
              </div>
              <p className="starter-asset-note">
                Chosen images are copied into public/assets. If you skip images, the site tries the CA metadata image first, then a generated placeholder.
              </p>
            </div>
          )}

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
            disabled={!canBuild}
          >
            {isMemeTemplate ? 'Start Building' : 'Build Project'}
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

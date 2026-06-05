export type IntegrationCategory = 'agent' | 'wallet' | 'rpc' | 'defi' | 'nft' | 'launch' | 'infra'
export type IntegrationRisk = 'read-only' | 'requires-confirmation' | 'transaction'
export type IntegrationStatus = 'ready' | 'partial' | 'missing'

export interface IntegrationAction {
  id: string
  label: string
  description: string
  kind: 'safe-check' | 'setup' | 'planned'
  risk: IntegrationRisk
}

export interface IntegrationRequirement {
  type: 'env' | 'secure-key' | 'mcp' | 'package' | 'wallet' | 'toolchain' | 'external-url'
  key: string
  label: string
  optional?: boolean
}

export interface IntegrationDefinition {
  id: string
  name: string
  tagline: string
  description: string
  category: IntegrationCategory
  docsUrl: string
  toolId?: string
  availability?: 'live' | 'partial' | 'planned'
  primaryActionId?: string
  installCommand?: string
  recommendedFor: string[]
  requirements: IntegrationRequirement[]
  actions: IntegrationAction[]
}

export const INTEGRATION_CATEGORIES: Array<{ id: IntegrationCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'agent', label: 'AI Agents' },
  { id: 'wallet', label: 'Wallet UX' },
  { id: 'rpc', label: 'RPC + Data' },
  { id: 'defi', label: 'DeFi Protocols' },
  { id: 'nft', label: 'NFT + IDL' },
  { id: 'launch', label: 'Launch' },
  { id: 'infra', label: 'Paid APIs + Infra' },
]

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    id: 'streamlock',
    name: 'Streamlock',
    tagline: 'Operator API for locked assets',
    description: 'Build operator apps on Streamlock locked streams, entitlement ledgers, zero-sum sessions, and settlement helpers using the HTTP Operator API.',
    category: 'infra',
    docsUrl: 'https://streamlock.gitbook.io/streamlock-docs/developers/operator-guide',
    recommendedFor: ['locked assets', 'operator API', 'game sessions', 'entitlement ledgers', 'settlement helpers', 'OpenAPI clients'],
    requirements: [
      { type: 'env', key: 'STREAMLOCK_OPERATOR_KEY', label: 'Streamlock operator API key' },
      { type: 'env', key: 'STREAMLOCK_CHAIN', label: 'Streamlock chain', optional: true },
      { type: 'env', key: 'STREAMLOCK_API_BASE_URL', label: 'Streamlock API base URL', optional: true },
      { type: 'env', key: 'SOLANA_RPC_URL', label: 'Solana RPC URL for writes', optional: true },
      { type: 'env', key: 'STREAMLOCK_TOKEN_MINT', label: 'Streamlock token mint', optional: true },
    ],
    actions: [
      { id: 'check-streamlock-config', label: 'Check config', description: 'Verify the project has the Streamlock operator API placeholders it needs.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-streamlock-operator', label: 'Preview operator path', description: 'Review the locked-asset operator flow before enabling any signing or settlement action.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'zauth',
    name: 'Zauth',
    tagline: 'x402 endpoint database and Provider Hub',
    description: 'Manage x402 provider endpoints, discovery, verification, monitoring, and Provider Hub workflows from inside DAEMON.',
    category: 'infra',
    docsUrl: 'https://zauth.inc/provider-hub',
    toolId: 'zauth',
    availability: 'partial',
    primaryActionId: 'open-zauth-database',
    recommendedFor: ['x402 providers', 'paid APIs', 'endpoint discovery', 'payment telemetry', 'provider monitoring'],
    requirements: [
      { type: 'external-url', key: 'https://zauth.inc/database', label: 'Zauth x402 Database' },
      { type: 'external-url', key: 'https://zauth.inc/provider-hub', label: 'Zauth Provider Hub' },
    ],
    actions: [
      { id: 'open-zauth-database', label: 'Open database', description: 'Open the Zauth x402 endpoint database inside DAEMON.', kind: 'setup', risk: 'read-only' },
      { id: 'open-zauth-provider-hub', label: 'Open Provider Hub', description: 'Open the Zauth Provider Hub inside DAEMON.', kind: 'setup', risk: 'read-only' },
    ],
  },
  {
    id: 'idle-protocol',
    name: 'IDLE Protocol',
    tagline: 'Risk-scored paid resource network',
    description: 'Discover IDLE resources, score them for agent readiness, and wrap safe calls with Meterflow/x402 payments, receipts, budgets, and provider revenue routing.',
    category: 'infra',
    docsUrl: 'https://earnidle.com/docs',
    toolId: 'meterflow',
    availability: 'partial',
    primaryActionId: 'preview-idle-router',
    recommendedFor: ['idle resources', 'paid API endpoints', 'agent resource routing', 'x402 pay-per-call', 'resource reputation', 'provider revenue'],
    requirements: [
      { type: 'env', key: 'IDLE_REGISTRY_URL|PAYAI_DISCOVERY_URL', label: 'IDLE or PayAI discovery URL' },
      { type: 'external-url', key: 'https://earnidle.com/resources', label: 'IDLE resource network' },
      { type: 'external-url', key: 'https://earnidle.com/docs', label: 'IDLE docs' },
      { type: 'mcp', key: 'payai-mcp-server', label: 'PayAI x402 MCP enabled', optional: true },
      { type: 'mcp', key: 'x402-mcp', label: 'x402 MCP enabled', optional: true },
    ],
    actions: [
      { id: 'open-idle-resources', label: 'Open IDLE resources', description: 'Open the IDLE resource network to review available endpoints and providers.', kind: 'setup', risk: 'read-only' },
      { id: 'open-idle-docs', label: 'Open IDLE docs', description: 'Open IDLE docs for resource publishing, gateways, and payment setup.', kind: 'setup', risk: 'read-only' },
      { id: 'preview-idle-router', label: 'Build route stack', description: 'Build the DAEMON route stack for discovering, scoring, wrapping, paying, and proving IDLE resource calls.', kind: 'safe-check', risk: 'read-only' },
    ],
  },
  {
    id: 'sendai-agent-kit',
    name: 'SendAI Agent Kit',
    tagline: 'AI actions and Solana tools through MCP',
    description: 'Use SendAI action plugins alongside the Solana MCP tool boundary for token, NFT, DeFi, Blink, price, staking, bridge, account, and docs workflows.',
    category: 'agent',
    docsUrl: 'https://github.com/sendaifun/solana-agent-kit',
    toolId: 'agent-station',
    availability: 'partial',
    primaryActionId: 'open-mcp-setup',
    installCommand: 'pnpm add solana-agent-kit @solana-agent-kit/plugin-token @solana-agent-kit/plugin-defi @solana-agent-kit/plugin-nft @solana-agent-kit/plugin-misc @solana-agent-kit/plugin-blinks @solana/web3.js bs58',
    recommendedFor: ['agent workflows', 'guided Solana actions', 'protocol automation', 'MCP tools', 'agent-readable Solana actions'],
    requirements: [
      { type: 'package', key: 'solana-agent-kit', label: 'solana-agent-kit package' },
      { type: 'mcp', key: 'solana-mcp-server', label: 'Solana MCP enabled' },
      { type: 'env', key: 'RPC_URL', label: 'RPC_URL' },
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet' },
    ],
    actions: [
      { id: 'check-agent-kit-package', label: 'Check package', description: 'Verify the current project has Solana Agent Kit installed.', kind: 'safe-check', risk: 'read-only' },
      { id: 'check-solana-mcp', label: 'Check MCP', description: 'Verify the project has the Solana MCP enabled.', kind: 'safe-check', risk: 'read-only' },
      { id: 'check-skills-source', label: 'Check skills', description: 'Verify DAEMON has enough project/tool context to recommend protocol skills.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-mcp-setup', label: 'Open setup', description: 'Jump to DAEMON MCP setup tools.', kind: 'setup', risk: 'read-only' },
      { id: 'preview-agent-actions', label: 'Preview actions', description: 'Show which SendAI actions DAEMON can safely expose first.', kind: 'planned', risk: 'read-only' },
      { id: 'preview-skill-install', label: 'Preview skills', description: 'Show suggested protocol skills without modifying agent config.', kind: 'planned', risk: 'read-only' },
    ],
  },
  {
    id: 'clawpump',
    name: 'ClawPump',
    tagline: 'Hosted AI trading agents on Solana',
    description: 'Launch and manage hosted ClawPump AI trading agents from inside DAEMON. Create agents with a strategy preset, start/stop them, and chat with them. Authenticated with a ClawPump API key (cpk_...).',
    category: 'agent',
    docsUrl: 'https://clawpump.tech/developers',
    toolId: 'clawpump',
    availability: 'live',
    primaryActionId: 'open-clawpump-panel',
    recommendedFor: ['agent launches', 'autonomous trading', 'hosted trading agents', 'Solana agent experiments', 'agent chat'],
    requirements: [
      { type: 'secure-key', key: 'CLAWPUMP_API_KEY', label: 'ClawPump API key (cpk_...)' },
    ],
    actions: [
      { id: 'open-clawpump-panel', label: 'Open ClawPump', description: 'Open the DAEMON ClawPump panel to manage your hosted agents.', kind: 'setup', risk: 'read-only' },
      { id: 'open-clawpump-docs', label: 'Open developer docs', description: 'Open the ClawPump developer documentation in your browser.', kind: 'setup', risk: 'read-only' },
    ],
  },
  {
    id: 'degentools',
    name: 'DegenTools',
    tagline: 'Meme coin content and Bags.fm launch MCP',
    description: 'Generate meme images, shill copy, token market data, and Bags.fm launch requests from DAEMON through the DegenTools MCP-compatible API.',
    category: 'launch',
    docsUrl: 'https://degentools.co/docs',
    toolId: 'degentools',
    availability: 'live',
    primaryActionId: 'open-degentools-panel',
    installCommand: 'npm install -g degentools',
    recommendedFor: ['meme coin launch assets', 'shill copy', 'Bags.fm launches', 'token data lookup', 'MCP tool calls'],
    requirements: [
      { type: 'secure-key', key: 'DEGENTOOLS_API_KEY', label: 'DegenTools API key (dgt_...)' },
    ],
    actions: [
      { id: 'open-degentools-panel', label: 'Open DegenTools', description: 'Open the DAEMON DegenTools panel for content, lookup, and launch calls.', kind: 'setup', risk: 'read-only' },
      { id: 'check-degentools-tools', label: 'Check MCP tools', description: 'Verify the DegenTools MCP endpoint responds with its available tools.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-degentools-docs', label: 'Open docs', description: 'Open the DegenTools API and MCP documentation in your browser.', kind: 'setup', risk: 'read-only' },
    ],
  },
  {
    id: 'kausalayer',
    name: 'KausaLayer',
    tagline: 'Solana stealth pockets and maze routing',
    description: 'Use KausaLayer for privacy-oriented Solana workflows: stealth pockets, private SOL routing, dynamic maze routing, sweeps, swaps, wallet slots, history, and agent-accessible MCP tooling.',
    category: 'infra',
    docsUrl: 'https://docs.kausalayer.com',
    installCommand: 'npx -y @kausalayer/mcp',
    recommendedFor: ['privacy infrastructure', 'maze routing', 'stealth pockets', 'private SOL routing', 'agent-accessible MCP tools', 'wallet history', 'private swaps'],
    requirements: [
      { type: 'env', key: 'KAUSALAYER_API_KEY', label: 'KausaLayer API key' },
      { type: 'mcp', key: 'kausalayer', label: 'KausaLayer MCP enabled' },
      { type: 'env', key: 'SOLANA_RPC_URL', label: 'Solana RPC URL', optional: true },
    ],
    actions: [
      { id: 'check-kausalayer-config', label: 'Check config', description: 'Verify the project has the KausaLayer API key and MCP route ready.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-kausalayer-mcp-register', label: 'Get API key', description: 'Open the KausaLayer MCP API key page for wallet connection and agent access.', kind: 'setup', risk: 'read-only' },
      { id: 'open-kausalayer-docs', label: 'Open docs', description: 'Open the KausaLayer documentation for stealth pockets, maze routes, sweeps, swaps, and wallet slots.', kind: 'setup', risk: 'read-only' },
      { id: 'preview-kausalayer-privacy-flow', label: 'Preview privacy flow', description: 'Review the pocket and maze-routing setup path before any wallet or transaction action is enabled.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'helius',
    name: 'Helius',
    tagline: 'RPC, DAS, webhooks, priority fees',
    description: 'Use Helius for production RPC, asset metadata, wallet data, transaction parsing, priority fee estimates, and real-time Solana streams.',
    category: 'rpc',
    docsUrl: 'https://docs.helius.dev/',
    toolId: 'env',
    availability: 'live',
    primaryActionId: 'check-helius-key',
    recommendedFor: ['RPC reliability', 'DAS asset queries', 'priority fees', 'webhooks'],
    requirements: [
      { type: 'secure-key', key: 'HELIUS_API_KEY', label: 'Helius API key' },
      { type: 'mcp', key: 'helius', label: 'Helius MCP enabled', optional: true },
    ],
    actions: [
      { id: 'check-helius-key', label: 'Check key', description: 'Verify DAEMON has a Helius key stored or configured.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-env', label: 'Open env', description: 'Open DAEMON env manager to configure keys.', kind: 'setup', risk: 'read-only' },
    ],
  },
  {
    id: 'phantom',
    name: 'Phantom',
    tagline: 'Wallet connection and signing UX',
    description: 'Use Phantom as the clear front-end path for user signing, mobile wallet UX, token-gated flows, and safe transaction review.',
    category: 'wallet',
    docsUrl: 'https://docs.phantom.com/',
    toolId: 'wallet',
    availability: 'live',
    primaryActionId: 'open-wallet',
    recommendedFor: ['wallet connect', 'user signing', 'transaction UX'],
    requirements: [
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet' },
      { type: 'mcp', key: 'phantom-docs', label: 'Phantom docs MCP enabled', optional: true },
    ],
    actions: [
      { id: 'open-wallet', label: 'Create/import wallet', description: 'Open the DAEMON wallet workspace to create or import the route Phantom-first signing will use.', kind: 'setup', risk: 'read-only' },
      { id: 'check-wallet-balance', label: 'Check route balance', description: 'Read the default wallet SOL balance once a route exists.', kind: 'safe-check', risk: 'read-only' },
    ],
  },
  {
    id: 'solflare',
    name: 'Solflare',
    tagline: 'External Solana wallet approvals',
    description: 'Use Solflare for external wallet connection, message signing, transaction approval, and Solflare-first generated dApp scaffolds.',
    category: 'wallet',
    docsUrl: 'https://docs.solflare.com/solflare/technical/integrate-solflare',
    installCommand: 'pnpm add @solflare-wallet/sdk @solana/web3.js',
    recommendedFor: ['wallet connect', 'external signing', 'Solflare users', 'transaction approvals'],
    requirements: [
      { type: 'package', key: '@solflare-wallet/sdk', label: 'Solflare Wallet SDK', optional: true },
      { type: 'external-url', key: 'https://www.solflare.com/', label: 'Solflare wallet' },
    ],
    actions: [
      { id: 'check-solflare-sdk', label: 'Check SDK', description: 'Verify the active project has the Solflare SDK installed when it needs direct Solflare integration.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-solflare-docs', label: 'Open docs', description: 'Open Solflare integration docs for direct SDK and wallet adapter setup.', kind: 'setup', risk: 'read-only' },
    ],
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    tagline: 'Quotes, swaps, tokens, lend, perps',
    description: 'Use Jupiter for quote previews, swap routing, token metadata, recurring orders, lend, perps, and wallet portfolio flows.',
    category: 'defi',
    docsUrl: 'https://dev.jup.ag/',
    toolId: 'wallet',
    availability: 'partial',
    primaryActionId: 'check-jupiter-key',
    installCommand: 'pnpm add @solana/kit',
    recommendedFor: ['swap previews', 'token routing', 'DeFi app UX'],
    requirements: [
      { type: 'secure-key', key: 'JUPITER_API_KEY', label: 'Jupiter API key', optional: true },
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet' },
    ],
    actions: [
      { id: 'check-jupiter-key', label: 'Check key', description: 'Verify whether a Jupiter key is available for higher-limit API usage.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-swap-path', label: 'Preview swap path', description: 'Planned: quote-only swap preview before any signing.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'metaplex',
    name: 'Metaplex',
    tagline: 'Core, DAS, Candy Machine, Agent Registry',
    description: 'Use Metaplex for Core assets, DAS reads, token metadata, Core Candy Machine drops, Bubblegum, Genesis, and agent identity workflows.',
    category: 'nft',
    docsUrl: 'https://www.metaplex.com/docs',
    toolId: 'metaplex-demo',
    availability: 'live',
    primaryActionId: 'check-nft-packages',
    installCommand: 'pnpm add @metaplex-foundation/umi @metaplex-foundation/umi-bundle-defaults @metaplex-foundation/mpl-core @metaplex-foundation/mpl-token-metadata @metaplex-foundation/digital-asset-standard-api',
    recommendedFor: ['Core NFTs', 'DAS reads', 'metadata', 'collections', 'agent identity'],
    requirements: [
      { type: 'package', key: '@metaplex-foundation/umi', label: 'Umi package', optional: true },
      { type: 'package', key: '@metaplex-foundation/mpl-core', label: 'MPL Core package', optional: true },
      { type: 'package', key: '@metaplex-foundation/digital-asset-standard-api', label: 'DAS API package', optional: true },
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet' },
    ],
    actions: [
      { id: 'check-nft-packages', label: 'Check packages', description: 'Verify Core, Token Metadata, and DAS packages in this project.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-core-agent-flow', label: 'Preview Core/agent flow', description: 'Planned: Core asset, Agent Registry identity, delegation, fee, and wallet approval preview before signing.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'light-protocol',
    name: 'Light Protocol',
    tagline: 'ZK Compression and compressed tokens',
    description: 'Use Light Protocol when the app needs rent-efficient compressed state, compressed token accounts, compressed PDAs, or large-scale drops.',
    category: 'infra',
    docsUrl: 'https://www.zkcompression.com',
    installCommand: 'pnpm add @lightprotocol/stateless.js @lightprotocol/compressed-token',
    recommendedFor: ['compressed airdrops', 'rent reduction', 'compressed token accounts', 'high-scale state'],
    requirements: [
      { type: 'env', key: 'RPC_URL', label: 'Compression-capable RPC' },
      { type: 'package', key: '@lightprotocol/stateless.js', label: 'Light SDK package' },
      { type: 'package', key: '@lightprotocol/compressed-token', label: 'Compressed token package' },
    ],
    actions: [
      { id: 'check-light-package', label: 'Check package', description: 'Verify Light Protocol package setup.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-compressed-airdrop', label: 'Preview airdrop', description: 'Planned: recipient and fee preview before sending.', kind: 'planned', risk: 'transaction' },
    ],
  },
  {
    id: 'magicblock',
    name: 'MagicBlock',
    tagline: 'Ephemeral Rollups and Magic Router',
    description: 'Use MagicBlock when a Solana app needs low-latency execution, gasless UX, delegated account flows, or real-time game and trading loops.',
    category: 'infra',
    docsUrl: 'https://docs.magicblock.gg',
    installCommand: 'pnpm add @magicblock-labs/ephemeral-rollups-sdk',
    recommendedFor: ['real-time apps', 'ephemeral rollups', 'gasless UX', 'delegated account flows'],
    requirements: [
      { type: 'package', key: '@magicblock-labs/ephemeral-rollups-sdk', label: 'Magic Router SDK' },
      { type: 'env', key: 'RPC_URL', label: 'Base-layer RPC' },
    ],
    actions: [
      { id: 'check-magicblock-package', label: 'Check package', description: 'Verify MagicBlock SDK setup.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-er-routing', label: 'Preview ER route', description: 'Planned: routing and delegated-account preview before any ER send.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'debridge',
    name: 'deBridge',
    tagline: 'DLN cross-chain route previews',
    description: 'Use deBridge when the app needs Solana-to-EVM routes, bridge order construction, or cross-chain execution previews before signing.',
    category: 'defi',
    docsUrl: 'https://docs.debridge.com',
    installCommand: 'pnpm add @debridge-finance/dln-client',
    recommendedFor: ['cross-chain swaps', 'bridge previews', 'Solana to EVM routes', 'DLN order construction'],
    requirements: [
      { type: 'package', key: '@debridge-finance/dln-client', label: 'deBridge DLN client' },
    ],
    actions: [
      { id: 'check-debridge-package', label: 'Check package', description: 'Verify deBridge DLN client setup.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-dln-route', label: 'Preview DLN route', description: 'Planned: quote and route preview before bridge transaction signing.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'squads',
    name: 'Squads',
    tagline: 'V4 multisig and smart accounts',
    description: 'Use Squads when the app needs team treasury safety, multisig vault inspection, proposal workflows, or smart-account coordination before sensitive Solana actions.',
    category: 'wallet',
    docsUrl: 'https://docs.squads.so/main/development',
    installCommand: 'pnpm add @sqds/multisig @solana/web3.js',
    recommendedFor: ['team treasury', 'multisig vaults', 'proposal workflows', 'smart-account coordination'],
    requirements: [
      { type: 'package', key: '@sqds/multisig', label: 'Squads multisig SDK' },
      { type: 'env', key: 'RPC_URL', label: 'Solana RPC' },
    ],
    actions: [
      { id: 'check-squads-package', label: 'Check package', description: 'Verify Squads SDK setup.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-squads-vault', label: 'Preview vault', description: 'Planned: multisig and vault preview before proposal creation or execution.', kind: 'planned', risk: 'read-only' },
    ],
  },
  {
    id: 'said-protocol',
    name: 'SAID Protocol',
    tagline: 'On-chain identity + trust for AI agents',
    description: 'Give agents a verifiable Solana identity with a verification badge, a 0–100 trust score, and on-chain reputation. Resolve agents by wallet/name/DID across 10 chains and discover them in a public directory. Complements the DAEMON work registry: SAID proves who an agent is, the registry proves what it did.',
    category: 'agent',
    docsUrl: 'https://www.saidprotocol.com/docs',
    toolId: 'agentops',
    availability: 'partial',
    primaryActionId: 'check-said-identity',
    installCommand: 'pnpm add @said-protocol/agent said-sdk',
    recommendedFor: ['agent identity', 'agent verification', 'trust scores', 'agent reputation', 'agent discovery', 'A2A messaging'],
    requirements: [
      { type: 'package', key: '@said-protocol/agent', label: '@said-protocol/agent package', optional: true },
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet (for register/verify signing)' },
      { type: 'external-url', key: 'https://www.saidprotocol.com/agents', label: 'SAID agent directory' },
    ],
    actions: [
      { id: 'check-said-identity', label: 'Check identity', description: 'Look up the default wallet on SAID and show its agent identity, verification badge, and trust score.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-said-directory', label: 'Browse directory', description: 'Open the SAID public agent directory in your browser.', kind: 'setup', risk: 'read-only' },
      { id: 'open-said-docs', label: 'Open docs', description: 'Open the SAID docs in your browser.', kind: 'setup', risk: 'read-only' },
      { id: 'preview-said-register', label: 'Preview registration', description: 'Review the register → verify flow and on-chain costs before any signing is enabled.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'allowances',
    name: 'Subscriptions & Allowances',
    tagline: 'Capped, revocable on-chain spend permissions',
    description: 'Use Solana’s native Subscriptions & Allowances primitive to fund agents and recurring billing without handing over a hot key. Inspect a wallet’s current delegate and spending cap, check whether it is enrolled in the native Subscriptions Delegation Program, and preview the grant/revoke flow. Read-only today — signing stays gated behind a transaction preview.',
    category: 'wallet',
    docsUrl: 'https://solana.com/docs/payments/subscriptions/overview',
    toolId: 'subscriptions',
    availability: 'partial',
    primaryActionId: 'check-allowance-state',
    recommendedFor: ['agent funding', 'recurring billing', 'spend permissions', 'delegated spending', 'subscription payments', 'capped allowances'],
    requirements: [
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet (to inspect allowances)' },
      { type: 'secure-key', key: 'HELIUS_API_KEY', label: 'Helius API key (RPC)', optional: true },
    ],
    actions: [
      { id: 'check-allowance-state', label: 'Check allowance', description: 'Inspect the current delegate and spending cap on the default wallet’s token account.', kind: 'safe-check', risk: 'read-only' },
      { id: 'check-subscription-enrollment', label: 'Check subscription', description: 'Check whether the default wallet is enrolled in the native Subscriptions Delegation Program.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-subscriptions-docs', label: 'Open docs', description: 'Open the Solana Subscriptions & Allowances docs in your browser.', kind: 'setup', risk: 'read-only' },
      { id: 'preview-grant-allowance', label: 'Preview grant', description: 'Review the approve-checked cap/expiry that would be signed before any grant is enabled.', kind: 'planned', risk: 'requires-confirmation' },
      { id: 'preview-revoke-allowance', label: 'Preview revoke', description: 'Review the revoke flow that clears an existing delegate before any signing is enabled.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'signalhouse',
    name: 'Signalhouse',
    tagline: 'Copy-trading intelligence for Solana perps',
    description: 'Non-custodial copy-trading and a fail-closed risk/trust layer for Drift perps. Browse the strategy leaderboard, ProofOfEdge rankings, equity history, and live copy-risk verdicts. Read-only today — follow/copy and Drift delegation are money-affecting and stay gated behind a transaction preview.',
    category: 'defi',
    docsUrl: 'https://github.com/nullxnothing/Signalhouse',
    toolId: 'signalhouse',
    availability: 'partial',
    primaryActionId: 'open-signalhouse-panel',
    recommendedFor: ['copy trading', 'strategy discovery', 'perps', 'Drift', 'risk monitoring'],
    requirements: [
      { type: 'external-url', key: 'https://signalhouse-api.onrender.com', label: 'Signalhouse API' },
    ],
    actions: [
      { id: 'open-signalhouse-panel', label: 'Open Signalhouse', description: 'Open the DAEMON Signalhouse panel to browse strategies and live activity.', kind: 'setup', risk: 'read-only' },
      { id: 'check-signalhouse-health', label: 'Check API', description: 'Ping the Signalhouse API and report whether it is online and indexer freshness.', kind: 'safe-check', risk: 'read-only' },
      { id: 'top-strategies', label: 'Top strategies', description: 'Pull the top ProofOfEdge strategies (7d) from the leaderboard.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-signalhouse-docs', label: 'Open docs', description: 'Open the Signalhouse documentation in your browser.', kind: 'setup', risk: 'read-only' },
      { id: 'preview-copy-trading', label: 'Preview copy-trading', description: 'Review the wallet-auth → Drift delegate → follow flow and on-chain costs before any signing is enabled.', kind: 'planned', risk: 'requires-confirmation' },
    ],
  },
  {
    id: 'ricomaps',
    name: 'RicoMaps',
    tagline: 'Token and wallet forensic graphing',
    description: 'Run the local RicoMaps graph explorer from inside DAEMON to inspect token, wallet, holder, and relationship graphs before deeper forensics work.',
    category: 'infra',
    docsUrl: 'https://github.com/nullxnothing/ricomaps',
    toolId: 'ricomaps',
    availability: 'partial',
    primaryActionId: 'open-ricomaps-panel',
    recommendedFor: ['wallet forensics', 'token graphing', 'holder relationships', 'local graph explorer', 'risk review'],
    requirements: [
      { type: 'external-url', key: 'http://localhost:3600', label: 'Local RicoMaps service' },
    ],
    actions: [
      { id: 'open-ricomaps-panel', label: 'Open RicoMaps', description: 'Open the embedded RicoMaps graph explorer in DAEMON.', kind: 'setup', risk: 'read-only' },
      { id: 'start-ricomaps-service', label: 'Start service', description: 'Start or check the local RicoMaps service before using the graph webview.', kind: 'safe-check', risk: 'read-only' },
    ],
  },
  {
    id: 'flywheel',
    name: 'Fee Flywheel',
    tagline: 'On-chain creator-fee splits that buy back and burn $DAEMON',
    description: 'The DAEMON Flywheel Protocol configures a pump.fun token\'s creator-fee sharing on-chain (default 80% creator / 20% buyback) and routes the buyback leg into $DAEMON: it claims accrued fees, swaps the buyback share to $DAEMON via Jupiter, and burns it. The split is enforced by pump.fun and publicly verifiable; the on-chain config is permanent once written, so configuration is gated behind a preview-and-confirm step.',
    category: 'defi',
    docsUrl: 'https://pump.fun/docs/fees',
    toolId: 'flywheel',
    availability: 'partial',
    primaryActionId: 'open-flywheel-panel',
    recommendedFor: ['token launches', 'fee sharing', 'buyback and burn', '$DAEMON', 'creator fees'],
    requirements: [
      { type: 'env', key: 'HELIUS_API_KEY', label: 'Helius RPC (claims + on-chain reads)' },
      { type: 'env', key: 'JUPITER_API_KEY', label: 'Jupiter API (buyback swaps)' },
    ],
    actions: [
      { id: 'open-flywheel-panel', label: 'Open Flywheel', description: 'Open the DAEMON Fee Flywheel panel to configure splits and run buyback & burn.', kind: 'setup', risk: 'read-only' },
      { id: 'open-flywheel-docs', label: 'Open docs', description: 'Open the pump.fun creator-fee documentation in your browser.', kind: 'setup', risk: 'read-only' },
      { id: 'configure-flywheel-split', label: 'Configure split', description: 'Write a token\'s on-chain fee-share config (80/20). Permanent and gated behind a confirmation step.', kind: 'planned', risk: 'requires-confirmation' },
      { id: 'run-flywheel', label: 'Run flywheel', description: 'Claim accrued creator fees, swap the buyback share to $DAEMON, and burn it.', kind: 'planned', risk: 'transaction' },
    ],
  },
]

export function getIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_REGISTRY.find((integration) => integration.id === id)
}

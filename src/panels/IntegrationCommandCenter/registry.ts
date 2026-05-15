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
  installCommand?: string
  recommendedFor: string[]
  requirements: IntegrationRequirement[]
  actions: IntegrationAction[]
}

export const INTEGRATION_CATEGORIES: Array<{ id: IntegrationCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'agent', label: 'Agent' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'rpc', label: 'RPC/Data' },
  { id: 'defi', label: 'DeFi' },
  { id: 'nft', label: 'NFT' },
  { id: 'launch', label: 'Launch' },
  { id: 'infra', label: 'Infra' },
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
    id: 'sendai-agent-kit',
    name: 'SendAI Agent Kit',
    tagline: 'AI actions and Solana tools through MCP',
    description: 'Use SendAI action plugins alongside the Solana MCP tool boundary for token, NFT, DeFi, Blink, price, staking, bridge, account, and docs workflows.',
    category: 'agent',
    docsUrl: 'https://github.com/sendaifun/solana-agent-kit',
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
    id: 'spawnagents',
    name: 'SpawnAgents',
    tagline: 'Autonomous Solana trading agents with live DNA',
    description: 'Spawn agents with custom DNA to trade memecoins and prediction markets autonomously. Each agent gets its own wallet. Monitor PnL, positions, and lineage — kill, withdraw, or breed children — all from inside DAEMON.',
    category: 'agent',
    docsUrl: 'https://spawnagents.fun/how',
    recommendedFor: ['agent launches', 'autonomous trading', 'agent DNA', 'live agent monitoring', 'Solana agent experiments', 'memecoin trading bots', 'prediction markets'],
    requirements: [
      { type: 'wallet', key: 'default-wallet', label: 'DAEMON wallet with keypair (for signing agent actions)' },
    ],
    actions: [
      { id: 'open-spawnagents-panel', label: 'Open SpawnAgents', description: 'Open the DAEMON SpawnAgents panel to manage and spawn agents.', kind: 'setup', risk: 'read-only' },
      { id: 'open-spawnagents-live', label: 'Browse live agents', description: 'Open the live agent directory and leaderboard on spawnagents.fun.', kind: 'setup', risk: 'read-only' },
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
    id: 'jupiter',
    name: 'Jupiter',
    tagline: 'Quotes, swaps, tokens, lend, perps',
    description: 'Use Jupiter for quote previews, swap routing, token metadata, recurring orders, lend, perps, and wallet portfolio flows.',
    category: 'defi',
    docsUrl: 'https://dev.jup.ag/',
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
    tagline: 'NFTs, metadata, Core, Bubblegum',
    description: 'Use Metaplex for NFT collections, metadata, compressed NFTs, Candy Machine, and digital asset workflows.',
    category: 'nft',
    docsUrl: 'https://developers.metaplex.com/',
    installCommand: 'pnpm add @metaplex-foundation/umi @metaplex-foundation/mpl-token-metadata',
    recommendedFor: ['NFT minting', 'metadata', 'collections'],
    requirements: [
      { type: 'package', key: '@metaplex-foundation/umi', label: 'Umi package', optional: true },
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet' },
    ],
    actions: [
      { id: 'check-nft-packages', label: 'Check packages', description: 'Verify common Metaplex packages in this project.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-nft-mint', label: 'Preview mint', description: 'Planned: metadata and fee preview before minting.', kind: 'planned', risk: 'transaction' },
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
]

export function getIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_REGISTRY.find((integration) => integration.id === id)
}

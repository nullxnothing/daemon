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
  type: 'env' | 'secure-key' | 'mcp' | 'package' | 'wallet' | 'toolchain'
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
    id: 'sendai-agent-kit',
    name: 'SendAI Agent Kit',
    tagline: 'AI actions for Solana protocols',
    description: 'Use SendAI action plugins for token, NFT, DeFi, Blink, price, staking, and bridge workflows once DAEMON has previewed the risk.',
    category: 'agent',
    docsUrl: 'https://github.com/sendaifun/solana-agent-kit',
    installCommand: 'pnpm add solana-agent-kit @solana-agent-kit/plugin-token @solana-agent-kit/plugin-defi @solana-agent-kit/plugin-nft @solana-agent-kit/plugin-misc @solana-agent-kit/plugin-blinks @solana/web3.js bs58',
    recommendedFor: ['agent workflows', 'guided Solana actions', 'protocol automation'],
    requirements: [
      { type: 'package', key: 'solana-agent-kit', label: 'solana-agent-kit package' },
      { type: 'env', key: 'RPC_URL', label: 'RPC_URL' },
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet' },
    ],
    actions: [
      { id: 'check-agent-kit-package', label: 'Check package', description: 'Verify the current project has Solana Agent Kit installed.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-agent-actions', label: 'Preview actions', description: 'Show which SendAI actions DAEMON can safely expose first.', kind: 'planned', risk: 'read-only' },
    ],
  },
  {
    id: 'sendai-solana-mcp',
    name: 'SendAI Solana MCP',
    tagline: 'Solana tools through MCP',
    description: 'Expose wallet, balance, asset, token, trade, NFT, and devnet funding tools to Claude/Codex through a standard MCP boundary.',
    category: 'agent',
    docsUrl: 'https://github.com/sendaifun/solana-mcp',
    installCommand: 'npx solana-mcp',
    recommendedFor: ['Claude/Codex tools', 'MCP workflows', 'agent-readable Solana actions'],
    requirements: [
      { type: 'mcp', key: 'solana-mcp-server', label: 'Solana MCP enabled' },
      { type: 'env', key: 'RPC_URL', label: 'RPC_URL' },
    ],
    actions: [
      { id: 'check-solana-mcp', label: 'Check MCP', description: 'Verify the project has the Solana MCP enabled.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-mcp-setup', label: 'Open setup', description: 'Jump to DAEMON MCP setup tools.', kind: 'setup', risk: 'read-only' },
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
    description: 'Use Phantom as the front-end wallet path for user signing, mobile wallet UX, token-gated flows, and safe transaction review.',
    category: 'wallet',
    docsUrl: 'https://docs.phantom.com/',
    recommendedFor: ['wallet connect', 'user signing', 'transaction UX'],
    requirements: [
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet' },
      { type: 'mcp', key: 'phantom-docs', label: 'Phantom docs MCP enabled', optional: true },
    ],
    actions: [
      { id: 'check-wallet-balance', label: 'Check balance', description: 'Read the default wallet SOL balance.', kind: 'safe-check', risk: 'read-only' },
      { id: 'open-wallet', label: 'Open wallet', description: 'Open DAEMON wallet management.', kind: 'setup', risk: 'read-only' },
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
    id: 'token-launch-stack',
    name: 'Token Launch Stack',
    tagline: 'Pump.fun, Raydium, Meteora launch paths',
    description: 'Use DAEMON launch adapters to keep token launch setup, preflight, wallet selection, and transaction results in one workflow.',
    category: 'launch',
    docsUrl: 'https://github.com/nullxnothing/daemon',
    recommendedFor: ['token launch', 'launchpad setup', 'preflight review'],
    requirements: [
      { type: 'wallet', key: 'default-wallet', label: 'Default DAEMON wallet' },
      { type: 'secure-key', key: 'HELIUS_API_KEY', label: 'Helius API key', optional: true },
    ],
    actions: [
      { id: 'open-token-launch', label: 'Open launch', description: 'Open DAEMON Token Launch workflow.', kind: 'setup', risk: 'read-only' },
      { id: 'preview-token-launch', label: 'Preview launch', description: 'Planned: launch config and transaction preflight.', kind: 'planned', risk: 'transaction' },
    ],
  },
  {
    id: 'light-protocol',
    name: 'Light Protocol',
    tagline: 'ZK Compression and compressed tokens',
    description: 'Use Light Protocol when the app needs rent-efficient compressed state, compressed tokens, or large-scale drops.',
    category: 'infra',
    docsUrl: 'https://www.lightprotocol.com/docs',
    installCommand: 'pnpm add @lightprotocol/stateless.js',
    recommendedFor: ['compressed airdrops', 'rent reduction', 'high-scale state'],
    requirements: [
      { type: 'env', key: 'RPC_URL', label: 'Compression-capable RPC' },
      { type: 'package', key: '@lightprotocol/stateless.js', label: 'Light SDK package', optional: true },
    ],
    actions: [
      { id: 'check-light-package', label: 'Check package', description: 'Verify Light Protocol package setup.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-compressed-airdrop', label: 'Preview airdrop', description: 'Planned: recipient and fee preview before sending.', kind: 'planned', risk: 'transaction' },
    ],
  },
  {
    id: 'protocol-skills',
    name: 'SendAI Skills',
    tagline: 'Protocol-specific agent knowledge',
    description: 'Use the SendAI skills marketplace as the curated knowledge layer for Drift, Meteora, Raydium, Orca, Kamino, Jupiter, Helius, and more.',
    category: 'agent',
    docsUrl: 'https://github.com/sendaifun/skills',
    installCommand: 'npx skills add sendaifun/skills',
    recommendedFor: ['protocol docs', 'agent context', 'integration recipes'],
    requirements: [
      { type: 'toolchain', key: 'node', label: 'Node/pnpm available' },
    ],
    actions: [
      { id: 'check-skills-source', label: 'Check readiness', description: 'Verify DAEMON has enough project/tool context to recommend skills.', kind: 'safe-check', risk: 'read-only' },
      { id: 'preview-skill-install', label: 'Preview skills', description: 'Planned: show install commands without modifying agent config.', kind: 'planned', risk: 'read-only' },
    ],
  },
]

export function getIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_REGISTRY.find((integration) => integration.id === id)
}

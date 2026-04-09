export type SolanaMcpCategory = 'rpc' | 'payments' | 'defi' | 'wallets' | 'testing'
export type SolanaIntegrationArea =
  | 'Foundation'
  | 'Wallets'
  | 'Providers'
  | 'Execution'
  | 'Testing'
  | 'Protocols'
  | 'Payments'

export type SolanaIntegrationKind = 'MCP' | 'SDK' | 'Runtime' | 'Template' | 'Skill'
export type SolanaIntegrationStatus = 'native' | 'guided' | 'external'

export interface SolanaCatalogMcpEntry {
  label: string
  description: string
  category: SolanaMcpCategory
  docsUrl?: string
}

export interface SolanaIntegrationEntry {
  id: string
  label: string
  area: SolanaIntegrationArea
  kind: SolanaIntegrationKind
  status: SolanaIntegrationStatus
  description: string
  docsUrl?: string
  mcpName?: string
  skill?: string
}

export interface SolanaProtocolPack {
  id: string
  label: string
  status: 'native' | 'guided'
  skill: string
  docsUrl: string
  kickoff: string
  installHint: string
}

export const SOLANA_MCP_CATALOG: Record<string, SolanaCatalogMcpEntry> = {
  helius: {
    label: 'Helius',
    description: 'RPC, DAS API, webhooks, priority fees, and indexed Solana data.',
    category: 'rpc',
    docsUrl: 'https://www.helius.dev/docs',
  },
  'solana-mcp-server': {
    label: 'Solana MCP',
    description: 'Program deployment, account inspection, and Solana docs tooling.',
    category: 'rpc',
  },
  'payai-mcp-server': {
    label: 'PayAI',
    description: 'x402 payment protocol via the PayAI facilitator.',
    category: 'payments',
    docsUrl: 'https://docs.payai.network',
  },
  'x402-mcp': {
    label: 'x402',
    description: 'HTTP 402 payment tooling for paid APIs and agents.',
    category: 'payments',
    docsUrl: 'https://github.com/coinbase/x402',
  },
}

export const SOLANA_AGENT_SKILL_GROUPS: Array<{ label: string; skills: string[] }> = [
  { label: 'Core', skills: ['/solana-architect', '/solana-wallet-tx-pipeline', '/solana-kit'] },
  { label: 'Infra', skills: ['/helius', '/quicknode', '/pyth', '/switchboard', '/light-protocol'] },
  { label: 'Trading', skills: ['/integrating-jupiter', '/raydium', '/meteora', '/drift', '/orca'] },
  { label: 'Protocols', skills: ['/kamino', '/sanctum', '/metaplex', '/pumpfun', '/squads'] },
  { label: 'Security', skills: ['/helios-solana-forensics', '/vulnhunter'] },
]

export const SOLANA_INTEGRATION_CATALOG: SolanaIntegrationEntry[] = [
  {
    id: 'solana-kit',
    label: '@solana/kit',
    area: 'Foundation',
    kind: 'SDK',
    status: 'guided',
    description: 'Modern Solana JavaScript foundation for RPC, transactions, and signers.',
    docsUrl: 'https://solana.com/docs/frontend',
    skill: '/solana-kit',
  },
  {
    id: 'create-solana-dapp',
    label: 'create-solana-dapp',
    area: 'Foundation',
    kind: 'Template',
    status: 'guided',
    description: 'Official starter generator for current Solana app scaffolds.',
    docsUrl: 'https://github.com/solana-developers/create-solana-dapp',
  },
  {
    id: 'solana-mcp',
    label: 'Solana MCP',
    area: 'Foundation',
    kind: 'MCP',
    status: 'native',
    description: 'Built-in Solana tool surface for deployment, inspection, and docs.',
    mcpName: 'solana-mcp-server',
  },
  {
    id: 'phantom-connect',
    label: 'Phantom Connect',
    area: 'Wallets',
    kind: 'SDK',
    status: 'guided',
    description: 'First-class wallet connectivity for Solana desktop and web flows.',
    docsUrl: 'https://docs.phantom.com/sdks/browser-sdk',
    skill: '/phantom-connect',
  },
  {
    id: 'wallet-standard',
    label: 'Wallet Standard',
    area: 'Wallets',
    kind: 'SDK',
    status: 'guided',
    description: 'Compatibility path for Phantom, Backpack, Solflare, and other wallets.',
    docsUrl: 'https://solana.com/docs/frontend',
  },
  {
    id: 'helius-provider',
    label: 'Helius',
    area: 'Providers',
    kind: 'MCP',
    status: 'native',
    description: 'Primary indexed Solana provider already wired into DAEMON.',
    docsUrl: 'https://www.helius.dev/docs',
    mcpName: 'helius',
    skill: '/helius',
  },
  {
    id: 'quicknode-provider',
    label: 'QuickNode',
    area: 'Providers',
    kind: 'Skill',
    status: 'guided',
    description: 'Optional second provider for Streams, Metis, DAS, and Yellowstone-style flows.',
    docsUrl: 'https://www.quicknode.com/docs/solana',
    skill: '/quicknode',
  },
  {
    id: 'jito-execution',
    label: 'Jito',
    area: 'Execution',
    kind: 'Runtime',
    status: 'guided',
    description: 'Bundle send and low-latency execution path for launch and trading workflows.',
    docsUrl: 'https://docs.jito.wtf/lowlatencytxnsend/',
  },
  {
    id: 'jupiter-execution',
    label: 'Jupiter',
    area: 'Execution',
    kind: 'Skill',
    status: 'guided',
    description: 'Swap, price, trigger, recurring, and token routing APIs for builders.',
    docsUrl: 'https://dev.jup.ag/get-started',
    skill: '/integrating-jupiter',
  },
  {
    id: 'surfpool',
    label: 'Surfpool',
    area: 'Testing',
    kind: 'Runtime',
    status: 'native',
    description: 'Low-latency local validator and mainnet-fork development environment.',
    docsUrl: 'https://docs.surfpool.run/',
  },
  {
    id: 'solana-test-validator',
    label: 'solana-test-validator',
    area: 'Testing',
    kind: 'Runtime',
    status: 'native',
    description: 'Canonical local validator for client and program development.',
    docsUrl: 'https://solana.com/docs/intro/installation',
  },
  {
    id: 'avm',
    label: 'AVM',
    area: 'Testing',
    kind: 'Runtime',
    status: 'guided',
    description: 'Anchor Version Manager for reproducible program toolchains.',
    docsUrl: 'https://www.anchor-lang.com/docs/references/avm',
  },
  {
    id: 'litesvm',
    label: 'LiteSVM',
    area: 'Testing',
    kind: 'Runtime',
    status: 'guided',
    description: 'Fast local Solana VM for program tests.',
    docsUrl: 'https://www.anchor-lang.com/docs/testing/litesvm',
  },
  {
    id: 'mollusk',
    label: 'Mollusk',
    area: 'Testing',
    kind: 'Runtime',
    status: 'guided',
    description: 'Property-style testing and deeper program validation for Anchor projects.',
    docsUrl: 'https://www.anchor-lang.com/docs/testing/mollusk',
  },
  {
    id: 'metaplex',
    label: 'Metaplex',
    area: 'Protocols',
    kind: 'Skill',
    status: 'guided',
    description: 'Core NFTs, metadata, compressed assets, and mint flows.',
    docsUrl: 'https://developers.metaplex.com/',
    skill: '/metaplex',
  },
  {
    id: 'raydium',
    label: 'Raydium',
    area: 'Protocols',
    kind: 'SDK',
    status: 'native',
    description: 'LaunchLab and liquidity integrations already present in the token launch flow.',
    docsUrl: 'https://docs.raydium.io/',
    skill: '/raydium',
  },
  {
    id: 'meteora',
    label: 'Meteora',
    area: 'Protocols',
    kind: 'SDK',
    status: 'native',
    description: 'Dynamic bonding curve and launch support already present in DAEMON.',
    docsUrl: 'https://docs.meteora.ag/',
    skill: '/meteora',
  },
  {
    id: 'pumpfun',
    label: 'Pump.fun',
    area: 'Protocols',
    kind: 'SDK',
    status: 'native',
    description: 'Creation, buy/sell, and fee collection flows are already integrated.',
    docsUrl: 'https://github.com/rckprtr/pumpdotfun-sdk',
    skill: '/pumpfun',
  },
  {
    id: 'orca',
    label: 'Orca',
    area: 'Protocols',
    kind: 'Skill',
    status: 'guided',
    description: 'Whirlpool swaps and liquidity management for concentrated liquidity apps.',
    docsUrl: 'https://orca-so.github.io/whirlpools/',
    skill: '/orca',
  },
  {
    id: 'drift',
    label: 'Drift',
    area: 'Protocols',
    kind: 'Skill',
    status: 'guided',
    description: 'Perps, spot, and vault strategies for advanced trading integrations.',
    docsUrl: 'https://drift-labs.github.io/documentation-v2/',
    skill: '/drift',
  },
  {
    id: 'kamino',
    label: 'Kamino',
    area: 'Protocols',
    kind: 'Skill',
    status: 'guided',
    description: 'Lending, liquidity, and multiply integrations.',
    docsUrl: 'https://docs.kamino.finance/',
    skill: '/kamino',
  },
  {
    id: 'sanctum',
    label: 'Sanctum',
    area: 'Protocols',
    kind: 'Skill',
    status: 'guided',
    description: 'Liquid staking and LST routing integrations.',
    docsUrl: 'https://docs.sanctum.so/',
    skill: '/sanctum',
  },
  {
    id: 'pyth',
    label: 'Pyth',
    area: 'Protocols',
    kind: 'Skill',
    status: 'guided',
    description: 'Oracle price feeds and confidence intervals for DeFi clients and programs.',
    docsUrl: 'https://docs.pyth.network/',
    skill: '/pyth',
  },
  {
    id: 'switchboard',
    label: 'Switchboard',
    area: 'Protocols',
    kind: 'Skill',
    status: 'guided',
    description: 'Oracle, VRF, and automation integrations for Solana apps.',
    docsUrl: 'https://docs.switchboard.xyz/',
    skill: '/switchboard',
  },
  {
    id: 'x402',
    label: 'x402 / PayAI',
    area: 'Payments',
    kind: 'MCP',
    status: 'native',
    description: 'HTTP 402 micropayments and paid API scaffolding.',
    docsUrl: 'https://docs.payai.network',
    mcpName: 'payai-mcp-server',
    skill: '/payai-x402',
  },
  {
    id: 'mpp',
    label: 'Machine Payments Protocol',
    area: 'Payments',
    kind: 'SDK',
    status: 'native',
    description: 'Agent-to-agent payment scaffolding using @solana/mpp.',
    docsUrl: 'https://github.com/solana-foundation/machine-payments-protocol',
  },
]

export const SOLANA_PROTOCOL_PACKS: SolanaProtocolPack[] = [
  {
    id: 'jupiter',
    label: 'Jupiter',
    status: 'guided',
    skill: '/integrating-jupiter',
    docsUrl: 'https://dev.jup.ag/get-started',
    kickoff: 'Start with quotes, swap execution, and price endpoints before adding trigger or recurring flows.',
    installHint: 'pnpm add @solana/kit',
  },
  {
    id: 'metaplex',
    label: 'Metaplex',
    status: 'guided',
    skill: '/metaplex',
    docsUrl: 'https://developers.metaplex.com/',
    kickoff: 'Use Metaplex for metadata, Core assets, Bubblegum, and mint workflows.',
    installHint: 'pnpm add @metaplex-foundation/umi',
  },
  {
    id: 'raydium',
    label: 'Raydium',
    status: 'native',
    skill: '/raydium',
    docsUrl: 'https://docs.raydium.io/',
    kickoff: 'DAEMON already uses Raydium in launch flows; extend from launch config and liquidity paths.',
    installHint: 'Use existing token launch integration as the starting point.',
  },
  {
    id: 'meteora',
    label: 'Meteora',
    status: 'native',
    skill: '/meteora',
    docsUrl: 'https://docs.meteora.ag/',
    kickoff: 'Use the existing Meteora launch support before adding new vault or DLMM flows.',
    installHint: 'Use existing token launch integration as the starting point.',
  },
  {
    id: 'drift',
    label: 'Drift',
    status: 'guided',
    skill: '/drift',
    docsUrl: 'https://drift-labs.github.io/documentation-v2/',
    kickoff: 'Start with account bootstrap, market discovery, and read-only position views.',
    installHint: 'pnpm add @drift-labs/sdk',
  },
  {
    id: 'kamino',
    label: 'Kamino',
    status: 'guided',
    skill: '/kamino',
    docsUrl: 'https://docs.kamino.finance/',
    kickoff: 'Start with lending market reads and deposit flows before multiply or leverage paths.',
    installHint: 'pnpm add @kamino-finance/klend-sdk',
  },
]

export function getIntegrationStatusLabel(status: SolanaIntegrationStatus): string {
  if (status === 'native') return 'Native'
  if (status === 'guided') return 'Guided'
  return 'External'
}

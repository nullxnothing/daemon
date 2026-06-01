export interface MetaplexDemoCapability {
  id: string
  title: string
  category: 'NFTs' | 'Tokens' | 'Agents' | 'Smart Contracts' | 'Dev Tools' | 'Launch'
  status: 'ready' | 'read-only-ready' | 'preview-ready' | 'storyboard-ready' | 'reference-ready'
  docsUrl: string
  packages: string[]
  summary: string
  shows: string[]
  demoMode: string
}

export interface MetaplexFocusWorkflow {
  id: string
  title: string
  status: 'primary' | 'priority' | 'support'
  docsUrl: string
  bestFor: string
  userAction: string
  daemonAction: string
  proofRecord: string
  capabilityIds: string[]
}

export const METAPLEX_DEMO_PROJECT_PATH = 'C:/Users/offic/Projects/daemon-metaplex-demo'
export const METAPLEX_DEMO_PROJECT_NAME = 'daemon-metaplex-demo'

export const METAPLEX_DEMO_BOUNDARY = 'Devnet Core asset creation is live behind signer selection and typed confirmation. Agent Registry registration, Genesis launch creation, set-token, creator-fee claims, and mainnet execution remain gated.'

export const METAPLEX_DEMO_PREVIEWS = [
  'previews/generated/metaplex-demo-map.json',
  'previews/generated/metaplex-focus-workflows.json',
  'previews/generated/core-asset-preview.json',
  'previews/generated/das-query-preview.json',
  'previews/generated/candy-machine-preview.json',
  'previews/generated/genesis-launch-preview.json',
  'previews/generated/agent-registry-preview.json',
  'previews/generated/compressed-nft-preview.json',
] as const

export const METAPLEX_FOCUS_WORKFLOWS: MetaplexFocusWorkflow[] = [
  {
    id: 'agentops-commerce-workbench',
    title: 'Metaplex AgentOps by DAEMON',
    status: 'primary',
    docsUrl: 'https://www.metaplex.com/docs/agents/agent-commerce',
    bestFor: 'A builder wants one place to create, run, monetize, and audit Metaplex agents after registration.',
    userAction: 'Register or import an agent, confirm service endpoints, review x402 pricing, choose web or desktop execution, then store proof receipts.',
    daemonAction: 'Resolves Agent Identity, Asset Signer, execution delegation, EIP-8004 services, x402 payment boundary, cloud runner handoff, and receipt state.',
    proofRecord: 'Agent asset, Agent Identity PDA, Asset Signer PDA, service metadata, payment signature, run hash, receipt asset, DAS read, and operator approval.',
    capabilityIds: ['agentops-runtime', 'agent-registry', 'agentic-commerce', 'das-api'],
  },
  {
    id: 'agent-token-operator',
    title: 'Agent Token Operator',
    status: 'primary',
    docsUrl: 'https://www.metaplex.com/docs/agents/agentic-commerce',
    bestFor: 'A builder wants a registered AI agent with an agent wallet, token provenance, and a clear path to fundraising through Genesis.',
    userAction: 'Enter agent metadata, review the Core asset, choose executive delegation, preview the token launch, then approve only the final wallet-gated transaction.',
    daemonAction: 'Checks the Agent Identity PDA, Asset Signer PDA, executive profile, one-token-per-agent warning, creator-fee routing, and set-token boundary before any signing path appears.',
    proofRecord: 'Agent Core asset, Agent Identity PDA, executive delegate, Genesis launch link, token mint, signatures, confirmations, and post-write reads.',
    capabilityIds: ['agent-registry', 'agentic-commerce', 'genesis', 'core-assets'],
  },
  {
    id: 'genesis-launch-control',
    title: 'Genesis Launch Control',
    status: 'primary',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/genesis/bonding-curve',
    bestFor: 'A team needs to choose between launchpool, presale, auction, or bonding curve without hiding the mechanics.',
    userAction: 'Select launch type, token image, fee wallet, first buy, Raydium liquidity path, and authority revocation policy.',
    daemonAction: 'Turns Genesis into a stage timeline: create/register, active swaps or deposit window, graduation, Raydium pool, claims, and revoke authority checks.',
    proofRecord: 'Launch config, transaction preview, bucket state, launch page, Raydium pool/graduation state, creator-fee buckets, and authority status.',
    capabilityIds: ['genesis', 'core-candy-machine', 'token-metadata'],
  },
  {
    id: 'creator-fee-ledger',
    title: 'Creator Fee Ledger',
    status: 'priority',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/genesis/creator-fees',
    bestFor: 'A creator or agent wants revenue visibility after bonding-curve swaps and after Raydium graduation.',
    userAction: 'Connect a fee recipient or agent PDA, inspect accrued fees, review no-rewards states, then approve claim transactions explicitly.',
    daemonAction: 'Separates active-curve claims from post-graduation Raydium collection and claim steps so fees do not look magically transferred per swap.',
    proofRecord: 'creatorFeeAccrued, creatorFeeClaimed, bonding curve bucket, Raydium bucket, claim transactions, and recipient confirmation.',
    capabilityIds: ['genesis', 'agentic-commerce'],
  },
  {
    id: 'core-das-proof-loop',
    title: 'Core + DAS Proof Loop',
    status: 'priority',
    docsUrl: 'https://www.metaplex.com/docs/dev-tools/das-api',
    bestFor: 'A builder wants every asset write or preview verified through indexed reads before DAEMON marks it complete.',
    userAction: 'Inspect Core assets, collections, plugin policies, compressed assets, and Token Metadata records before approving writes.',
    daemonAction: 'Uses DAS reads and Core extension lanes to compare before-state, planned transaction, signature, confirmation, and after-state.',
    proofRecord: 'getAsset, getAssetsByOwner, getAssetsByGroup, searchAssets, plugin derivation, and explorer links.',
    capabilityIds: ['core-assets', 'core-plugins', 'das-api', 'bubblegum-v2', 'token-metadata'],
  },
  {
    id: 'skill-terminal-handoff',
    title: 'Skill-to-Terminal Handoff',
    status: 'support',
    docsUrl: 'https://www.metaplex.com/docs/agents/skill/programs-and-operations',
    bestFor: 'A developer wants the official Metaplex Skill and CLI paths surfaced inside DAEMON without blind automation.',
    userAction: 'Pick a task, inspect generated CLI/SDK commands, run checks, then keep terminal output and generated files in the workspace.',
    daemonAction: 'Maps Agent Registry, Genesis, Core, Token Metadata, Bubblegum, and Candy Machine into docs-backed commands and preview files.',
    proofRecord: 'Command transcript, generated preview JSON, source docs link, readiness output, and no-signed-action boundary.',
    capabilityIds: ['umi-cli', 'dev-tooling', 'agent-registry', 'genesis'],
  },
]

export const METAPLEX_DEMO_CAPABILITIES: MetaplexDemoCapability[] = [
  {
    id: 'core-assets',
    title: 'Core Assets and Collections',
    category: 'NFTs',
    status: 'preview-ready',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/core',
    packages: ['@metaplex-foundation/mpl-core', '@metaplex-foundation/umi', '@metaplex-foundation/umi-bundle-defaults'],
    summary: 'Create, fetch, update, transfer, burn, and group next-generation NFT assets in Core collections.',
    shows: ['single-account asset model', 'collection-level operations', 'Core asset metadata', 'wallet approval boundary'],
    demoMode: 'Builds a Core asset and collection transaction plan without signing.',
  },
  {
    id: 'core-plugins',
    title: 'Core Plugin System',
    category: 'Smart Contracts',
    status: 'preview-ready',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/core',
    packages: ['@metaplex-foundation/mpl-core'],
    summary: 'Model royalties, attributes, delegates, freeze controls, burn controls, verified creators, editions, and external plugin adapters.',
    shows: ['royalties plugin', 'attributes plugin', 'transfer delegate', 'freeze delegate', 'external adapter lane'],
    demoMode: 'Generates a plugin policy preview for review before any asset instruction is created.',
  },
  {
    id: 'das-api',
    title: 'DAS API Reads',
    category: 'Dev Tools',
    status: 'read-only-ready',
    docsUrl: 'https://www.metaplex.com/docs/dev-tools/das-api',
    packages: ['@metaplex-foundation/digital-asset-standard-api'],
    summary: 'Read Core, Token Metadata, and compressed Bubblegum assets through indexed RPC methods.',
    shows: ['getAsset', 'getAssetsByOwner', 'getAssetsByGroup', 'searchAssets', 'compressed asset read path'],
    demoMode: 'Runs optional JSON-RPC reads when METAPLEX_ASSET_ID, METAPLEX_OWNER, or METAPLEX_COLLECTION is configured.',
  },
  {
    id: 'token-metadata',
    title: 'Token Metadata',
    category: 'Tokens',
    status: 'preview-ready',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/token-metadata',
    packages: ['@metaplex-foundation/mpl-token-metadata', '@solana/spl-token'],
    summary: 'Attach standardized metadata to fungible tokens, semi-fungible assets, NFTs, pNFTs, editions, creators, and collections.',
    shows: ['metadata PDA', 'JSON URI standard', 'fungible token metadata', 'verified creators', 'programmable NFT policy'],
    demoMode: 'Generates fungible token and metadata account previews, including authority and mutability checks.',
  },
  {
    id: 'bubblegum-v2',
    title: 'Bubblegum v2 Compressed NFTs',
    category: 'NFTs',
    status: 'preview-ready',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/bubblegum-v2',
    packages: ['@metaplex-foundation/mpl-bubblegum', '@solana/spl-account-compression'],
    summary: 'Plan high-scale compressed NFT drops with Merkle tree state, proofs, and DAS-backed indexing.',
    shows: ['tree configuration', 'compressed mint path', 'proof lookup', 'DAS compressed read'],
    demoMode: 'Builds a compressed-drop checklist and proof-read preview without creating a tree.',
  },
  {
    id: 'core-candy-machine',
    title: 'Core Candy Machine',
    category: 'Launch',
    status: 'preview-ready',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/core-candy-machine',
    packages: ['@metaplex-foundation/mpl-core-candy-machine'],
    summary: 'Configure guarded Core asset drops for allowlists, public phases, pricing, and collection distribution.',
    shows: ['drop phases', 'guard config', 'collection link', 'mint authority boundary'],
    demoMode: 'Creates a Candy Machine configuration preview and guard matrix.',
  },
  {
    id: 'genesis',
    title: 'Genesis Token Launches',
    category: 'Tokens',
    status: 'preview-ready',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/genesis',
    packages: ['@metaplex-foundation/genesis', '@metaplex-foundation/mpl-toolbox'],
    summary: 'Plan launch pools, presales, auctions, bonding curves, creator fees, Raydium graduation, claims, and authority revocation.',
    shows: ['launch type selection', 'creator fee route', 'Raydium graduation', 'claim flow', 'authority revocation'],
    demoMode: 'Generates a Genesis launch timeline and receipt checklist. No launch transaction is sent.',
  },
  {
    id: 'agentops-runtime',
    title: 'AgentOps Runtime',
    category: 'Agents',
    status: 'preview-ready',
    docsUrl: 'https://www.metaplex.com/docs/agents/agent-commerce',
    packages: ['@metaplex-foundation/mpl-agent-registry', '@metaplex-foundation/mpl-core', '@x402/svm'],
    summary: 'Manage Metaplex agents as operating services with EIP-8004 metadata, x402 payment endpoints, cloud runs, desktop handoff, and receipt proofs.',
    shows: ['service discovery', 'x402 payment route', 'cloud runner handoff', 'work receipt ledger', 'web management boundary'],
    demoMode: 'Builds the AgentOps runbook and browser-management plan without signing delegation or payment transactions.',
  },
  {
    id: 'agent-registry',
    title: 'Agent Registry',
    category: 'Agents',
    status: 'preview-ready',
    docsUrl: 'https://www.metaplex.com/docs/agents',
    packages: ['@metaplex-foundation/mpl-agent-registry', '@metaplex-foundation/mpl-core'],
    summary: 'Represent an AI agent as a Core asset with an onchain identity PDA and execution delegation records.',
    shows: ['agent identity PDA', 'AgentIdentity plugin', 'executive profile', 'execution delegation'],
    demoMode: "Builds an agent identity and delegation preview for DAEMON's operator story.",
  },
  {
    id: 'agentic-commerce',
    title: 'Agentic Commerce',
    category: 'Agents',
    status: 'storyboard-ready',
    docsUrl: 'https://www.metaplex.com/docs/agents/agentic-commerce',
    packages: ['@metaplex-foundation/mpl-agent-registry', '@metaplex-foundation/genesis'],
    summary: 'Connect agent identity, agent-operated wallets, delegation, and optional token launches.',
    shows: ['agent wallet activation', 'agent token launch', 'execution attribution', 'funding flow'],
    demoMode: 'Shows the meeting narrative and required live wiring before execution claims.',
  },
  {
    id: 'mpl-hybrid',
    title: 'MPL-Hybrid',
    category: 'Smart Contracts',
    status: 'storyboard-ready',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/mpl-hybrid',
    packages: ['@metaplex-foundation/mpl-hybrid'],
    summary: 'Model swaps between fungible and non-fungible representations of traits or inventory.',
    shows: ['fungible trait pool', 'NFT swap path', 'inventory conversion boundary'],
    demoMode: 'Explains the inventory and trait-swap use case with config placeholders.',
  },
  {
    id: 'inscriptions',
    title: 'Inscriptions',
    category: 'Smart Contracts',
    status: 'storyboard-ready',
    docsUrl: 'https://www.metaplex.com/docs/smart-contracts/inscription',
    packages: ['@metaplex-foundation/mpl-inscription'],
    summary: 'Plan permanent Solana state inscriptions for durable data attached to assets.',
    shows: ['data chunking', 'authority policy', 'asset-linked inscription', 'storage cost boundary'],
    demoMode: 'Produces an inscription sizing and authority checklist.',
  },
  {
    id: 'umi-cli',
    title: 'Umi and Metaplex CLI',
    category: 'Dev Tools',
    status: 'ready',
    docsUrl: 'https://www.metaplex.com/docs/dev-tools/cli',
    packages: ['@metaplex-foundation/umi', '@metaplex-foundation/umi-bundle-defaults'],
    summary: 'Use Umi for Solana RPC, plugins, signers, builders, and CLI-backed asset workflows.',
    shows: ['RPC setup', 'plugin composition', 'wallet signer boundary', 'CLI command equivalents'],
    demoMode: 'Shows equivalent CLI commands and SDK package readiness.',
  },
  {
    id: 'dev-tooling',
    title: 'Shank, Amman, and Legacy Paths',
    category: 'Dev Tools',
    status: 'reference-ready',
    docsUrl: 'https://www.metaplex.com/docs',
    packages: ['shank', 'amman'],
    summary: 'Keep IDL generation, local validator testing, and legacy migrations visible without making them the main story.',
    shows: ['Shank IDL lane', 'Amman local testing', 'legacy docs boundary', 'Bubblegum v1 as legacy'],
    demoMode: 'Lists support lanes and migration questions for the meeting.',
  },
]

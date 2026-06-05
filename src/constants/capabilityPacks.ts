import type { IntegrationCategory } from '../panels/IntegrationCommandCenter/registry'
import { PACK_IPC_DOMAINS, CORE_PACK_IDS, defaultEnabledPacks } from '../../electron/shared/packManifest'
import type { PackId, IpcDomainId } from '../../electron/shared/packManifest'

export type { PackId, IpcDomainId } from '../../electron/shared/packManifest'
export { PACK_IPC_DOMAINS, CORE_PACK_IDS, defaultEnabledPacks } from '../../electron/shared/packManifest'

export type PackStatus = 'core' | 'optional'

export interface CapabilityPack {
  id: PackId
  name: string
  description: string
  status: PackStatus
  /** Members from TOOL_REGISTRY (addon ids). Disabling the pack hides these. */
  toolIds: string[]
  /** Members from PLUGIN_REGISTRY. Disabling the pack toggles these off. */
  pluginIds: string[]
  /** Owned IPC domains for backend gating (mirrors PACK_IPC_DOMAINS). */
  ipcDomains: IpcDomainId[]
  /** Partitions INTEGRATION_REGISTRY by category for the pack's own sub-view. */
  integrationCategories: IntegrationCategory[]
  /** Explicit integration ids where category is too coarse. */
  integrationIds?: string[]
  /** Per-domain ARIA operator tool module names contributed by this pack. */
  ariaToolModules: string[]
  perfNote: string
}

export const CAPABILITY_PACKS: CapabilityPack[] = [
  {
    id: 'solana',
    name: 'Solana',
    description: 'Solana dev workflow, project readiness, block scanner, replay, Metaplex, and RPC/NFT integrations.',
    status: 'optional',
    toolIds: ['solana-toolbox', 'project-readiness', 'block-scanner', 'replay-engine', 'metaplex-demo', 'integrations'],
    pluginIds: [],
    ipcDomains: PACK_IPC_DOMAINS.solana,
    integrationCategories: ['rpc', 'nft'],
    integrationIds: ['jupiter'],
    ariaToolModules: ['navigation', 'settings'],
    perfNote: 'Loads Metaplex, replay, and forensics services on demand.',
  },
  {
    id: 'wallet',
    name: 'Wallet',
    description: 'Wallet management, portfolio, PnL, and forensic graphing with wallet provider integrations.',
    status: 'optional',
    toolIds: ['wallet', 'ricomaps'],
    pluginIds: [],
    ipcDomains: PACK_IPC_DOMAINS.wallet,
    integrationCategories: ['wallet'],
    ariaToolModules: ['wallet'],
    perfNote: 'Loads wallet, PnL, and vault services on demand.',
  },
  {
    id: 'launch',
    name: 'Launch',
    description: 'Token launches across Pump.fun, Raydium, Meteora, OpenBid, proof pools, and the fee flywheel.',
    status: 'optional',
    toolIds: ['token-launch', 'proof-pool', 'clawpump', 'degentools', 'flywheel'],
    pluginIds: [],
    ipcDomains: PACK_IPC_DOMAINS.launch,
    integrationCategories: ['launch', 'defi'],
    ariaToolModules: ['tokenLaunch', 'flywheel', 'clawpump'],
    perfNote: 'Loads launchpad adapters (Pump/Raydium/Meteora/OpenBid) on demand.',
  },
  {
    id: 'agent',
    name: 'Agent',
    description: 'Agent station, agent work, AgentOps, DaemonAI, parallel swarms, and Pro features.',
    status: 'optional',
    toolIds: ['agentops', 'agent-work', 'agent-station', 'daemon-ai', 'pro'],
    pluginIds: [],
    ipcDomains: PACK_IPC_DOMAINS.agent,
    integrationCategories: ['agent'],
    ariaToolModules: ['agentStation', 'swarm'],
    perfNote: 'Skips the swarm worktree reconcile at boot when disabled.',
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Approved, source-backed project facts injected into agent prompts.',
    status: 'optional',
    toolIds: [],
    pluginIds: ['memory'],
    ipcDomains: PACK_IPC_DOMAINS.memory,
    integrationCategories: [],
    ariaToolModules: [],
    perfNote: 'Loads the memory store on demand.',
  },
  {
    id: 'sites',
    name: 'Sites',
    description: 'Vercel and Railway deployments plus on-chain program shipping.',
    status: 'optional',
    toolIds: [],
    pluginIds: ['deploy'],
    ipcDomains: PACK_IPC_DOMAINS.sites,
    integrationCategories: [],
    ariaToolModules: [],
    perfNote: 'Loads deploy and shipline services on demand.',
  },
  {
    id: 'markets',
    name: 'Markets & Intel',
    description: 'Signal House, hackathon tracker, Meterflow billing, and Zauth provider hub.',
    status: 'optional',
    toolIds: ['signalhouse', 'hackathon', 'meterflow', 'zauth'],
    pluginIds: [],
    ipcDomains: PACK_IPC_DOMAINS.markets,
    integrationCategories: [],
    integrationIds: ['signalhouse', 'idle-protocol', 'zauth', 'streamlock'],
    ariaToolModules: [],
    perfNote: 'Skips the Meterflow receipt watcher when disabled.',
  },
  {
    id: 'guard',
    name: 'Guard',
    description: 'Transaction signer guard and mainnet approval enforcement (always on).',
    status: 'core',
    toolIds: [],
    pluginIds: [],
    ipcDomains: PACK_IPC_DOMAINS.guard,
    integrationCategories: [],
    ariaToolModules: [],
    perfNote: 'Always active — protects mainnet transactions.',
  },
]

export const CAPABILITY_PACKS_BY_ID = Object.fromEntries(
  CAPABILITY_PACKS.map((pack) => [pack.id, pack]),
) as Record<PackId, CapabilityPack>

export const OPTIONAL_PACK_IDS = CAPABILITY_PACKS
  .filter((pack) => pack.status === 'optional')
  .map((pack) => pack.id)

export function isCorePack(packId: PackId): boolean {
  return CAPABILITY_PACKS_BY_ID[packId]?.status === 'core'
}

/** All addon tool ids owned by optional packs (used to derive profile presets). */
export function packToolIds(packIds: PackId[]): string[] {
  const ids: string[] = []
  for (const packId of packIds) {
    const pack = CAPABILITY_PACKS_BY_ID[packId]
    if (pack) ids.push(...pack.toolIds)
  }
  return ids
}

export { defaultEnabledPacks as default_enabled_packs }

import type { IntegrationCategory } from '../panels/IntegrationCommandCenter/registry'
import { PACK_IPC_DOMAINS, CORE_PACK_IDS, defaultEnabledPacks } from '../../electron/shared/packManifest'
import type { PackId, IpcDomainId } from '../../electron/shared/packManifest'

export type { PackId, IpcDomainId } from '../../electron/shared/packManifest'
export { PACK_IPC_DOMAINS, CORE_PACK_IDS, defaultEnabledPacks } from '../../electron/shared/packManifest'

export type PackStatus = 'core' | 'optional'

/**
 * Canonical Activity Bar slot a pack contributes. When the pack is enabled the
 * IconSidebar renders this slot automatically (above the user's manual pins);
 * disabling the pack removes it. `toolId` is the pack's primary host surface.
 */
export interface PackActivityBarSlot {
  /** Primary host tool/plugin id the slot opens. */
  toolId: string
  /** Sort order among pack slots (lower = higher in the bar). */
  order: number
}

export interface CapabilityPack {
  id: PackId
  name: string
  description: string
  status: PackStatus
  /** Canonical Activity Bar slot. Omit for packs with no primary surface (e.g. guard). */
  activityBar?: PackActivityBarSlot
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
    activityBar: { toolId: 'solana-toolbox', order: 10 },
    toolIds: ['solana-toolbox', 'project-readiness', 'block-scanner', 'replay-engine', 'metaplex-demo'],
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
    activityBar: { toolId: 'wallet', order: 20 },
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
    activityBar: { toolId: 'token-launch', order: 30 },
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
    activityBar: { toolId: 'daemon-ai', order: 40 },
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
    activityBar: { toolId: 'memory', order: 60 },
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
    activityBar: { toolId: 'deploy', order: 70 },
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
    activityBar: { toolId: 'signalhouse', order: 50 },
    toolIds: ['signalhouse', 'hackathon', 'meterflow', 'zauth'],
    pluginIds: [],
    ipcDomains: PACK_IPC_DOMAINS.markets,
    integrationCategories: [],
    integrationIds: ['signalhouse', 'idle-protocol', 'zauth', 'streamlock'],
    ariaToolModules: [],
    perfNote: 'Skips the Meterflow receipt watcher when disabled.',
  },
  {
    id: 'create',
    name: 'Create',
    description: 'Image editing, email, and content tools for launch and marketing assets.',
    status: 'optional',
    activityBar: { toolId: 'image-editor', order: 55 },
    toolIds: ['image-editor', 'email'],
    pluginIds: [],
    ipcDomains: PACK_IPC_DOMAINS.create,
    integrationCategories: [],
    ariaToolModules: [],
    perfNote: 'Skips image and tweet services when disabled.',
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

/** Reverse lookup: tool/plugin id → owning pack id (for perf gating). */
export const TOOL_TO_PACK: Record<string, PackId> = (() => {
  const map: Record<string, PackId> = {}
  for (const pack of CAPABILITY_PACKS) {
    for (const toolId of pack.toolIds) map[toolId] = pack.id
    for (const pluginId of pack.pluginIds) map[pluginId] = pack.id
  }
  return map
})()

/** Packs that contribute an Activity Bar slot, in render order. */
export const ACTIVITY_BAR_PACKS = CAPABILITY_PACKS
  .filter((pack) => pack.activityBar)
  .sort((a, b) => a.activityBar!.order - b.activityBar!.order)

/** Every tool id that is the primary surface of a pack Activity Bar slot. */
export const ACTIVITY_BAR_SLOT_TOOL_IDS = new Set(
  ACTIVITY_BAR_PACKS.map((pack) => pack.activityBar!.toolId),
)

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

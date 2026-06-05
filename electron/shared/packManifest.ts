// Shared capability-pack manifest. Imported by BOTH the main process (for
// pack-gated IPC registration) and the renderer (for the pack model). Keep this
// file free of React, Node, and Electron imports so it stays tree-shakeable on
// both sides.

export type PackId =
  | 'solana'
  | 'wallet'
  | 'launch'
  | 'agent'
  | 'memory'
  | 'sites'
  | 'markets'
  | 'guard'

// IPC domains that a pack owns. A disabled pack skips registration of these
// handler modules at boot. Core domains are NOT listed here — they always
// register. Keys match the registrar table in electron/main/index.ts.
export type IpcDomainId =
  | 'wallet'
  | 'pnl'
  | 'vault'
  | 'launch'
  | 'pumpfun'
  | 'proofpool'
  | 'clawpump'
  | 'degentools'
  | 'flywheel'
  | 'swarm'
  | 'memory'
  | 'deploy'
  | 'shipline'
  | 'signalhouse'
  | 'meterflow'
  | 'idle'
  | 'colosseum'
  | 'metaplex'
  | 'forensics'
  | 'replay'
  | 'agentStation'

// Pack -> owned IPC domains. The single source of truth for backend gating.
// The renderer pack model (src/constants/capabilityPacks.ts) re-exports this so
// there is exactly one mapping.
export const PACK_IPC_DOMAINS: Record<PackId, IpcDomainId[]> = {
  solana: ['metaplex', 'replay', 'forensics'],
  wallet: ['wallet', 'pnl', 'vault'],
  launch: ['launch', 'pumpfun', 'proofpool', 'clawpump', 'degentools', 'flywheel'],
  agent: ['agentStation', 'swarm'],
  memory: ['memory'],
  sites: ['deploy', 'shipline'],
  markets: ['signalhouse', 'meterflow', 'idle', 'colosseum'],
  guard: [],
}

// Packs that are always on (cannot be disabled). Their tools are 'core' in
// TOOL_REGISTRY, and their IPC domains (if any) always register.
export const CORE_PACK_IDS: PackId[] = ['guard']

// Default enabled state: every pack on, matching today's full surface.
export function defaultEnabledPacks(): Record<PackId, boolean> {
  return {
    solana: true,
    wallet: true,
    launch: true,
    agent: true,
    memory: true,
    sites: true,
    markets: true,
    guard: true,
  }
}

// Resolve which IPC domains should register given an enabled-packs map.
// Core packs always contribute; optional packs contribute only when enabled.
export function enabledIpcDomains(enabled: Partial<Record<PackId, boolean>>): Set<IpcDomainId> {
  const domains = new Set<IpcDomainId>()
  for (const packId of Object.keys(PACK_IPC_DOMAINS) as PackId[]) {
    const isCore = CORE_PACK_IDS.includes(packId)
    const isEnabled = enabled[packId] !== false
    if (isCore || isEnabled) {
      for (const domain of PACK_IPC_DOMAINS[packId]) domains.add(domain)
    }
  }
  return domains
}

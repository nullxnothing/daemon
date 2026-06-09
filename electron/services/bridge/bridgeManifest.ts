/**
 * Bridge tool allowlist — the only ARIA tools reachable by external MCP agents.
 *
 * Deliberately import-free (no services) so the gateway, tests, and the shim
 * build can all consume it. `packId: null` marks core tools that are always
 * available; everything else is filtered against the enabled packs at runtime.
 *
 * Excluded by design: anything touching `runUiEffect` (renderer round-trips),
 * `present_plan`/`propose_patch` (transcript UI, not side effects), and all
 * domains beyond wallet/launch/memory for v1.
 */
import type { PackId } from '../../shared/packManifest'

export interface BridgeAllowlistEntry {
  name: string
  packId: PackId | null
}

export const BRIDGE_TOOL_ALLOWLIST: readonly BridgeAllowlistEntry[] = [
  // wallet pack
  { name: 'read_wallet', packId: 'wallet' },
  { name: 'generate_wallet', packId: 'wallet' },
  { name: 'set_default_wallet', packId: 'wallet' },
  { name: 'assign_project_wallet', packId: 'wallet' },
  { name: 'store_helius_key', packId: 'wallet' },
  // launch pack
  { name: 'tokenlaunch_list_launchpads', packId: 'launch' },
  { name: 'tokenlaunch_preflight', packId: 'launch' },
  { name: 'tokenlaunch_create', packId: 'launch' },
  // memory pack
  { name: 'remember_fact', packId: 'memory' },
  { name: 'recall_memories', packId: 'memory' },
  { name: 'forget_memory', packId: 'memory' },
  { name: 'update_memory', packId: 'memory' },
  // core
  { name: 'read_project_status', packId: null },
]

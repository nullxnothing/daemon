import { CORE_TOOL_IDS } from './toolRegistry'
import { packToolIds } from './capabilityPacks'

export type WorkspaceProfileName = 'web' | 'solana' | 'custom'

export interface WorkspaceProfile {
  name: WorkspaceProfileName
  toolVisibility: Record<string, boolean>
}

// Base web shell tools — not owned by any capability pack. The web profile is
// exactly this set; the solana profile is this set plus every optional pack's
// tools (derived below so packs stay the single source of membership truth).
const WEB_TOOLS = [
  'starter', 'git', 'deploy', 'env', 'email', 'ports',
  'processes', 'settings', 'image-editor', 'docs',
  'sessions', 'plugins', 'recovery', 'activity', 'browser',
]

// Shell tools the Solana profile shows that aren't owned by a capability pack
// (the dashboard is a shell host surface, not a pack member).
const SOLANA_SHELL_EXTRAS = ['dashboard']

// Solana profile = web base + the tools of the Solana-facing packs. Derived
// from CAPABILITY_PACKS so adding a tool to a pack surfaces it here automatically.
const SOLANA_TOOLS = [
  ...WEB_TOOLS,
  ...packToolIds(['solana', 'wallet', 'launch', 'agent', 'markets']),
  ...SOLANA_SHELL_EXTRAS,
]

export const PROFILE_PRESETS: Record<WorkspaceProfileName, string[]> = {
  web: WEB_TOOLS,
  solana: SOLANA_TOOLS,
  custom: [], // empty = show all
}

export function getDefaultVisibility(
  profileName: WorkspaceProfileName,
  allToolIds: string[],
): Record<string, boolean> {
  const allowedTools = PROFILE_PRESETS[profileName]

  // Custom profile: all tools visible
  if (allowedTools.length === 0) {
    return Object.fromEntries(allToolIds.map((id) => [id, true]))
  }

  return Object.fromEntries(
    allToolIds.map((id) => [id, CORE_TOOL_IDS.includes(id) || allowedTools.includes(id)]),
  )
}

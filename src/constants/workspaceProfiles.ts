import { CORE_TOOL_IDS } from './toolRegistry'

export type WorkspaceProfileName = 'web' | 'solana' | 'custom'

export interface WorkspaceProfile {
  name: WorkspaceProfileName
  toolVisibility: Record<string, boolean>
}

const WEB_TOOLS = [
  'starter', 'git', 'deploy', 'env', 'email', 'ports',
  'processes', 'settings', 'image-editor', 'docs',
  'sessions', 'plugins', 'recovery', 'activity',
]

const SOLANA_TOOLS = [
  ...WEB_TOOLS, 'wallet', 'agent-work', 'token-launch', 'project-readiness', 'solana-toolbox', 'integrations', 'block-scanner',
  'dashboard', 'hackathon', 'pro',
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

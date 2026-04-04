export type WorkspaceProfileName = 'web' | 'solana' | 'custom'

export interface WorkspaceProfile {
  name: WorkspaceProfileName
  toolVisibility: Record<string, boolean>
}

const WEB_TOOLS = [
  'git', 'deploy', 'env', 'tools', 'browser', 'ports', 'processes', 'settings', 'email', 'image-editor',
]

const SOLANA_TOOLS = [
  ...WEB_TOOLS, 'wallet', 'images', 'solana-toolbox', 'xreplies', 'pumpfun',
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
    allToolIds.map((id) => [id, allowedTools.includes(id)]),
  )
}

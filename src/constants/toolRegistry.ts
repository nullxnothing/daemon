export type ToolModuleClass = 'core' | 'addon'
export type ToolSurface = 'drawer' | 'tab'

export interface ToolRegistryEntry {
  id: string
  name: string
  moduleClass: ToolModuleClass
  surface: ToolSurface
}

export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  { id: 'starter', name: 'New Project', moduleClass: 'addon', surface: 'drawer' },
  { id: 'git', name: 'Git', moduleClass: 'addon', surface: 'drawer' },
  { id: 'deploy', name: 'Deploy', moduleClass: 'addon', surface: 'drawer' },
  { id: 'env', name: 'Env', moduleClass: 'addon', surface: 'drawer' },
  { id: 'wallet', name: 'Wallet', moduleClass: 'addon', surface: 'drawer' },
  { id: 'email', name: 'Email', moduleClass: 'addon', surface: 'drawer' },
  { id: 'ports', name: 'Ports', moduleClass: 'addon', surface: 'drawer' },
  { id: 'processes', name: 'Processes', moduleClass: 'addon', surface: 'drawer' },
  { id: 'settings', name: 'Settings', moduleClass: 'core', surface: 'drawer' },
  { id: 'image-editor', name: 'Image Editor', moduleClass: 'addon', surface: 'drawer' },
  { id: 'token-launch', name: 'Token Launch', moduleClass: 'addon', surface: 'drawer' },
  { id: 'project-readiness', name: 'Project Readiness', moduleClass: 'addon', surface: 'drawer' },
  { id: 'solana-toolbox', name: 'Solana', moduleClass: 'addon', surface: 'drawer' },
  { id: 'integrations', name: 'Integrations', moduleClass: 'addon', surface: 'drawer' },
  { id: 'block-scanner', name: 'Block Scanner', moduleClass: 'addon', surface: 'drawer' },
  { id: 'replay-engine', name: 'Replay', moduleClass: 'addon', surface: 'drawer' },
  { id: 'docs', name: 'Docs', moduleClass: 'addon', surface: 'drawer' },
  { id: 'dashboard', name: 'Dashboard', moduleClass: 'addon', surface: 'drawer' },
  { id: 'agent-work', name: 'Agent Work', moduleClass: 'addon', surface: 'drawer' },
  { id: 'sessions', name: 'Sessions', moduleClass: 'addon', surface: 'drawer' },
  { id: 'hackathon', name: 'Hackathon', moduleClass: 'addon', surface: 'drawer' },
  { id: 'pro', name: 'Daemon Pro', moduleClass: 'addon', surface: 'drawer' },
  { id: 'plugins', name: 'Plugins', moduleClass: 'addon', surface: 'drawer' },
  { id: 'recovery', name: 'Recovery', moduleClass: 'addon', surface: 'drawer' },
  { id: 'activity', name: 'Activity', moduleClass: 'addon', surface: 'drawer' },
  { id: 'agent-station', name: 'Agent Station', moduleClass: 'addon', surface: 'drawer' },
  { id: 'spawnagents', name: 'SpawnAgents', moduleClass: 'addon', surface: 'drawer' },
  { id: 'browser', name: 'Browser', moduleClass: 'addon', surface: 'tab' },
] as const

export const TOOL_REGISTRY_BY_ID = Object.fromEntries(
  TOOL_REGISTRY.map((tool) => [tool.id, tool]),
) as Record<string, ToolRegistryEntry>

export const TOOL_DISPLAY_NAMES = Object.fromEntries(
  TOOL_REGISTRY.map((tool) => [tool.id, tool.name]),
) as Record<string, string>

export const CORE_TOOL_IDS = TOOL_REGISTRY
  .filter((tool) => tool.moduleClass === 'core')
  .map((tool) => tool.id)

export const ADDON_TOOL_IDS = TOOL_REGISTRY
  .filter((tool) => tool.moduleClass === 'addon')
  .map((tool) => tool.id)

export const DRAWER_TOOL_IDS = TOOL_REGISTRY
  .filter((tool) => tool.surface === 'drawer')
  .map((tool) => tool.id)

export function getToolRegistryEntry(toolId: string): ToolRegistryEntry | null {
  return TOOL_REGISTRY_BY_ID[toolId] ?? null
}

export function isCoreTool(toolId: string): boolean {
  return getToolRegistryEntry(toolId)?.moduleClass === 'core'
}

export function isAddonTool(toolId: string): boolean {
  return getToolRegistryEntry(toolId)?.moduleClass === 'addon'
}

export function isToolDisableable(toolId: string): boolean {
  return !isCoreTool(toolId)
}

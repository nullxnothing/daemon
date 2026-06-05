export interface ToolAlias {
  toolId: string
  subView?: string
}

export const TOOL_ALIASES: Record<string, ToolAlias> = {
  integrations: { toolId: 'solana-toolbox', subView: 'integrations' },
}

export function resolveToolAlias(toolId: string): ToolAlias {
  return TOOL_ALIASES[toolId] ?? { toolId }
}

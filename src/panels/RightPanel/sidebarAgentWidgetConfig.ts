export interface SidebarAgentWidgetConfig {
  enabled: boolean
  agentId: string | null
}

export const SIDEBAR_AGENT_WIDGET_EVENT = 'daemon:sidebar-agent-widget'

const STORAGE_KEY = 'daemon:right-sidebar:spawn-agent-widget'
const PANEL_STORAGE_KEY = 'daemon:right-sidebar:widgets'

export type RightSidebarWidgetId =
  | 'project-status'
  | 'wallet-snapshot'
  | 'solana-readiness'
  | 'token-watch'
  | 'zauth'
  | 'ai-status'
  | 'spawn-agent'

export interface RightSidebarWidgetConfig {
  enabled: Record<RightSidebarWidgetId, boolean>
  spawnAgentId: string | null
  tokenWatchMint: string | null
}

export const RIGHT_SIDEBAR_WIDGET_EVENT = 'daemon:right-sidebar-widgets'

export const RIGHT_SIDEBAR_WIDGETS: Array<{
  id: RightSidebarWidgetId
  name: string
  description: string
}> = [
  {
    id: 'project-status',
    name: 'Project Status',
    description: 'Active project, open terminal count, and quick context.',
  },
  {
    id: 'wallet-snapshot',
    name: 'Wallet Snapshot',
    description: 'Portfolio value, wallet count, and active wallet.',
  },
  {
    id: 'solana-readiness',
    name: 'Solana Readiness',
    description: 'Wallet, signer, RPC, Jupiter, MCP, and local validator health.',
  },
  {
    id: 'token-watch',
    name: 'Token Watch',
    description: 'Paste a token mint, track price/holders, and jump into buy or sell.',
  },
  {
    id: 'zauth',
    name: 'Zauth',
    description: 'x402 Database and Provider Hub shortcuts in the right sidebar.',
  },
  {
    id: 'ai-status',
    name: 'AI Status',
    description: 'Claude and Codex connection state without opening settings.',
  },
  {
    id: 'spawn-agent',
    name: 'Spawn Agent',
    description: 'Pinned SpawnAgents profile with PnL, value, age, and win rate.',
  },
]

const DEFAULT_WIDGET_CONFIG: RightSidebarWidgetConfig = {
  enabled: {
    'project-status': false,
    'wallet-snapshot': false,
    'solana-readiness': false,
    'token-watch': false,
    'zauth': false,
    'ai-status': false,
    'spawn-agent': false,
  },
  spawnAgentId: null,
  tokenWatchMint: null,
}

function normalizeWidgetConfig(value: Partial<RightSidebarWidgetConfig> | null | undefined): RightSidebarWidgetConfig {
  const legacy = readSidebarAgentWidgetConfig()
  return {
    enabled: {
      ...DEFAULT_WIDGET_CONFIG.enabled,
      ...(value?.enabled ?? {}),
      'spawn-agent': Boolean(value?.enabled?.['spawn-agent'] ?? legacy.enabled),
    },
    spawnAgentId: typeof value?.spawnAgentId === 'string' && value.spawnAgentId.length > 0
      ? value.spawnAgentId
      : legacy.agentId,
    tokenWatchMint: typeof value?.tokenWatchMint === 'string' && value.tokenWatchMint.length > 0
      ? value.tokenWatchMint
      : null,
  }
}

export function readRightSidebarWidgetConfig(): RightSidebarWidgetConfig {
  if (typeof window === 'undefined') return DEFAULT_WIDGET_CONFIG

  try {
    const parsed = JSON.parse(window.localStorage.getItem(PANEL_STORAGE_KEY) ?? 'null') as Partial<RightSidebarWidgetConfig> | null
    return normalizeWidgetConfig(parsed)
  } catch {
    return normalizeWidgetConfig(null)
  }
}

export function writeRightSidebarWidgetConfig(config: RightSidebarWidgetConfig): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeWidgetConfig(config)
  window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(normalized))
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    enabled: normalized.enabled['spawn-agent'],
    agentId: normalized.spawnAgentId,
  }))
  window.dispatchEvent(new CustomEvent(RIGHT_SIDEBAR_WIDGET_EVENT, { detail: normalized }))
  window.dispatchEvent(new CustomEvent(SIDEBAR_AGENT_WIDGET_EVENT, {
    detail: { enabled: normalized.enabled['spawn-agent'], agentId: normalized.spawnAgentId },
  }))
}

export function setRightSidebarWidgetEnabled(widgetId: RightSidebarWidgetId, enabled: boolean): void {
  const current = readRightSidebarWidgetConfig()
  writeRightSidebarWidgetConfig({
    ...current,
    enabled: {
      ...current.enabled,
      [widgetId]: enabled,
    },
  })
}

export function readSidebarAgentWidgetConfig(): SidebarAgentWidgetConfig {
  if (typeof window === 'undefined') return { enabled: false, agentId: null }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<SidebarAgentWidgetConfig> | null
    return {
      enabled: Boolean(parsed?.enabled),
      agentId: typeof parsed?.agentId === 'string' && parsed.agentId.length > 0 ? parsed.agentId : null,
    }
  } catch {
    return { enabled: false, agentId: null }
  }
}

export function writeSidebarAgentWidgetConfig(config: SidebarAgentWidgetConfig): void {
  if (typeof window === 'undefined') return
  const current = readRightSidebarWidgetConfig()
  writeRightSidebarWidgetConfig({
    ...current,
    enabled: {
      ...current.enabled,
      'spawn-agent': config.enabled,
    },
    spawnAgentId: config.agentId,
  })
}

export function setSidebarAgentWidgetAgent(agentId: string): void {
  const current = readRightSidebarWidgetConfig()
  writeRightSidebarWidgetConfig({
    ...current,
    enabled: {
      ...current.enabled,
      'spawn-agent': true,
    },
    spawnAgentId: agentId,
  })
}

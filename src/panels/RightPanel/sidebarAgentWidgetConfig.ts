const PANEL_STORAGE_KEY = 'daemon:right-sidebar:widgets'

export type RightSidebarWidgetId =
  | 'project-status'
  | 'wallet-snapshot'
  | 'solana-readiness'
  | 'token-watch'
  | 'zauth'
  | 'meterflow'
  | 'ai-status'
  | 'clawpump'

export interface RightSidebarWidgetConfig {
  enabled: Record<RightSidebarWidgetId, boolean>
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
    id: 'meterflow',
    name: 'Meterflow',
    description: 'Live receipts, meters, spend controls, and webhook status.',
  },
  {
    id: 'ai-status',
    name: 'AI Status',
    description: 'Claude and Codex connection state without opening settings.',
  },
  {
    id: 'clawpump',
    name: 'ClawPump',
    description: 'Connection state and agent count for your hosted ClawPump agents.',
  },
]

const DEFAULT_WIDGET_CONFIG: RightSidebarWidgetConfig = {
  enabled: {
    'project-status': false,
    'wallet-snapshot': false,
    'solana-readiness': false,
    'token-watch': false,
    'zauth': false,
    'meterflow': false,
    'ai-status': false,
    'clawpump': false,
  },
  tokenWatchMint: null,
}

function normalizeWidgetConfig(value: Partial<RightSidebarWidgetConfig> | null | undefined): RightSidebarWidgetConfig {
  return {
    enabled: {
      ...DEFAULT_WIDGET_CONFIG.enabled,
      ...(value?.enabled ?? {}),
    },
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
  window.dispatchEvent(new CustomEvent(RIGHT_SIDEBAR_WIDGET_EVENT, { detail: normalized }))
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

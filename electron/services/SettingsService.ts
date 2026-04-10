import { getDb } from '../db/db'
import { PublicKey } from '@solana/web3.js'
import type { OnboardingProgress, WorkspaceProfile } from '../shared/types'

export interface RaydiumLaunchpadSettings {
  configId: string
  quoteMint: string
}

export interface MeteoraLaunchpadSettings {
  configId: string
  quoteMint: string
  baseSupply: string
}

export interface TokenLaunchSettings {
  raydium: RaydiumLaunchpadSettings
  meteora: MeteoraLaunchpadSettings
}

export interface WalletInfrastructureSettings {
  rpcProvider: 'helius' | 'public' | 'quicknode' | 'custom'
  quicknodeRpcUrl: string
  customRpcUrl: string
  swapProvider: 'jupiter'
  preferredWallet: 'phantom' | 'wallet-standard'
  executionMode: 'rpc' | 'jito'
  jitoBlockEngineUrl: string
}

export function getBooleanSetting(key: string, fallback: boolean): boolean {
  const db = getDb()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return fallback
  return row.value === 'true'
}

export function setBooleanSetting(key: string, value: boolean): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, value ? 'true' : 'false', Date.now())
}

export function getJsonSetting<T>(key: string, fallback: T): T {
  const db = getDb()
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export function setJsonSetting(key: string, value: unknown): void {
  const db = getDb()
  db.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, JSON.stringify(value), Date.now())
}

export function getUiSettings(): { showMarketTape: boolean; showTitlebarWallet: boolean } {
  return {
    showMarketTape: getBooleanSetting('show_market_tape', true),
    showTitlebarWallet: getBooleanSetting('show_titlebar_wallet', true),
  }
}

export function isOnboardingComplete(): boolean {
  return getBooleanSetting('onboarding_complete', false)
}

export function setOnboardingComplete(complete: boolean): void {
  setBooleanSetting('onboarding_complete', complete)
}

const DEFAULT_PROGRESS: OnboardingProgress = {
  profile: 'pending',
  claude: 'pending',
  gmail: 'pending',
  vercel: 'pending',
  railway: 'pending',
  tour: 'pending',
}

export function getOnboardingProgress(): OnboardingProgress {
  return getJsonSetting<OnboardingProgress>('onboarding_progress', DEFAULT_PROGRESS)
}

export function setOnboardingProgress(progress: OnboardingProgress): void {
  setJsonSetting('onboarding_progress', progress)
}

const DEFAULT_PINNED_TOOLS = ['git', 'browser', 'token-launch', 'solana-toolbox', 'pro']
const PRO_PIN_MIGRATION_KEY = 'pinned_tools_pro_default_added'
const UI_RECOVERY_KEYS = [
  'layout_center_mode',
  'layout_right_panel_tab',
  'workspace_profile',
  'pinned_tools',
  'drawer_tool_order',
] as const
const UI_RECOVERY_THRESHOLD = 3
const UI_RECOVERY_COOLDOWN_MS = 60 * 60 * 1000
const UI_RECOVERY_MARKER_KEY = 'ui_recovery_last_run_at'

export interface UiRecoveryResult {
  clearedKeys: string[]
  clearedActiveSessions: number
  ranAt: number
}

function sanitizePinnedTools(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_PINNED_TOOLS
  const seen = new Set<string>()
  const safe = value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .filter((entry) => {
      if (seen.has(entry)) return false
      seen.add(entry)
      return true
    })
    .slice(0, 50)
  return safe.length > 0 ? safe : DEFAULT_PINNED_TOOLS
}

function sanitizeWorkspaceProfile(value: WorkspaceProfile | null): WorkspaceProfile | null {
  if (!value || typeof value !== 'object') return null
  if (value.name !== 'web' && value.name !== 'solana' && value.name !== 'custom') return null
  if (!value.toolVisibility || typeof value.toolVisibility !== 'object') return null
  const toolVisibility = Object.fromEntries(
    Object.entries(value.toolVisibility).filter(([, visible]) => typeof visible === 'boolean')
  ) as Record<string, boolean>
  return { name: value.name, toolVisibility }
}

export function getWorkspaceProfile(): WorkspaceProfile | null {
  return sanitizeWorkspaceProfile(getJsonSetting<WorkspaceProfile | null>('workspace_profile', null))
}

export function setWorkspaceProfile(profile: WorkspaceProfile): void {
  const safe = sanitizeWorkspaceProfile(profile)
  if (!safe) throw new Error('Invalid workspace profile')
  setJsonSetting('workspace_profile', safe)
}

export function getPinnedTools(): string[] {
  const pinnedTools = sanitizePinnedTools(getJsonSetting<unknown>('pinned_tools', DEFAULT_PINNED_TOOLS))
  if (getBooleanSetting(PRO_PIN_MIGRATION_KEY, false)) return pinnedTools

  const migratedTools = pinnedTools.includes('pro') ? pinnedTools : [...pinnedTools, 'pro']
  setJsonSetting('pinned_tools', migratedTools)
  setBooleanSetting(PRO_PIN_MIGRATION_KEY, true)
  return migratedTools
}

export function setPinnedTools(tools: string[]): void {
  setJsonSetting('pinned_tools', sanitizePinnedTools(tools))
}

export function getDrawerToolOrder(): string[] {
  return sanitizePinnedTools(getJsonSetting<unknown>('drawer_tool_order', []))
}

export function setDrawerToolOrder(order: string[]): void {
  setJsonSetting('drawer_tool_order', sanitizePinnedTools(order))
}

export function recoverUiState(): UiRecoveryResult {
  const db = getDb()
  const now = Date.now()
  const deleteSetting = db.prepare('DELETE FROM app_settings WHERE key = ?')
  for (const key of UI_RECOVERY_KEYS) {
    deleteSetting.run(key)
  }
  const clearedActiveSessions = db.prepare('DELETE FROM active_sessions').run().changes
  setJsonSetting(UI_RECOVERY_MARKER_KEY, now)
  return {
    clearedKeys: [...UI_RECOVERY_KEYS],
    clearedActiveSessions,
    ranAt: now,
  }
}

export function maybeRecoverUnstableUiState(recentCrashCount: number): UiRecoveryResult | null {
  if (recentCrashCount <= UI_RECOVERY_THRESHOLD) return null
  const lastRanAt = getJsonSetting<number>(UI_RECOVERY_MARKER_KEY, 0)
  const now = Date.now()
  if (typeof lastRanAt === 'number' && now - lastRanAt < UI_RECOVERY_COOLDOWN_MS) {
    return null
  }
  return recoverUiState()
}

const DEFAULT_TOKEN_LAUNCH_SETTINGS: TokenLaunchSettings = {
  raydium: {
    configId: '',
    quoteMint: '',
  },
  meteora: {
    configId: '',
    quoteMint: '',
    baseSupply: '',
  },
}

const DEFAULT_WALLET_INFRASTRUCTURE_SETTINGS: WalletInfrastructureSettings = {
  rpcProvider: 'helius',
  quicknodeRpcUrl: '',
  customRpcUrl: '',
  swapProvider: 'jupiter',
  preferredWallet: 'phantom',
  executionMode: 'rpc',
  jitoBlockEngineUrl: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function assertPublicKey(value: string, fieldName: string): void {
  try {
    new PublicKey(value)
  } catch {
    throw new Error(`${fieldName} must be a valid Solana public key`)
  }
}

function validateOptionalPublicKey(value: string, fieldName: string): void {
  if (!value) return
  assertPublicKey(value, fieldName)
}

function validateOptionalPositiveInteger(value: string, fieldName: string): void {
  if (!value) return
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must be a positive integer`)
  }
  if (BigInt(value) <= 0n) {
    throw new Error(`${fieldName} must be greater than zero`)
  }
}

function validateOptionalHttpUrl(value: string, fieldName: string): void {
  if (!value) return
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${fieldName} must be a valid URL`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`${fieldName} must use http or https`)
  }
}

export function getTokenLaunchSettings(): TokenLaunchSettings {
  const value = getJsonSetting<TokenLaunchSettings>('token_launch_settings', DEFAULT_TOKEN_LAUNCH_SETTINGS)
  return {
    raydium: {
      configId: normalizeText(value?.raydium?.configId),
      quoteMint: normalizeText(value?.raydium?.quoteMint),
    },
    meteora: {
      configId: normalizeText(value?.meteora?.configId),
      quoteMint: normalizeText(value?.meteora?.quoteMint),
      baseSupply: normalizeText(value?.meteora?.baseSupply),
    },
  }
}

export function setTokenLaunchSettings(settings: TokenLaunchSettings): void {
  const next = {
    raydium: {
      configId: normalizeText(settings?.raydium?.configId),
      quoteMint: normalizeText(settings?.raydium?.quoteMint),
    },
    meteora: {
      configId: normalizeText(settings?.meteora?.configId),
      quoteMint: normalizeText(settings?.meteora?.quoteMint),
      baseSupply: normalizeText(settings?.meteora?.baseSupply),
    },
  }

  validateOptionalPublicKey(next.raydium.configId, 'Raydium config ID')
  validateOptionalPublicKey(next.raydium.quoteMint, 'Raydium quote mint')
  validateOptionalPublicKey(next.meteora.configId, 'Meteora config ID')
  validateOptionalPublicKey(next.meteora.quoteMint, 'Meteora quote mint')
  validateOptionalPositiveInteger(next.meteora.baseSupply, 'Meteora base supply')

  setJsonSetting('token_launch_settings', next)
}

export function getWalletInfrastructureSettings(): WalletInfrastructureSettings {
  const value = getJsonSetting<WalletInfrastructureSettings>(
    'wallet_infrastructure_settings',
    DEFAULT_WALLET_INFRASTRUCTURE_SETTINGS,
  )

  return {
    rpcProvider: value?.rpcProvider === 'public' || value?.rpcProvider === 'quicknode' || value?.rpcProvider === 'custom'
      ? value.rpcProvider
      : 'helius',
    quicknodeRpcUrl: normalizeText(value?.quicknodeRpcUrl),
    customRpcUrl: normalizeText(value?.customRpcUrl),
    swapProvider: 'jupiter',
    preferredWallet: value?.preferredWallet === 'wallet-standard' ? 'wallet-standard' : 'phantom',
    executionMode: value?.executionMode === 'jito' ? 'jito' : 'rpc',
    jitoBlockEngineUrl: normalizeText(value?.jitoBlockEngineUrl) || DEFAULT_WALLET_INFRASTRUCTURE_SETTINGS.jitoBlockEngineUrl,
  }
}

export function setWalletInfrastructureSettings(settings: WalletInfrastructureSettings): void {
  const next: WalletInfrastructureSettings = {
    rpcProvider: settings?.rpcProvider === 'public' || settings?.rpcProvider === 'quicknode' || settings?.rpcProvider === 'custom'
      ? settings.rpcProvider
      : 'helius',
    quicknodeRpcUrl: normalizeText(settings?.quicknodeRpcUrl),
    customRpcUrl: normalizeText(settings?.customRpcUrl),
    swapProvider: 'jupiter',
    preferredWallet: settings?.preferredWallet === 'wallet-standard' ? 'wallet-standard' : 'phantom',
    executionMode: settings?.executionMode === 'jito' ? 'jito' : 'rpc',
    jitoBlockEngineUrl: normalizeText(settings?.jitoBlockEngineUrl) || DEFAULT_WALLET_INFRASTRUCTURE_SETTINGS.jitoBlockEngineUrl,
  }

  if (next.rpcProvider === 'quicknode') {
    if (!next.quicknodeRpcUrl) throw new Error('QuickNode RPC URL is required when using QuickNode')
    validateOptionalHttpUrl(next.quicknodeRpcUrl, 'QuickNode RPC URL')
    next.customRpcUrl = ''
  } else if (next.rpcProvider === 'custom') {
    if (!next.customRpcUrl) throw new Error('Custom RPC URL is required when using a custom RPC provider')
    validateOptionalHttpUrl(next.customRpcUrl, 'Custom RPC URL')
    next.quicknodeRpcUrl = ''
  } else {
    next.quicknodeRpcUrl = ''
    next.customRpcUrl = ''
  }

  if (next.executionMode === 'jito') {
    validateOptionalHttpUrl(next.jitoBlockEngineUrl, 'Jito block engine URL')
  }

  setJsonSetting('wallet_infrastructure_settings', next)
}

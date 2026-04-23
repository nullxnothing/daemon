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

export interface PrintrLaunchpadSettings {
  apiBaseUrl: string
  apiKey: string
  quotePath: string
  createPath: string
  chain: string
}

export interface TokenLaunchSettings {
  raydium: RaydiumLaunchpadSettings
  meteora: MeteoraLaunchpadSettings
  printr: PrintrLaunchpadSettings
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

export function getWorkspaceProfile(): WorkspaceProfile | null {
  return getJsonSetting<WorkspaceProfile | null>('workspace_profile', null)
}

export function setWorkspaceProfile(profile: WorkspaceProfile): void {
  setJsonSetting('workspace_profile', profile)
}

const DEFAULT_PINNED_TOOLS = ['git', 'browser', 'token-launch', 'solana-toolbox']

export function getPinnedTools(): string[] {
  return getJsonSetting<string[]>('pinned_tools', DEFAULT_PINNED_TOOLS)
}

export function setPinnedTools(tools: string[]): void {
  setJsonSetting('pinned_tools', tools)
}

export function getDrawerToolOrder(): string[] {
  return getJsonSetting<string[]>('drawer_tool_order', [])
}

export function setDrawerToolOrder(order: string[]): void {
  setJsonSetting('drawer_tool_order', order)
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
  printr: {
    apiBaseUrl: '',
    apiKey: '',
    quotePath: '',
    createPath: '',
    chain: '',
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
    printr: {
      apiBaseUrl: normalizeText(value?.printr?.apiBaseUrl),
      apiKey: normalizeText(value?.printr?.apiKey),
      quotePath: normalizeText(value?.printr?.quotePath),
      createPath: normalizeText(value?.printr?.createPath),
      chain: normalizeText(value?.printr?.chain),
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
    printr: {
      apiBaseUrl: normalizeText(settings?.printr?.apiBaseUrl),
      apiKey: normalizeText(settings?.printr?.apiKey),
      quotePath: normalizeText(settings?.printr?.quotePath),
      createPath: normalizeText(settings?.printr?.createPath),
      chain: normalizeText(settings?.printr?.chain),
    },
  }

  validateOptionalPublicKey(next.raydium.configId, 'Raydium config ID')
  validateOptionalPublicKey(next.raydium.quoteMint, 'Raydium quote mint')
  validateOptionalPublicKey(next.meteora.configId, 'Meteora config ID')
  validateOptionalPublicKey(next.meteora.quoteMint, 'Meteora quote mint')
  validateOptionalPositiveInteger(next.meteora.baseSupply, 'Meteora base supply')
  validateOptionalHttpUrl(next.printr.apiBaseUrl, 'Printr API base URL')
  if (next.printr.quotePath && !next.printr.quotePath.startsWith('/')) {
    throw new Error('Printr quote path must start with "/"')
  }
  if (next.printr.createPath && !next.printr.createPath.startsWith('/')) {
    throw new Error('Printr create path must start with "/"')
  }

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

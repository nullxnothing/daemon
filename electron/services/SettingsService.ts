import { getDb } from '../db/db'
import type { OnboardingProgress, WorkspaceProfile } from '../shared/types'

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

const DEFAULT_PINNED_TOOLS = ['git', 'browser', 'solana-toolbox']

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

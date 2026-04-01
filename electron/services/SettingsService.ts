import { getDb } from '../db/db'

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

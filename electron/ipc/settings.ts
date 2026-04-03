import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import * as Settings from '../services/SettingsService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { getDb } from '../db/db'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get-ui', ipcHandler(async () => {
    return Settings.getUiSettings()
  }))

  ipcMain.handle('settings:set-show-market-tape', ipcHandler(async (_event, enabled: boolean) => {
    Settings.setBooleanSetting('show_market_tape', enabled)
  }))

  ipcMain.handle('settings:set-show-titlebar-wallet', ipcHandler(async (_event, enabled: boolean) => {
    Settings.setBooleanSetting('show_titlebar_wallet', enabled)
  }))

  ipcMain.handle('settings:is-onboarding-complete', ipcHandler(async () => {
    return Settings.isOnboardingComplete()
  }))

  ipcMain.handle('settings:set-onboarding-complete', ipcHandler(async (_event, complete: boolean) => {
    Settings.setOnboardingComplete(complete)
  }))

  ipcMain.handle('settings:get-onboarding-progress', ipcHandler(async () => {
    return Settings.getOnboardingProgress()
  }))

  ipcMain.handle('settings:set-onboarding-progress', ipcHandler(async (_event, progress: import('../shared/types').OnboardingProgress) => {
    const VALID_STATUSES = ['pending', 'complete', 'skipped']
    const REQUIRED_KEYS = ['profile', 'claude', 'gmail', 'vercel', 'railway', 'tour']
    if (!progress || typeof progress !== 'object') throw new Error('Invalid progress object')
    for (const key of REQUIRED_KEYS) {
      if (!VALID_STATUSES.includes((progress as unknown as Record<string, string>)[key])) {
        throw new Error(`Invalid status for ${key}`)
      }
    }
    Settings.setOnboardingProgress(progress)
  }))

  ipcMain.handle('settings:report-crash', ipcHandler(async (_event, data: { type: string; message: string; stack: string }) => {
    const FIELD_MAX = 10 * 1024
    const safeType = String(data.type ?? '').slice(0, FIELD_MAX)
    const safeMessage = String(data.message ?? '').slice(0, FIELD_MAX)
    const safeStack = String(data.stack ?? '').slice(0, FIELD_MAX)
    const db = getDb()
    db.prepare('INSERT INTO app_crashes (id, type, message, stack, created_at) VALUES (?,?,?,?,?)').run(
      crypto.randomUUID(), safeType, safeMessage, safeStack, Date.now()
    )
  }))

  ipcMain.handle('settings:get-crashes', ipcHandler(async () => {
    const db = getDb()
    return db.prepare('SELECT * FROM app_crashes ORDER BY created_at DESC LIMIT 50').all()
  }))

  ipcMain.handle('settings:clear-crashes', ipcHandler(async () => {
    const db = getDb()
    db.prepare('DELETE FROM app_crashes').run()
  }))

  ipcMain.handle('settings:get-workspace-profile', ipcHandler(async () => {
    return Settings.getWorkspaceProfile()
  }))

  ipcMain.handle('settings:set-workspace-profile', ipcHandler(async (_event, profile: import('../shared/types').WorkspaceProfile) => {
    const VALID_NAMES = ['web', 'solana', 'custom']
    if (!profile || typeof profile !== 'object') throw new Error('Invalid profile object')
    if (!VALID_NAMES.includes(profile.name)) throw new Error('Invalid profile name')
    if (!profile.toolVisibility || typeof profile.toolVisibility !== 'object') throw new Error('Invalid toolVisibility')
    Settings.setWorkspaceProfile(profile)
  }))
}

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

  ipcMain.handle('settings:report-crash', ipcHandler(async (_event, data: { type: string; message: string; stack: string }) => {
    const db = getDb()
    db.prepare('INSERT INTO app_crashes (id, type, message, stack, created_at) VALUES (?,?,?,?,?)').run(
      crypto.randomUUID(), data.type, data.message, data.stack ?? '', Date.now()
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
}

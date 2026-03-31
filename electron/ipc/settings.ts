import { ipcMain } from 'electron'
import * as Settings from '../services/SettingsService'

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get-ui', async () => {
    try {
      return { ok: true, data: Settings.getUiSettings() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('settings:set-show-market-tape', async (_event, enabled: boolean) => {
    try {
      Settings.setBooleanSetting('show_market_tape', enabled)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('settings:set-show-titlebar-wallet', async (_event, enabled: boolean) => {
    try {
      Settings.setBooleanSetting('show_titlebar_wallet', enabled)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

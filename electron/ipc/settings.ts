import { ipcMain } from 'electron'
import * as Settings from '../services/SettingsService'
import { ipcHandler } from '../services/IpcHandlerFactory'

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
}

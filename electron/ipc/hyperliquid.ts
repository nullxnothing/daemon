import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Hl from '../services/HyperliquidCliService'
import * as SettingsService from '../services/SettingsService'

export function registerHyperliquidHandlers() {
  // Availability + version + selected network, for the settings hint/empty state.
  ipcMain.handle('hyperliquid:status', ipcHandler(async () => {
    Hl.resetCache()
    const available = await Hl.isAvailable()
    return {
      available,
      version: available ? await Hl.version() : null,
      network: SettingsService.getHyperliquidSettings().network,
    }
  }))

  ipcMain.handle('hyperliquid:set-network', ipcHandler(async (_event, network: SettingsService.HyperliquidNetwork) => {
    return SettingsService.setHyperliquidSettings({ network })
  }))
}

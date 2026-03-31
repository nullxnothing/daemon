import { ipcMain } from 'electron'
import * as Plugins from '../services/PluginService'

export function registerPluginHandlers() {
  ipcMain.handle('plugins:list', async () => {
    try {
      return { ok: true, data: Plugins.listPlugins() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:set-enabled', async (_event, id: string, enabled: boolean) => {
    try {
      Plugins.setPluginEnabled(id, enabled)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:set-config', async (_event, id: string, config: string) => {
    try {
      Plugins.setPluginConfig(id, config)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('plugins:reorder', async (_event, orderedIds: string[]) => {
    try {
      Plugins.reorderPlugins(orderedIds)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

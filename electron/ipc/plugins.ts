import { ipcMain } from 'electron'
import * as Plugins from '../services/PluginService'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerPluginHandlers() {
  ipcMain.handle('plugins:list', ipcHandler(async () => {
    return Plugins.listPlugins()
  }))

  ipcMain.handle('plugins:add', ipcHandler(async (_event, input) => {
    return Plugins.addPlugin(input)
  }))

  ipcMain.handle('plugins:set-enabled', ipcHandler(async (_event, id: string, enabled: boolean) => {
    Plugins.setPluginEnabled(id, enabled)
  }))

  ipcMain.handle('plugins:set-config', ipcHandler(async (_event, id: string, config: string) => {
    Plugins.setPluginConfig(id, config)
  }))

  ipcMain.handle('plugins:reorder', ipcHandler(async (_event, orderedIds: string[]) => {
    Plugins.reorderPlugins(orderedIds)
  }))
}

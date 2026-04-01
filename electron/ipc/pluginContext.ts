import { ipcMain } from 'electron'
import {
  getPluginContext,
  updatePluginContext,
  toggleSkill,
  resetPluginContext,
  listPluginContexts,
} from '../services/PluginContextRegistry'
import type { PluginContextConfig } from '../services/PluginContextRegistry'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerPluginContextHandlers() {
  ipcMain.handle('plugin-context:get', ipcHandler(async (_event, pluginId: string) => {
    return getPluginContext(pluginId)
  }))

  ipcMain.handle('plugin-context:update', ipcHandler(async (_event, pluginId: string, updates: Partial<PluginContextConfig>) => {
    updatePluginContext(pluginId, updates)
  }))

  ipcMain.handle('plugin-context:toggle-skill', ipcHandler(async (_event, pluginId: string, skillId: string, enabled: boolean) => {
    toggleSkill(pluginId, skillId, enabled)
  }))

  ipcMain.handle('plugin-context:reset', ipcHandler(async (_event, pluginId: string) => {
    resetPluginContext(pluginId)
  }))

  ipcMain.handle('plugin-context:list', ipcHandler(async () => {
    return listPluginContexts()
  }))
}

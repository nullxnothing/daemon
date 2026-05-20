import { ipcMain } from 'electron'
import { ProviderRegistry } from '../services/providers'
import type { ProviderFeatureId, ProviderId, ProviderPreferences } from '../services/providers'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerProviderHandlers() {
  ipcMain.handle('provider:verify-all', ipcHandler(async () => {
    return await ProviderRegistry.verifyAll()
  }))

  ipcMain.handle('provider:get-all-connections', ipcHandler(async () => {
    return ProviderRegistry.getAllConnections()
  }))

  ipcMain.handle('provider:get-default', ipcHandler(async () => {
    const provider = ProviderRegistry.getDefault()
    return provider.id
  }))

  ipcMain.handle('provider:set-default', ipcHandler(async (_event, id: string) => {
    if (id !== 'claude' && id !== 'codex') throw new Error(`Invalid provider: ${id}`)
    ProviderRegistry.setDefault(id as ProviderId)
    return { defaultProvider: id }
  }))

  ipcMain.handle('provider:get-preferences', ipcHandler(async () => {
    return ProviderRegistry.getPreferences()
  }))

  ipcMain.handle('provider:set-preferences', ipcHandler(async (_event, preferences: Partial<ProviderPreferences>) => {
    return ProviderRegistry.setPreferences(preferences)
  }))

  ipcMain.handle('provider:resolve-feature-provider', ipcHandler(async (_event, featureId: ProviderFeatureId) => {
    if (!ProviderRegistry.isProviderFeatureId(featureId)) {
      throw new Error(`Invalid provider feature: ${featureId}`)
    }
    return ProviderRegistry.getFeatureProviderId(featureId)
  }))
}

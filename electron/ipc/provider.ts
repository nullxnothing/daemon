import { ipcMain } from 'electron'
import { ProviderRegistry } from '../services/providers'
import type { ProviderId } from '../services/providers'
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
}

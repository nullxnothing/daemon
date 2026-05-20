import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { createCoreAgentAsset, type MetaplexCreateCoreAgentAssetInput } from '../services/MetaplexOperatorService'

export function registerMetaplexHandlers() {
  ipcMain.handle('metaplex:create-core-agent-asset', ipcHandler(async (_event, input: MetaplexCreateCoreAgentAssetInput) => {
    return await createCoreAgentAsset(input)
  }))
}

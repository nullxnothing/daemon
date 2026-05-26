import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import {
  createCoreAgentAsset,
  mintRegisteredAgent,
  readAgentIdentity,
  registerAgentIdentity,
  type MetaplexCreateCoreAgentAssetInput,
  type MetaplexMintRegisteredAgentInput,
  type MetaplexReadAgentIdentityInput,
  type MetaplexRegisterAgentIdentityInput,
} from '../services/MetaplexOperatorService'

export function registerMetaplexHandlers() {
  ipcMain.handle('metaplex:create-core-agent-asset', ipcHandler(async (_event, input: MetaplexCreateCoreAgentAssetInput) => {
    return await createCoreAgentAsset(input)
  }))

  ipcMain.handle('metaplex:mint-registered-agent', ipcHandler(async (_event, input: MetaplexMintRegisteredAgentInput) => {
    return await mintRegisteredAgent(input)
  }))

  ipcMain.handle('metaplex:register-agent-identity', ipcHandler(async (_event, input: MetaplexRegisterAgentIdentityInput) => {
    return await registerAgentIdentity(input)
  }))

  ipcMain.handle('metaplex:read-agent-identity', ipcHandler(async (_event, input: MetaplexReadAgentIdentityInput) => {
    return await readAgentIdentity(input)
  }))
}

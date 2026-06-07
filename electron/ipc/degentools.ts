import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as DegenTools from '../services/DegenToolsService'

export function registerDegenToolsHandlers() {
  ipcMain.handle('degentools:is-configured', ipcHandler(async () => {
    return DegenTools.isConfigured()
  }))

  ipcMain.handle('degentools:store-key', ipcHandler(async (_event, key: string) => {
    DegenTools.storeApiKey(key)
    return { ok: true }
  }))

  ipcMain.handle('degentools:clear-key', ipcHandler(async () => {
    DegenTools.clearApiKey()
    return { ok: true }
  }))

  ipcMain.handle('degentools:initialize', ipcHandler(async () => {
    return DegenTools.initialize()
  }))

  ipcMain.handle('degentools:tools', ipcHandler(async () => {
    return DegenTools.listTools()
  }))

  ipcMain.handle('degentools:call-tool', ipcHandler(async (_event, name: string, args: object) => {
    return DegenTools.callTool(name, args)
  }))

  ipcMain.handle('degentools:generate-meme', ipcHandler(async (_event, input: DegenTools.GenerateMemeInput) => {
    return DegenTools.generateMeme(input)
  }))

  ipcMain.handle('degentools:generate-shill-copy', ipcHandler(async (_event, input: DegenTools.GenerateShillCopyInput) => {
    return DegenTools.generateShillCopy(input)
  }))

  ipcMain.handle('degentools:get-token-data', ipcHandler(async (_event, input: DegenTools.GetTokenDataInput) => {
    return DegenTools.getTokenData(input)
  }))

  ipcMain.handle('degentools:launch-token', ipcHandler(async (_event, input: DegenTools.LaunchTokenInput) => {
    return DegenTools.launchToken(input)
  }))
}

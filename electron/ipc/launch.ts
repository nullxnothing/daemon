import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as TokenLaunch from '../services/TokenLaunchService'
import * as PrintrPulse from '../services/PrintrPulseService'

export function registerLaunchHandlers() {
  ipcMain.handle('launch:list-launchpads', ipcHandler(async () => {
    return TokenLaunch.listLaunchpads()
  }))

  ipcMain.handle('launch:list-wallet-options', ipcHandler(async (_event, projectId?: string | null) => {
    return TokenLaunch.listLaunchWallets(projectId)
  }))

  ipcMain.handle('launch:pick-image', ipcHandler(async () => {
    return TokenLaunch.pickImage()
  }))

  ipcMain.handle('launch:preflight-token', ipcHandler(async (_event, input: TokenLaunch.TokenLaunchInput) => {
    return TokenLaunch.preflightLaunch(input)
  }))

  ipcMain.handle('launch:create-token', ipcHandler(async (_event, input: TokenLaunch.TokenLaunchInput) => {
    return TokenLaunch.createLaunch(input)
  }))

  ipcMain.handle('launch:save-token', ipcHandler(async (_event, input: TokenLaunch.SaveTokenInput) => {
    const launch = TokenLaunch.saveToken(input)
    return { id: launch.id }
  }))

  ipcMain.handle('launch:list-tokens', ipcHandler(async (_event, walletId?: string) => {
    return TokenLaunch.listTokens(walletId)
  }))

  ipcMain.handle('launch:get-token', ipcHandler(async (_event, idOrMint: string) => {
    return TokenLaunch.getLaunch(idOrMint)
  }))

  ipcMain.handle('launch:list-pulse-tokens', ipcHandler(async (_event, input?: {
    category?: PrintrPulse.PulseCategory
    pageNumber?: number
    pageSize?: number
  }) => {
    return PrintrPulse.listPulseTokens(input?.category ?? 'graduated', {
      pageNumber: input?.pageNumber,
      pageSize: input?.pageSize,
    })
  }))
}

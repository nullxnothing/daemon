import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as TokenDashboardService from '../services/TokenDashboardService'

export function registerDashboardHandlers() {
  ipcMain.handle('dashboard:token-price', ipcHandler(async (_event, mint: string) => {
    if (!mint || typeof mint !== 'string') throw new Error('mint is required')
    return await TokenDashboardService.getTokenPrice(mint)
  }))

  ipcMain.handle('dashboard:token-metadata', ipcHandler(async (_event, mint: string) => {
    if (!mint || typeof mint !== 'string') throw new Error('mint is required')
    return await TokenDashboardService.getTokenMetadata(mint)
  }))

  ipcMain.handle('dashboard:token-holders', ipcHandler(async (_event, mint: string) => {
    if (!mint || typeof mint !== 'string') throw new Error('mint is required')
    return await TokenDashboardService.getTokenHolders(mint)
  }))
}

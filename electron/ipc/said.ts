import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as SaidProtocolService from '../services/SaidProtocolService'

export function registerSaidHandlers() {
  ipcMain.handle('said:get-identity', ipcHandler(async (_event, wallet: string) => {
    if (typeof wallet !== 'string' || !wallet) throw new Error('Invalid wallet address')
    return SaidProtocolService.getIdentity(wallet.trim())
  }))

  ipcMain.handle('said:get-trust', ipcHandler(async (_event, wallet: string) => {
    if (typeof wallet !== 'string' || !wallet) throw new Error('Invalid wallet address')
    return SaidProtocolService.getTrustScore(wallet.trim())
  }))
}

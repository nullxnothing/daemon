import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as AllowanceService from '../services/AllowanceService'

export function registerAllowanceHandlers() {
  ipcMain.handle('allowances:get-state', ipcHandler(async (_event, wallet: string, mint: string) => {
    if (typeof wallet !== 'string' || !wallet) throw new Error('Invalid wallet address')
    if (typeof mint !== 'string' || !mint) throw new Error('Invalid mint address')
    return AllowanceService.getAllowanceState(wallet.trim(), mint.trim())
  }))

  ipcMain.handle('allowances:get-subscription', ipcHandler(async (_event, wallet: string, mint: string) => {
    if (typeof wallet !== 'string' || !wallet) throw new Error('Invalid wallet address')
    if (typeof mint !== 'string' || !mint) throw new Error('Invalid mint address')
    return AllowanceService.getSubscriptionEnrollment(wallet.trim(), mint.trim())
  }))
}

import { ipcMain } from 'electron'
import * as JuiceService from '../services/JuiceService'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerJuiceHandlers() {
  ipcMain.handle('juice:store-key', ipcHandler(async (_event, value: string) => {
    await JuiceService.storeJuiceKey(value)
  }))

  ipcMain.handle('juice:has-key', ipcHandler(async () => {
    return JuiceService.hasJuiceKey()
  }))

  ipcMain.handle('juice:delete-key', ipcHandler(async () => {
    JuiceService.deleteJuiceKey()
  }))

  ipcMain.handle('juice:list-wallets', ipcHandler(async () => {
    return await JuiceService.listWallets()
  }))

  ipcMain.handle('juice:get-balances', ipcHandler(async (_event, walletId: string) => {
    return await JuiceService.getBalances(walletId)
  }))

  ipcMain.handle('juice:get-pnl', ipcHandler(async (_event, walletId: string) => {
    return await JuiceService.getPnl(walletId)
  }))

  ipcMain.handle('juice:get-mint-details', ipcHandler(async (_event, mint: string) => {
    return await JuiceService.getMintDetails(mint)
  }))

  ipcMain.handle('juice:get-scouting-report', ipcHandler(async () => {
    return await JuiceService.getScoutingReport()
  }))
}

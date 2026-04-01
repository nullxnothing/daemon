import { ipcMain } from 'electron'
import * as WalletService from '../services/WalletService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { WalletCreateInput } from '../shared/types'

export function registerWalletHandlers() {
  ipcMain.handle('wallet:dashboard', ipcHandler(async (_event, projectId?: string | null) => {
    return await WalletService.getDashboard(projectId)
  }))

  ipcMain.handle('wallet:list', ipcHandler(async () => {
    return WalletService.listWallets()
  }))

  ipcMain.handle('wallet:create', ipcHandler(async (_event, wallet: WalletCreateInput) => {
    return WalletService.createWallet(wallet.name, wallet.address)
  }))

  ipcMain.handle('wallet:delete', ipcHandler(async (_event, id: string) => {
    WalletService.deleteWallet(id)
  }))

  ipcMain.handle('wallet:set-default', ipcHandler(async (_event, id: string) => {
    WalletService.setDefaultWallet(id)
  }))

  ipcMain.handle('wallet:assign-project', ipcHandler(async (_event, projectId: string, walletId: string | null) => {
    WalletService.assignWalletToProject(projectId, walletId)
  }))

  ipcMain.handle('wallet:store-helius-key', ipcHandler(async (_event, value: string) => {
    WalletService.storeHeliusKey(value)
  }))

  ipcMain.handle('wallet:delete-helius-key', ipcHandler(async () => {
    WalletService.deleteHeliusKey()
  }))

  ipcMain.handle('wallet:has-helius-key', ipcHandler(async () => {
    return WalletService.hasHeliusKey()
  }))
}

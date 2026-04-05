import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as PnlService from '../services/PnlService'

export function registerPnlHandlers() {
  ipcMain.handle('pnl:sync-history', ipcHandler(async (_event, walletAddress?: string) => {
    if (walletAddress) {
      return PnlService.syncSingleWallet(walletAddress)
    }
    return PnlService.syncAllWallets()
  }))

  ipcMain.handle('pnl:get-portfolio', ipcHandler(async (_event, walletAddress: string, holdings: Array<{ mint: string; symbol: string; name: string; amount: number; logoUri: string | null }>) => {
    return PnlService.getPortfolio(walletAddress, holdings)
  }))

  ipcMain.handle('pnl:get-token-detail', ipcHandler(async (_event, walletAddress: string, mint: string) => {
    return PnlService.getTokenDetail(walletAddress, mint)
  }))

  ipcMain.handle('pnl:refresh-prices', ipcHandler(async (_event, mints: string[]) => {
    await PnlService.refreshPrices(mints)
    return { refreshed: mints.length }
  }))
}

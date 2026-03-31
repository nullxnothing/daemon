import { ipcMain } from 'electron'
import * as WalletService from '../services/WalletService'
import type { WalletCreateInput } from '../shared/types'

export function registerWalletHandlers() {
  ipcMain.handle('wallet:dashboard', async (_event, projectId?: string | null) => {
    try {
      return { ok: true, data: await WalletService.getDashboard(projectId) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wallet:list', async () => {
    try {
      return { ok: true, data: WalletService.listWallets() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wallet:create', async (_event, wallet: WalletCreateInput) => {
    try {
      return { ok: true, data: WalletService.createWallet(wallet.name, wallet.address) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wallet:delete', async (_event, id: string) => {
    try {
      WalletService.deleteWallet(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wallet:set-default', async (_event, id: string) => {
    try {
      WalletService.setDefaultWallet(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wallet:assign-project', async (_event, projectId: string, walletId: string | null) => {
    try {
      WalletService.assignWalletToProject(projectId, walletId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wallet:store-helius-key', async (_event, value: string) => {
    try {
      WalletService.storeHeliusKey(value)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wallet:delete-helius-key', async () => {
    try {
      WalletService.deleteHeliusKey()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('wallet:has-helius-key', async () => {
    try {
      return { ok: true, data: WalletService.hasHeliusKey() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

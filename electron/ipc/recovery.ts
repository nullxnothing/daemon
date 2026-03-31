import { ipcMain, BrowserWindow } from 'electron'
import * as RecoveryService from '../services/RecoveryService'

export function registerRecoveryHandlers() {
  ipcMain.handle('recovery:import-csv', async () => {
    try {
      const result = await RecoveryService.importCsv()
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('recovery:scan', async () => {
    try {
      const win = BrowserWindow.getAllWindows()[0] ?? null
      const data = await RecoveryService.scanWallets(win)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('recovery:execute', async (_event, masterAddress: string) => {
    try {
      const win = BrowserWindow.getAllWindows()[0] ?? null
      const result = await RecoveryService.executeRecovery(masterAddress, win)
      return { ok: true, data: result }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('recovery:status', async () => {
    try {
      return { ok: true, data: RecoveryService.getStatus() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('recovery:stop', async () => {
    try {
      RecoveryService.stopRecovery()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

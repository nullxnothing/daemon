import { ipcMain, BrowserWindow } from 'electron'
import * as RecoveryService from '../services/RecoveryService'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerRecoveryHandlers() {
  ipcMain.handle('recovery:import-csv', ipcHandler(async () => {
    return await RecoveryService.importCsv()
  }))

  ipcMain.handle('recovery:scan', ipcHandler(async () => {
    const win = BrowserWindow.getAllWindows()[0] ?? null
    return await RecoveryService.scanWallets(win)
  }))

  ipcMain.handle('recovery:execute', ipcHandler(async (_event, masterAddress: string) => {
    const win = BrowserWindow.getAllWindows()[0] ?? null
    return await RecoveryService.executeRecovery(masterAddress, win)
  }))

  ipcMain.handle('recovery:status', ipcHandler(async () => {
    return RecoveryService.getStatus()
  }))

  ipcMain.handle('recovery:stop', ipcHandler(async () => {
    RecoveryService.stopRecovery()
  }))
}

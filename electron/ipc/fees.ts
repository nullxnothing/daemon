import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as FeeService from '../services/FeeService'
import type { ExecutionFeeSettings } from '../services/FeeService'

export function registerFeeHandlers() {
  ipcMain.handle('fees:get-settings', ipcHandler(async () => {
    return FeeService.getFeeSettings()
  }))

  ipcMain.handle('fees:set-settings', ipcHandler(async (_event, next: Partial<ExecutionFeeSettings>) => {
    return FeeService.setFeeSettings(next)
  }))

  ipcMain.handle('fees:quote', ipcHandler(async (_event, notionalLamports: number) => {
    return FeeService.quoteExecutionFee(Number(notionalLamports))
  }))

  // Aggregates only — raw fee_events rows never cross the IPC boundary.
  ipcMain.handle('fees:summary', ipcHandler(async (_event, sinceMs: number) => {
    return FeeService.summarizeFeeLedger(Number(sinceMs) || 0)
  }))
}

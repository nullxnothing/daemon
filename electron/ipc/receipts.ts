import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as ReceiptService from '../services/receipts/ReceiptService'
import type { ReceiptsSettings } from '../services/receipts/ReceiptService'

export function registerReceiptHandlers() {
  ipcMain.handle('receipts:get-settings', ipcHandler(async () => {
    return ReceiptService.getReceiptsSettings()
  }))

  ipcMain.handle('receipts:set-settings', ipcHandler(async (_event, next: Partial<ReceiptsSettings>) => {
    if (!next || typeof next !== 'object') throw new Error('Invalid receipts settings')
    return ReceiptService.setReceiptsSettings(next)
  }))

  // Aggregates only — raw receipt rows summarized to a count + latest timestamp.
  ipcMain.handle('receipts:summary', ipcHandler(async () => {
    return ReceiptService.summarizeReceipts()
  }))

  // Hash + signature ledger rows for the local "receipts emitted" view.
  ipcMain.handle('receipts:list', ipcHandler(async (_event, limit?: number) => {
    return ReceiptService.listReceipts(Number(limit) || 50)
  }))
}

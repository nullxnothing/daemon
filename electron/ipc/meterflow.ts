import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Meterflow from '../services/MeterflowService'
import type { MeterflowPaidAgentReadinessInput, MeterflowReceiptsQuery } from '../shared/types'

function receiptQuery(input: unknown): MeterflowReceiptsQuery {
  if (typeof input === 'number') return { limit: input }
  if (!input || typeof input !== 'object') return {}
  const record = input as Record<string, unknown>
  return {
    meterId: typeof record.meterId === 'string' ? record.meterId : undefined,
    status: typeof record.status === 'string' ? record.status : undefined,
    limit: typeof record.limit === 'number' ? record.limit : undefined,
  }
}

export function registerMeterflowHandlers() {
  ipcMain.handle('meterflow:status', ipcHandler(async () => {
    return Meterflow.getStatus()
  }))

  ipcMain.handle('meterflow:store-api-key', ipcHandler(async (_event, apiKey: string) => {
    return Meterflow.storeApiKey(apiKey)
  }))

  ipcMain.handle('meterflow:delete-api-key', ipcHandler(async () => {
    return Meterflow.deleteApiKey()
  }))

  ipcMain.handle('meterflow:overview', ipcHandler(async () => {
    return Meterflow.getOverview()
  }))

  ipcMain.handle('meterflow:list-receipts', ipcHandler(async (_event, input?: unknown) => {
    return Meterflow.listReceipts(receiptQuery(input))
  }))

  ipcMain.handle('meterflow:get-receipt', ipcHandler(async (_event, receiptId: string) => {
    return Meterflow.getReceipt(receiptId)
  }))

  ipcMain.handle('meterflow:ingest-receipt', ipcHandler(async (_event, receipt: object) => {
    return Meterflow.ingestReceipt(receipt)
  }))

  ipcMain.handle('meterflow:create-demo-wallet', ipcHandler(async () => {
    return Meterflow.createDemoWallet()
  }))

  ipcMain.handle('meterflow:get-demo-wallet', ipcHandler(async () => {
    return Meterflow.getDemoWallet()
  }))

  ipcMain.handle('meterflow:check-demo-wallet-readiness', ipcHandler(async () => {
    return Meterflow.checkDemoWalletReadiness()
  }))

  ipcMain.handle('meterflow:call-paid-agent-readiness', ipcHandler(async (_event, input?: object) => {
    return Meterflow.callPaidAgentReadiness((input ?? {}) as MeterflowPaidAgentReadinessInput)
  }))

  ipcMain.handle('meterflow:watch-project', ipcHandler(async (_event, projectPath: string) => {
    return Meterflow.watchProjectReceipts(projectPath)
  }))

  ipcMain.handle('meterflow:get-receipt-graph', ipcHandler(async (_event, receiptId: string) => {
    return Meterflow.getReceiptGraph(receiptId)
  }))

  ipcMain.handle('meterflow:list-meters', ipcHandler(async () => {
    return Meterflow.listMeters()
  }))

  ipcMain.handle('meterflow:test-meter', ipcHandler(async (_event, meterId: string) => {
    return Meterflow.testMeter(meterId)
  }))

  ipcMain.handle('meterflow:list-budgets', ipcHandler(async () => {
    return Meterflow.listBudgets()
  }))

  ipcMain.handle('meterflow:list-agent-sessions', ipcHandler(async () => {
    return Meterflow.listAgentSessions()
  }))

  ipcMain.handle('meterflow:list-webhooks', ipcHandler(async () => {
    return Meterflow.listWebhooks()
  }))

  ipcMain.handle('meterflow:provider-revenue', ipcHandler(async () => {
    return Meterflow.providerRevenue()
  }))

  ipcMain.handle('meterflow:registry-summary', ipcHandler(async () => {
    return Meterflow.registrySummary()
  }))

  ipcMain.handle('meterflow:export-receipts-csv', ipcHandler(async () => {
    return Meterflow.exportReceiptsCsv()
  }))
}

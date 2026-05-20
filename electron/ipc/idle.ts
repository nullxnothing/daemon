import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as IdlePaidCallService from '../services/IdlePaidCallService'
import type { IdlePaidCallInput, IdlePolicyCheckInput, IdleRegistryRefreshInput } from '../shared/types'

export function registerIdleHandlers() {
  ipcMain.handle('idle:status', ipcHandler(async (_event, registryUrl?: string | null) => {
    return IdlePaidCallService.getStatus(registryUrl ?? null)
  }))

  ipcMain.handle('idle:refresh-registry', ipcHandler(async (_event, input?: IdleRegistryRefreshInput) => {
    return IdlePaidCallService.refreshRegistry(input ?? {})
  }))

  ipcMain.handle('idle:list-resources', ipcHandler(async (_event, limit?: number) => {
    return IdlePaidCallService.listResources(limit)
  }))

  ipcMain.handle('idle:check-policy', ipcHandler(async (_event, input: IdlePolicyCheckInput) => {
    return IdlePaidCallService.checkPolicy(input)
  }))

  ipcMain.handle('idle:execute-paid-call', ipcHandler(async (_event, input: IdlePaidCallInput) => {
    return IdlePaidCallService.executePaidCall(input)
  }))

  ipcMain.handle('idle:list-receipts', ipcHandler(async (_event, limit?: number) => {
    return IdlePaidCallService.listReceipts(limit)
  }))
}

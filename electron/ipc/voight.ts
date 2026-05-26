import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Voight from '../services/VoightService'
import type { VoightPrivacyLevel } from '../shared/types'

export function registerVoightHandlers() {
  ipcMain.handle('voight:status', ipcHandler(async () => {
    return Voight.getStatus()
  }))

  ipcMain.handle('voight:store-key', ipcHandler(async (_event, value: string) => {
    Voight.storeKey(value)
    return Voight.getStatus()
  }))

  ipcMain.handle('voight:delete-key', ipcHandler(async () => {
    Voight.deleteKey()
    return Voight.getStatus()
  }))

  ipcMain.handle('voight:test-event', ipcHandler(async () => {
    return Voight.testEvent()
  }))

  ipcMain.handle('voight:set-privacy-level', ipcHandler(async (_event, level: VoightPrivacyLevel) => {
    Voight.setPrivacyLevel(level)
    return Voight.getStatus()
  }))

  ipcMain.handle('voight:flush-queue', ipcHandler(async () => {
    return Voight.flushQueue()
  }))
}

import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as AriaService from '../services/AriaService'

export function registerAriaHandlers() {
  ipcMain.handle('aria:send', ipcHandler(async (
    _event,
    sessionId: string,
    message: string,
  ) => {
    if (!message?.trim()) throw new Error('Message cannot be empty')
    return await AriaService.sendMessage(sessionId, message.trim())
  }))

  ipcMain.handle('aria:history', ipcHandler(async (
    _event,
    sessionId: string,
    limit?: number,
  ) => {
    return AriaService.getHistory(sessionId, limit)
  }))

  ipcMain.handle('aria:clear', ipcHandler(async (
    _event,
    sessionId: string,
  ) => {
    AriaService.clearSession(sessionId)
  }))
}

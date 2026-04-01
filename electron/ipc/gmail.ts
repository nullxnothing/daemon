import { ipcMain } from 'electron'
import {
  getAuthStatus,
  authenticate,
  exchangeAuthCode,
  logout,
  listMessages,
  readMessage,
  extractCode,
  summarizeMessage,
} from '../services/GmailService'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerGmailHandlers() {
  ipcMain.handle('gmail:auth-status', ipcHandler(async () => {
    return await getAuthStatus()
  }))

  ipcMain.handle('gmail:auth', ipcHandler(async (_event, clientId: string, clientSecret: string) => {
    return await authenticate(clientId, clientSecret)
  }))

  ipcMain.handle('gmail:exchange-code', ipcHandler(async (_event, code: string) => {
    return await exchangeAuthCode(code)
  }))

  ipcMain.handle('gmail:logout', ipcHandler(async () => {
    logout()
  }))

  ipcMain.handle('gmail:list', ipcHandler(async (_event, query?: string, maxResults?: number) => {
    return await listMessages(query, maxResults)
  }))

  ipcMain.handle('gmail:read', ipcHandler(async (_event, messageId: string) => {
    return await readMessage(messageId)
  }))

  ipcMain.handle('gmail:extract', ipcHandler(async (_event, messageId: string) => {
    return await extractCode(messageId)
  }))

  ipcMain.handle('gmail:summarize', ipcHandler(async (_event, messageId: string) => {
    const summary = await summarizeMessage(messageId)
    return { summary }
  }))
}

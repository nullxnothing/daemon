import { ipcMain } from 'electron'
import {
  listAccounts,
  addGmailAccount,
  hasGmailCredentials,
  storeGmailCredentials,
  addICloudAccount,
  removeAccount,
  getMessages,
  getMessage,
  extractCode,
  summarizeMessage,
  getUnreadCounts,
  updateSettings,
} from '../services/EmailService'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerEmailHandlers() {
  ipcMain.handle('email:accounts', ipcHandler(async () => {
    return await listAccounts()
  }))

  ipcMain.handle('email:has-gmail-creds', ipcHandler(async () => {
    return hasGmailCredentials()
  }))

  ipcMain.handle('email:store-gmail-creds', ipcHandler(async (_event, clientId: string, clientSecret: string) => {
    storeGmailCredentials(clientId, clientSecret)
  }))

  ipcMain.handle('email:add-gmail', ipcHandler(async (_event, clientId?: string, clientSecret?: string) => {
    return await addGmailAccount(clientId, clientSecret)
  }))

  ipcMain.handle('email:add-icloud', ipcHandler(async (_event, email: string, appPassword: string) => {
    return await addICloudAccount(email, appPassword)
  }))

  ipcMain.handle('email:remove', ipcHandler(async (_event, accountId: string) => {
    await removeAccount(accountId)
  }))

  ipcMain.handle('email:messages', ipcHandler(async (_event, accountId: string, query?: string, max?: number) => {
    return await getMessages(accountId, query, max)
  }))

  ipcMain.handle('email:read', ipcHandler(async (_event, accountId: string, messageId: string) => {
    return await getMessage(accountId, messageId)
  }))

  ipcMain.handle('email:extract', ipcHandler(async (_event, accountId: string, messageId: string) => {
    return await extractCode(accountId, messageId)
  }))

  ipcMain.handle('email:summarize', ipcHandler(async (_event, accountId: string, messageId: string) => {
    const summary = await summarizeMessage(accountId, messageId)
    return { summary }
  }))

  ipcMain.handle('email:sync', ipcHandler(async (_event, accountId: string) => {
    // Trigger a fresh fetch (cache update can be added later)
    await getMessages(accountId, '', 50)
  }))

  ipcMain.handle('email:unread-counts', ipcHandler(async () => {
    return await getUnreadCounts()
  }))

  ipcMain.handle('email:settings', ipcHandler(async (_event, accountId: string, settings: string) => {
    await updateSettings(accountId, settings)
  }))
}

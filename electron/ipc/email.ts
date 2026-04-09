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
  sendEmail,
  markAsRead,
  markAllAsRead,
  extractCode,
  summarizeMessage,
  getUnreadCounts,
  updateSettings,
} from '../services/EmailService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { ValidationService } from '../services/ValidationService'

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

  ipcMain.handle('email:send', ipcHandler(async (_event, accountId: string, to: string, subject: string, body: string, cc?: string, bcc?: string) => {
    const accountIdResult = ValidationService.validateString(accountId, 1, 128)
    if (!accountIdResult.success) {
      throw new Error(accountIdResult.errors?.[0] ?? 'Invalid account id')
    }

    const toResult = ValidationService.validateEmailAddress(to)
    if (!toResult.success) {
      throw new Error(toResult.errors?.[0] ?? 'Invalid recipient')
    }

    const ccResult = ValidationService.validateEmailList(cc)
    if (!ccResult.success) {
      throw new Error(ccResult.errors?.[0] ?? 'Invalid cc list')
    }

    const bccResult = ValidationService.validateEmailList(bcc)
    if (!bccResult.success) {
      throw new Error(bccResult.errors?.[0] ?? 'Invalid bcc list')
    }

    const subjectResult = ValidationService.validateString(subject, 1, 998)
    if (!subjectResult.success) {
      throw new Error(subjectResult.errors?.[0] ?? 'Invalid subject')
    }

    const bodyResult = ValidationService.validateString(body, 1, 200_000)
    if (!bodyResult.success) {
      throw new Error(bodyResult.errors?.[0] ?? 'Invalid body')
    }

    const rateLimitKey = `email-send:${accountIdResult.data}`
    if (!ValidationService.checkRateLimit(rateLimitKey, 10, 60_000)) {
      throw new Error('Rate limit exceeded: try again in a minute')
    }

    return await sendEmail(accountIdResult.data!, {
      to: toResult.data!,
      subject: subjectResult.data!,
      body: bodyResult.data!,
      cc: ccResult.data,
      bcc: bccResult.data,
    })
  }))

  ipcMain.handle('email:mark-read', ipcHandler(async (_event, accountId: string, messageIds: string[]) => {
    await markAsRead(accountId, messageIds)
  }))

  ipcMain.handle('email:mark-all-read', ipcHandler(async (_event, accountId?: string) => {
    const count = await markAllAsRead(accountId)
    return { count }
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

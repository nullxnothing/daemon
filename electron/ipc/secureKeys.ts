/**
 * Secure-key IPC — OS-keychain-encrypted key storage (SecureKeyService).
 * Extracted from claude.ts so shells that need key management without the
 * Claude-CLI machinery (DAEMON Lite) can register just this surface. Channel
 * names keep their historical claude: prefix — the preload bridge and every
 * renderer call site depend on them.
 */
import { ipcMain } from 'electron'
import * as SecureKey from '../services/SecureKeyService'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerSecureKeyHandlers() {
  ipcMain.handle('claude:store-key', ipcHandler(async (_event, name: string, value: string) => {
    SecureKey.storeKey(name, value)
  }))

  ipcMain.handle('claude:list-keys', ipcHandler(async () => {
    return SecureKey.listKeys()
  }))

  ipcMain.handle('claude:delete-key', ipcHandler(async (_event, name: string) => {
    SecureKey.deleteKey(name)
  }))
}

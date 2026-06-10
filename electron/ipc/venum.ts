import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Venum from '../services/VenumService'

export function registerVenumHandlers() {
  ipcMain.handle('venum:is-configured', ipcHandler(async () => {
    return Venum.isConfigured()
  }))

  ipcMain.handle('venum:store-key', ipcHandler(async (_event, key: string) => {
    Venum.storeApiKey(key)
    return { ok: true }
  }))

  ipcMain.handle('venum:clear-key', ipcHandler(async () => {
    Venum.clearApiKey()
    return { ok: true }
  }))

  ipcMain.handle('venum:price', ipcHandler(async (_event, token: string) => {
    return Venum.getPrice(token)
  }))

  ipcMain.handle('venum:prices', ipcHandler(async (_event, tokens: string[]) => {
    return Venum.getPrices(tokens)
  }))

  ipcMain.handle('venum:quote', ipcHandler(async (_event, input: Venum.VenumQuoteInput) => {
    return Venum.getQuote(input)
  }))
}

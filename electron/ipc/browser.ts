import { ipcMain } from 'electron'
import {
  navigate,
  getPage,
  getLatestPage,
  analyzePage,
  auditPage,
  getHistory,
  clearHistory,
} from '../services/BrowserService'
import { ipcHandler } from '../services/IpcHandlerFactory'

export function registerBrowserHandlers() {
  ipcMain.handle('browser:navigate', ipcHandler(async (_event, url: string) => {
    return await navigate(url)
  }))

  ipcMain.handle('browser:content', ipcHandler(async (_event, pageId: string) => {
    const page = getPage(pageId) ?? getLatestPage()
    if (!page) throw new Error('No page loaded')
    return page
  }))

  ipcMain.handle('browser:analyze', ipcHandler(async (
    _event,
    pageId: string,
    type: 'summarize' | 'extract' | 'audit' | 'compare',
    target?: string,
  ) => {
    return await analyzePage(pageId, type, target)
  }))

  ipcMain.handle('browser:audit', ipcHandler(async (_event, pageId: string) => {
    return await auditPage(pageId)
  }))

  ipcMain.handle('browser:history', ipcHandler(async () => {
    return getHistory()
  }))

  ipcMain.handle('browser:clear', ipcHandler(async () => {
    clearHistory()
  }))
}

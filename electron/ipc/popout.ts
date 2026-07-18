/**
 * DAEMON Lite pop-out browser IPC. lite:popout-open is called from the main
 * renderer (trusted). The popout:* nav channels are called from each pop-out's
 * own chrome renderer via the minimal popout preload; they carry the window id
 * so a chrome window can only drive its own guest.
 */
import { BrowserWindow, ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { isTrustedSender } from '../security/ipcSender'
import {
  openPopout, popoutNavigate, popoutBack, popoutForward, popoutReload,
} from '../services/PopoutBrowserService'

function ownerWindowId(sender: WebContents): number | undefined {
  return BrowserWindow.fromWebContents(sender)?.id
}

export function registerPopoutHandlers() {
  ipcMain.handle('lite:popout-open', ipcHandler(async (event, url: string) => {
    if (!isTrustedSender(event)) return { opened: false }
    const result = openPopout(url)
    return { opened: result.opened }
  }))

  // Nav channels come from the chrome renderer (its own trusted origin); each
  // scopes to the sender window's id so it can only steer its own guest.
  ipcMain.handle('popout:navigate', ipcHandler(async (event, url: string) => {
    if (!isTrustedSender(event)) return false
    const windowId = ownerWindowId(event.sender)
    return windowId !== undefined ? popoutNavigate(windowId, url) : false
  }))

  ipcMain.on('popout:back', (event) => {
    if (!isTrustedSender(event)) return
    const windowId = ownerWindowId(event.sender)
    if (windowId !== undefined) popoutBack(windowId)
  })

  ipcMain.on('popout:forward', (event) => {
    if (!isTrustedSender(event)) return
    const windowId = ownerWindowId(event.sender)
    if (windowId !== undefined) popoutForward(windowId)
  })

  ipcMain.on('popout:reload', (event) => {
    if (!isTrustedSender(event)) return
    const windowId = ownerWindowId(event.sender)
    if (windowId !== undefined) popoutReload(windowId)
  })
}

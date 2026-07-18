/**
 * DAEMON Lite forensics IPC — swapped in for forensics.ts by vite.lite.config.ts.
 * Registers scan/expand/blacklist/poll only. Drops the RicoMaps embed handlers
 * (RicoMapsEmbedService spawns a Node dev-server child process — out of scope
 * for Lite, and it keeps that import off the lite main graph).
 */
import { clipboard, ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as RicoMapsService from '../services/RicoMapsService'
import type { ForensicsExpandInput, ForensicsScanInput } from '../shared/types'

export function registerForensicsHandlers() {
  ipcMain.handle('forensics:scan', ipcHandler(async (_event, input: ForensicsScanInput) => {
    return RicoMapsService.scan(input)
  }))

  ipcMain.handle('forensics:expand', ipcHandler(async (_event, input: ForensicsExpandInput) => {
    return RicoMapsService.expandNode(input)
  }))

  ipcMain.handle('forensics:blacklist', ipcHandler(async () => {
    return RicoMapsService.listBlacklist()
  }))

  ipcMain.handle('forensics:export-blacklist', ipcHandler(async () => {
    const csv = RicoMapsService.exportBlacklistCsv()
    clipboard.writeText(csv)
    return { csv, copied: true }
  }))

  ipcMain.handle('forensics:poll-holders', ipcHandler(async (_event, mint: string) => {
    return RicoMapsService.pollHolders(mint)
  }))
}

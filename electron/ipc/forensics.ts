import { clipboard, ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { getRicoMapsEmbedStatus, startRicoMapsEmbed } from '../services/RicoMapsEmbedService'
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

  ipcMain.handle('forensics:ricomaps-status', ipcHandler(async () => {
    return getRicoMapsEmbedStatus()
  }))

  ipcMain.handle('forensics:ricomaps-start', ipcHandler(async () => {
    return startRicoMapsEmbed()
  }))
}

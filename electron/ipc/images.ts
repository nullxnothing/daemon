import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as ImageService from '../services/ImageService'
import type { ImageGenerateInput, ImageFilter } from '../shared/types'

export function registerImageHandlers() {
  ipcMain.handle('images:generate', ipcHandler(async (_event, input: ImageGenerateInput) => {
    return ImageService.generateImage(input)
  }))

  ipcMain.handle('images:list', ipcHandler(async (_event, filter: ImageFilter) => {
    return ImageService.listImages(filter ?? {})
  }))

  ipcMain.handle('images:get', ipcHandler(async (_event, id: string) => {
    return ImageService.getImage(id)
  }))

  ipcMain.handle('images:delete', ipcHandler(async (_event, id: string) => {
    ImageService.deleteImage(id)
  }))

  ipcMain.handle('images:update-tags', ipcHandler(async (_event, id: string, tags: string[]) => {
    return ImageService.updateTags(id, tags)
  }))

  ipcMain.handle('images:get-base64', ipcHandler(async (_event, id: string) => {
    return ImageService.getBase64(id)
  }))

  ipcMain.handle('images:import-file', ipcHandler(async () => {
    return ImageService.importFile()
  }))

  ipcMain.handle('images:reveal', ipcHandler(async (_event, id: string) => {
    ImageService.revealImage(id)
  }))

  ipcMain.handle('images:watcher-start', ipcHandler(async () => {
    await ImageService.startWatcher()
  }))

  ipcMain.handle('images:watcher-stop', ipcHandler(async () => {
    ImageService.stopWatcher()
  }))

  ipcMain.handle('images:watcher-status', ipcHandler(async () => {
    return ImageService.isWatcherActive()
  }))

  ipcMain.handle('images:has-api-key', ipcHandler(async () => {
    return ImageService.hasApiKey()
  }))
}

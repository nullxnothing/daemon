import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Colosseum from '../services/ColosseumService'
import * as SecureKey from '../services/SecureKeyService'

export function registerColosseumHandlers() {
  ipcMain.handle('colosseum:status', ipcHandler(async () => {
    return await Colosseum.checkStatus()
  }))

  ipcMain.handle('colosseum:search-projects', ipcHandler(async (_e, query: string, limit?: number, filters?: object) => {
    if (!query?.trim()) throw new Error('Query required')
    return await Colosseum.searchProjects(query.trim(), limit, filters as Record<string, unknown>)
  }))

  ipcMain.handle('colosseum:search-archives', ipcHandler(async (_e, query: string, limit?: number) => {
    if (!query?.trim()) throw new Error('Query required')
    return await Colosseum.searchArchives(query.trim(), limit)
  }))

  ipcMain.handle('colosseum:project-detail', ipcHandler(async (_e, slug: string) => {
    if (!slug?.trim()) throw new Error('Slug required')
    return await Colosseum.getProjectBySlug(slug.trim())
  }))

  ipcMain.handle('colosseum:filters', ipcHandler(async () => {
    return await Colosseum.getFilters()
  }))

  ipcMain.handle('colosseum:store-pat', ipcHandler(async (_e, pat: string) => {
    SecureKey.storeKey('COLOSSEUM_COPILOT_PAT', pat.trim())
  }))

  ipcMain.handle('colosseum:is-configured', ipcHandler(async () => {
    return Colosseum.isConfigured()
  }))
}

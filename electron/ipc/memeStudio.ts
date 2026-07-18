import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { detectMemeTechArchetype } from '../services/meme-studio/ArchetypeDetector'
import { readMemeMarketContext, readTokenRiskPreflight } from '../services/meme-studio/MarketContextService'

export function registerMemeStudioHandlers(): void {
  ipcMain.handle('meme-studio:detect', ipcHandler(async (_event, projectPath: string) => detectMemeTechArchetype(projectPath)))
  ipcMain.handle('meme-studio:market-context', ipcHandler(async (_event, mint: string) => readMemeMarketContext(mint)))
  ipcMain.handle('meme-studio:token-preflight', ipcHandler(async (_event, mint: string) => readTokenRiskPreflight(mint)))
}

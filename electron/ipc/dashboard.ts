import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { getDb } from '../db/db'
import { randomUUID } from 'node:crypto'
import * as TokenDashboardService from '../services/TokenDashboardService'

export function registerDashboardHandlers() {
  ipcMain.handle('dashboard:token-price', ipcHandler(async (_event, mint: string) => {
    if (!mint || typeof mint !== 'string') throw new Error('mint is required')
    return await TokenDashboardService.getTokenPrice(mint)
  }))

  ipcMain.handle('dashboard:token-metadata', ipcHandler(async (_event, mint: string) => {
    if (!mint || typeof mint !== 'string') throw new Error('mint is required')
    return await TokenDashboardService.getTokenMetadata(mint)
  }))

  ipcMain.handle('dashboard:token-holders', ipcHandler(async (_event, mint: string) => {
    if (!mint || typeof mint !== 'string') throw new Error('mint is required')
    return await TokenDashboardService.getTokenHolders(mint)
  }))

  ipcMain.handle('dashboard:detect-tokens', ipcHandler(async (_event, walletAddress: string) => {
    if (!walletAddress || typeof walletAddress !== 'string') throw new Error('walletAddress is required')
    return await TokenDashboardService.detectWalletTokens(walletAddress)
  }))

  ipcMain.handle('dashboard:import-token', ipcHandler(async (_event, mint: string, walletId: string) => {
    if (!mint || typeof mint !== 'string') throw new Error('mint is required')
    if (!walletId || typeof walletId !== 'string') throw new Error('walletId is required')

    const db = getDb()

    // Idempotent: skip if already imported
    const existing = db.prepare('SELECT id FROM launched_tokens WHERE mint = ? LIMIT 1').get(mint)
    if (existing) return { id: (existing as { id: string }).id, alreadyExists: true }

    const token = await TokenDashboardService.importTokenByMint(mint)
    const id = randomUUID()

    db.prepare(`
      INSERT INTO launched_tokens
        (id, wallet_id, project_id, mint, name, symbol, image_uri, metadata_uri, launchpad, create_signature, initial_buy_sol, status)
      VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, 'imported', NULL, NULL, 'active')
    `).run(id, walletId, token.mint, token.name, token.symbol, token.image ?? null)

    return { id, alreadyExists: false }
  }))
}

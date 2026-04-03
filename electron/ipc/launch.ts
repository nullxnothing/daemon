import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { getDb } from '../db/db'
import { randomUUID } from 'node:crypto'

interface SaveTokenInput {
  walletId: string
  projectId?: string
  mint: string
  name: string
  symbol: string
  imagePath?: string
  metadataUri?: string
  launchpad?: string
  createSignature?: string
  initialBuySol?: number
}

interface LaunchedToken {
  id: string
  project_id: string | null
  wallet_id: string
  mint: string
  name: string
  symbol: string
  image_uri: string | null
  metadata_uri: string | null
  launchpad: string
  pool_address: string | null
  create_signature: string | null
  initial_buy_sol: number | null
  status: string
  created_at: number
}

export function registerLaunchHandlers() {
  ipcMain.handle('launch:save-token', ipcHandler(async (_event, input: SaveTokenInput) => {
    if (!input.walletId) throw new Error('walletId is required')
    if (!input.name) throw new Error('name is required')
    if (!input.symbol) throw new Error('symbol is required')

    const db = getDb()
    const id = randomUUID()

    db.prepare(`
      INSERT INTO launched_tokens
        (id, wallet_id, project_id, mint, name, symbol, image_uri, metadata_uri, launchpad, create_signature, initial_buy_sol)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.walletId,
      input.projectId ?? null,
      input.mint ?? '',
      input.name,
      input.symbol,
      input.imagePath ?? null,
      input.metadataUri ?? null,
      input.launchpad ?? 'pumpfun',
      input.createSignature ?? null,
      input.initialBuySol ?? null,
    )

    return { id }
  }))

  ipcMain.handle('launch:list-tokens', ipcHandler(async (_event, walletId?: string) => {
    const db = getDb()
    const rows = walletId
      ? db.prepare('SELECT * FROM launched_tokens WHERE wallet_id = ? ORDER BY created_at DESC').all(walletId)
      : db.prepare('SELECT * FROM launched_tokens ORDER BY created_at DESC').all()
    return rows as LaunchedToken[]
  }))

  ipcMain.handle('launch:get-token', ipcHandler(async (_event, idOrMint: string) => {
    const db = getDb()
    const row = db.prepare(
      'SELECT * FROM launched_tokens WHERE id = ? OR mint = ? LIMIT 1'
    ).get(idOrMint, idOrMint) as LaunchedToken | undefined
    return row ?? null
  }))
}

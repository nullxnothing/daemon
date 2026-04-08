import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Vault from '../services/VaultService'

const MAX_FILE_SIZE = 1024 * 1024 // 1 MB — vault is for keys/creds, not large files

async function confirmVaultAction(options: {
  title: string
  message: string
  detail: string
  confirmLabel: string
}): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', options.confirmLabel],
    defaultId: 0,
    cancelId: 0,
    title: options.title,
    message: options.message,
    detail: options.detail,
  })
  if (response === 0) throw new Error(`${options.title} cancelled by user`)
}

export function registerVaultHandlers() {
  ipcMain.handle('vault:list', ipcHandler(async () => {
    return Vault.listFiles()
  }))

  ipcMain.handle('vault:get', ipcHandler(async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('Invalid vault file id')
    return Vault.getFileMeta(id)
  }))

  ipcMain.handle('vault:store', ipcHandler(async (_event, opts: { name: string; data: string; fileType: string; ownerWallet?: string }) => {
    if (!opts.name || typeof opts.name !== 'string') throw new Error('File name is required')
    if (!opts.data || typeof opts.data !== 'string') throw new Error('File data is required')
    if (Buffer.byteLength(opts.data, 'utf8') > MAX_FILE_SIZE) throw new Error('File too large (max 1 MB)')
    const validTypes = ['keypair', 'env', 'credential', 'seed_phrase', 'other']
    const fileType = validTypes.includes(opts.fileType) ? opts.fileType : 'other'
    await confirmVaultAction({
      title: 'Store Vault Secret',
      message: `Store "${opts.name}" in the vault?`,
      detail: `Type: ${fileType}\nThis will persist encrypted secret material on this machine.`,
      confirmLabel: 'Store Secret',
    })
    return Vault.storeFile({ name: opts.name, data: opts.data, fileType, ownerWallet: opts.ownerWallet })
  }))

  ipcMain.handle('vault:retrieve', ipcHandler(async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('Invalid vault file id')
    const meta = Vault.getFileMeta(id)
    if (!meta) throw new Error('Vault file not found')
    await confirmVaultAction({
      title: 'Reveal Vault Secret',
      message: `Reveal "${meta.name}" from the vault?`,
      detail: `Type: ${meta.file_type}\nThis will decrypt and return the secret to the renderer.`,
      confirmLabel: 'Reveal Secret',
    })
    return Vault.retrieveFile(id)
  }))

  ipcMain.handle('vault:delete', ipcHandler(async (_event, id: string) => {
    if (!id || typeof id !== 'string') throw new Error('Invalid vault file id')
    const meta = Vault.getFileMeta(id)
    if (!meta) throw new Error('Vault file not found')
    await confirmVaultAction({
      title: 'Delete Vault Secret',
      message: `Delete "${meta.name}" from the vault?`,
      detail: 'This removes the encrypted record from local storage and cannot be undone.',
      confirmLabel: 'Delete Secret',
    })
    Vault.deleteFile(id)
  }))

  ipcMain.handle('vault:set-owner', ipcHandler(async (_event, id: string, ownerWallet: string | null) => {
    if (!id || typeof id !== 'string') throw new Error('Invalid vault file id')
    Vault.setFileOwner(id, ownerWallet)
  }))

  ipcMain.handle('vault:import-file', ipcHandler(async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import file to vault',
      properties: ['openFile'],
      filters: [
        { name: 'Key files', extensions: ['json', 'pem', 'key', 'env', 'txt'] },
        { name: 'All files', extensions: ['*'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_FILE_SIZE) throw new Error('File too large (max 1 MB)')

    const content = fs.readFileSync(filePath, 'utf8')
    const name = path.basename(filePath)

    // Auto-detect file type
    let fileType = 'other'
    const lower = name.toLowerCase()
    if (lower.endsWith('.json') && content.includes('[')) fileType = 'keypair'
    else if (lower.includes('.env')) fileType = 'env'
    else if (lower.endsWith('.pem') || lower.endsWith('.key')) fileType = 'credential'

    return { name, data: content, fileType, size: stat.size }
  }))
}

import { ipcMain, shell, clipboard } from 'electron'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { getInstalledBeardedIconsTheme } from '../services/IconThemeService'
import { isPathSafe } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { FileEntry } from '../shared/types'

const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', '.next',
  '__pycache__', '.DS_Store', 'release', '.pnpm-store',
])

function validatePath(p: string): void {
  if (!isPathSafe(p)) throw new Error('Path outside project boundaries')
}

export function registerFilesystemHandlers() {
  ipcMain.handle('fs:readDir', ipcHandler(async (_event, dirPath: string, depth = 1) => {
    validatePath(dirPath)
    const safeDepth = Math.min(depth ?? 3, 10)
    return readDirRecursive(dirPath, safeDepth)
  }))

  ipcMain.handle('fs:readFile', ipcHandler(async (_event, filePath: string) => {
    validatePath(filePath)
    const content = await fs.readFile(filePath, 'utf8')
    return { content, path: filePath }
  }))

  ipcMain.handle('fs:writeFile', ipcHandler(async (_event, filePath: string, content: string) => {
    validatePath(filePath)
    await fs.writeFile(filePath, content, 'utf8')
  }))

  ipcMain.handle('fs:createFile', ipcHandler(async (_event, filePath: string) => {
    validatePath(filePath)
    try {
      await fs.access(filePath)
      throw new Error('File already exists')
    } catch (e) {
      if ((e as Error).message === 'File already exists') throw e
    }
    await fs.writeFile(filePath, '', 'utf8')
  }))

  ipcMain.handle('fs:createDir', ipcHandler(async (_event, dirPath: string) => {
    validatePath(dirPath)
    await fs.mkdir(dirPath, { recursive: true })
  }))

  ipcMain.handle('fs:rename', ipcHandler(async (_event, oldPath: string, newPath: string) => {
    validatePath(oldPath)
    validatePath(newPath)
    await fs.rename(oldPath, newPath)
  }))

  // Delete sends to recycle bin (recoverable) instead of permanent rmSync
  ipcMain.handle('fs:delete', ipcHandler(async (_event, targetPath: string) => {
    validatePath(targetPath)
    await shell.trashItem(targetPath)
  }))

  ipcMain.handle('fs:reveal', ipcHandler(async (_event, targetPath: string) => {
    validatePath(targetPath)
    shell.showItemInFolder(targetPath)
  }))

  ipcMain.handle('fs:copyPath', ipcHandler(async (_event, targetPath: string) => {
    validatePath(targetPath)
    clipboard.writeText(targetPath)
  }))

  ipcMain.handle('fs:iconTheme', ipcHandler(async () => {
    return getInstalledBeardedIconsTheme()
  }))
}

function readDirRecursive(dirPath: string, depth: number): FileEntry[] {
  if (depth <= 0) return []

  try {
    const items = fsSync.readdirSync(dirPath, { withFileTypes: true })
    const entries: FileEntry[] = []

    for (const item of items) {
      if (IGNORED.has(item.name)) continue

      const fullPath = path.join(dirPath, item.name)
      const entry: FileEntry = {
        name: item.name,
        path: fullPath,
        isDirectory: item.isDirectory(),
      }

      if (item.isDirectory() && depth > 1) {
        entry.children = readDirRecursive(fullPath, depth - 1)
      }

      entries.push(entry)
    }

    // Directories first, then files, both alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return entries
  } catch {
    return []
  }
}

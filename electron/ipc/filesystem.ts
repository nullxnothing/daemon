import { ipcMain, shell, clipboard } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getInstalledBeardedIconsTheme } from '../services/IconThemeService'
import { isPathSafe } from '../shared/pathValidation'
import type { FileEntry } from '../shared/types'

const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', '.next',
  '__pycache__', '.DS_Store', 'release', '.pnpm-store',
])

export function registerFilesystemHandlers() {
  ipcMain.handle('fs:readDir', async (_event, dirPath: string, depth = 1): Promise<{ ok: boolean; data?: FileEntry[]; error?: string }> => {
    try {
      if (!isPathSafe(dirPath)) return { ok: false, error: 'Path outside project boundaries' }
      const safeDepth = Math.min(depth ?? 3, 10)
      const entries = readDirRecursive(dirPath, safeDepth)
      return { ok: true, data: entries }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      if (!isPathSafe(filePath)) return { ok: false, error: 'Path outside project boundaries' }
      const content = fs.readFileSync(filePath, 'utf8')
      return { ok: true, data: { content, path: filePath } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    try {
      if (!isPathSafe(filePath)) return { ok: false, error: 'Path outside project boundaries' }
      fs.writeFileSync(filePath, content, 'utf8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:createFile', async (_event, filePath: string) => {
    try {
      if (!isPathSafe(filePath)) return { ok: false, error: 'Path outside project boundaries' }
      if (fs.existsSync(filePath)) return { ok: false, error: 'File already exists' }
      fs.writeFileSync(filePath, '', 'utf8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:createDir', async (_event, dirPath: string) => {
    try {
      if (!isPathSafe(dirPath)) return { ok: false, error: 'Path outside project boundaries' }
      fs.mkdirSync(dirPath, { recursive: true })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      if (!isPathSafe(oldPath) || !isPathSafe(newPath)) return { ok: false, error: 'Path outside project boundaries' }
      fs.renameSync(oldPath, newPath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Delete sends to recycle bin (recoverable) instead of permanent rmSync
  ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
    try {
      if (!isPathSafe(targetPath)) return { ok: false, error: 'Path outside project boundaries' }
      await shell.trashItem(targetPath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:reveal', async (_event, targetPath: string) => {
    try {
      if (!isPathSafe(targetPath)) return { ok: false, error: 'Path outside project boundaries' }
      shell.showItemInFolder(targetPath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:copyPath', async (_event, targetPath: string) => {
    try {
      if (!isPathSafe(targetPath)) return { ok: false, error: 'Path outside project boundaries' }
      clipboard.writeText(targetPath)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('fs:iconTheme', async () => {
    try {
      return { ok: true, data: getInstalledBeardedIconsTheme() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

function readDirRecursive(dirPath: string, depth: number): FileEntry[] {
  if (depth <= 0) return []

  try {
    const items = fs.readdirSync(dirPath, { withFileTypes: true })
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

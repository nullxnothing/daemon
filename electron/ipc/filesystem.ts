import { ipcMain, shell, clipboard, dialog } from 'electron'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { getInstalledBeardedIconsTheme } from '../services/IconThemeService'
import { isPathSafe } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { broadcast } from '../services/EventBus'
import * as Voight from '../services/VoightService'
import type { FileEntry } from '../shared/types'

const IGNORED = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', '.next',
  '__pycache__', '.DS_Store', 'release', '.pnpm-store',
  'coverage', 'target', '.anchor', '.cache', '.turbo', '.vite',
  '.vercel', '.wrangler',
])
const MAX_READ_DIR_DEPTH = 6
const MAX_READ_DIR_ENTRIES = 1200

interface ReadDirState {
  remaining: number
}

function validatePath(p: string): void {
  if (!isPathSafe(p)) throw new Error('Path outside project boundaries')
}

// Single recursive watcher on the active project root. Switching projects swaps
// it so we never leak watchers. fs.watch supports `recursive: true` on Windows
// and macOS; events are debounced and noise from ignored dirs (.git, node_modules,
// build output) is dropped before broadcasting `fs:changed` to renderers.
interface ProjectWatcher {
  rootPath: string
  watcher: fsSync.FSWatcher
  debounceTimer: NodeJS.Timeout | null
}
let activeWatcher: ProjectWatcher | null = null
const WATCH_DEBOUNCE_MS = 200

function isIgnoredChange(relativePath: string | null): boolean {
  if (!relativePath) return false
  return relativePath.split(/[\\/]/).some((segment) => IGNORED.has(segment))
}

function stopProjectWatcher(): void {
  if (!activeWatcher) return
  if (activeWatcher.debounceTimer) clearTimeout(activeWatcher.debounceTimer)
  try {
    activeWatcher.watcher.close()
  } catch {
    // already closed
  }
  activeWatcher = null
}

function startProjectWatcher(rootPath: string): void {
  if (activeWatcher?.rootPath === rootPath) return
  stopProjectWatcher()

  const watcher = fsSync.watch(rootPath, { recursive: true }, (_eventType, filename) => {
    const relative = filename == null ? null : filename.toString()
    if (isIgnoredChange(relative)) return
    if (activeWatcher?.debounceTimer) clearTimeout(activeWatcher.debounceTimer)
    if (activeWatcher) {
      activeWatcher.debounceTimer = setTimeout(() => {
        broadcast('fs:changed', { rootPath })
      }, WATCH_DEBOUNCE_MS)
    }
  })
  watcher.on('error', () => stopProjectWatcher())

  activeWatcher = { rootPath, watcher, debounceTimer: null }
}

function trackFileAction(toolExecuted: string, filePath: string, metadata: Record<string, unknown> = {}): void {
  Voight.emitEventSafe({
    agentId: 'daemon-filesystem',
    type: 'action',
    toolExecuted,
    outcome: 'success',
    metadata: {
      sessionId: `fs:${toolExecuted}`,
      path: filePath,
      ...metadata,
    },
  })
}

// Returns a path in destDir for `name` that doesn't already exist, appending
// " (2)", " (3)", ... before the extension on collision.
async function resolveCollisionFreePath(destDir: string, name: string): Promise<string> {
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  let candidate = path.join(destDir, name)
  let counter = 2
  while (await fs.access(candidate).then(() => true).catch(() => false)) {
    candidate = path.join(destDir, `${base} (${counter})${ext}`)
    counter += 1
  }
  return candidate
}

async function readImageBase64(filePath: string) {
  const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.avif'])
  const ext = path.extname(filePath).toLowerCase()
  if (!ALLOWED.has(ext)) throw new Error('Not an image file')
  const stats = fsSync.statSync(filePath)
  if (stats.size > 50 * 1024 * 1024) throw new Error('Image too large (>50MB)')
  const buffer = await fs.readFile(filePath)
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.bmp': 'image/bmp', '.avif': 'image/avif',
  }
  const mime = mimeMap[ext] ?? 'application/octet-stream'
  return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, size: stats.size }
}

export function registerFilesystemHandlers() {
  ipcMain.handle('fs:readDir', ipcHandler(async (_event, dirPath: string, depth = 1) => {
    validatePath(dirPath)
    const safeDepth = Math.max(1, Math.min(depth ?? 1, MAX_READ_DIR_DEPTH))
    return readDirRecursive(dirPath, safeDepth, { remaining: MAX_READ_DIR_ENTRIES })
  }))

  ipcMain.handle('fs:readFile', ipcHandler(async (_event, filePath: string) => {
    validatePath(filePath)
    const stats = fsSync.statSync(filePath)
    if (stats.size > 10 * 1024 * 1024) {
      throw new Error('File too large (>10MB). Open in an external editor.')
    }
    const content = await fs.readFile(filePath, 'utf8')
    return { content, path: filePath }
  }))

  ipcMain.handle('fs:readImageBase64', ipcHandler(async (_event, filePath: string) => {
    validatePath(filePath)
    return readImageBase64(filePath)
  }))

  ipcMain.handle('fs:readPickedImageBase64', ipcHandler(async (_event, filePath: string) => {
    return readImageBase64(filePath)
  }))

  ipcMain.handle('fs:writeImageFromBase64', ipcHandler(async (_event, filePath: string, base64: string) => {
    validatePath(filePath)
    const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.avif'])
    const ext = path.extname(filePath).toLowerCase()
    if (!ALLOWED.has(ext)) throw new Error('Not an image file')
    const buffer = Buffer.from(base64, 'base64')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, buffer)
    trackFileAction('fs_write_image', filePath, { bytes: buffer.length })
  }))

  ipcMain.handle('fs:pickImage', ipcHandler(async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif'] }],
      properties: ['openFile'],
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  }))

  ipcMain.handle('fs:writeFile', ipcHandler(async (_event, filePath: string, content: string) => {
    validatePath(filePath)
    await fs.writeFile(filePath, content, 'utf8')
    trackFileAction('fs_write_file', filePath, { bytes: Buffer.byteLength(content, 'utf8') })
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
    trackFileAction('fs_create_file', filePath)
  }))

  ipcMain.handle('fs:createDir', ipcHandler(async (_event, dirPath: string) => {
    validatePath(dirPath)
    await fs.mkdir(dirPath, { recursive: true })
    trackFileAction('fs_create_dir', dirPath)
  }))

  // Import OS files/folders (drag-and-drop) into a destination directory.
  // Sources are arbitrary user-chosen paths; only the destination must be
  // inside project boundaries. Names collide-resolve so nothing is overwritten.
  ipcMain.handle('fs:importPaths', ipcHandler(async (_event, sourcePaths: string[], destDir: string) => {
    validatePath(destDir)
    const destStat = await fs.stat(destDir).catch(() => null)
    if (!destStat?.isDirectory()) throw new Error('Destination is not a directory')

    const imported: string[] = []
    for (const source of sourcePaths) {
      if (typeof source !== 'string' || source.length === 0) continue
      const srcStat = await fs.stat(source).catch(() => null)
      if (!srcStat) continue

      const target = await resolveCollisionFreePath(destDir, path.basename(source))
      if (srcStat.isDirectory()) {
        await fs.cp(source, target, { recursive: true, errorOnExist: false })
      } else {
        await fs.copyFile(source, target)
      }
      imported.push(target)
      trackFileAction('fs_import_path', target, { sourceName: path.basename(source), isDirectory: srcStat.isDirectory() })
    }
    return imported
  }))

  ipcMain.handle('fs:rename', ipcHandler(async (_event, oldPath: string, newPath: string) => {
    validatePath(oldPath)
    validatePath(newPath)
    await fs.rename(oldPath, newPath)
    trackFileAction('fs_rename', newPath, { oldPath })
  }))

  // Delete sends to recycle bin (recoverable) instead of permanent rmSync
  ipcMain.handle('fs:delete', ipcHandler(async (_event, targetPath: string) => {
    validatePath(targetPath)
    await shell.trashItem(targetPath)
    trackFileAction('fs_delete', targetPath)
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

  ipcMain.handle('fs:watch', ipcHandler(async (_event, rootPath: string) => {
    validatePath(rootPath)
    startProjectWatcher(rootPath)
  }))

  ipcMain.handle('fs:unwatch', ipcHandler(async () => {
    stopProjectWatcher()
  }))
}

async function readDirRecursive(dirPath: string, depth: number, state: ReadDirState): Promise<FileEntry[]> {
  if (depth <= 0 || state.remaining <= 0) return []

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true })
    const entries: FileEntry[] = []
    items.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    for (const item of items) {
      if (IGNORED.has(item.name)) continue
      if (state.remaining <= 0) break

      const fullPath = path.join(dirPath, item.name)
      const entry: FileEntry = {
        name: item.name,
        path: fullPath,
        isDirectory: item.isDirectory(),
      }
      state.remaining -= 1

      if (item.isDirectory() && depth > 1 && state.remaining > 0) {
        entry.children = await readDirRecursive(fullPath, depth - 1, state)
      }

      entries.push(entry)
    }

    return entries
  } catch {
    return []
  }
}

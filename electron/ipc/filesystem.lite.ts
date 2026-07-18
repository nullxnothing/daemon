import { ipcMain } from 'electron'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/db'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { FileEntry } from '../shared/types'

const IGNORED_NAMES = new Set([
  'node_modules', '.git', 'dist', 'dist-electron', '.next', 'target',
  'coverage', '.anchor', '.cache', '.turbo', '.vite', '.pnpm-store',
])
const MAX_READ_DIR_DEPTH = 4
const MAX_READ_DIR_ENTRIES = 1_000
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const WATCH_DEBOUNCE_MS = 200
const TEXT_SAMPLE_BYTES = 8 * 1024

interface ActiveWatcher {
  rootPath: string
  senderId: number
  watcher: fsSync.FSWatcher
  debounceTimer: NodeJS.Timeout | null
}

let activeWatcher: ActiveWatcher | null = null

function normalizedPath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isWithinRoot(target: string, root: string): boolean {
  const normalizedTarget = normalizedPath(target)
  const normalizedRoot = normalizedPath(root)
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
}

async function registeredRootFor(targetPath: string): Promise<{ target: string; root: string }> {
  if (typeof targetPath !== 'string' || !targetPath.trim()) throw new Error('File path is required')
  const target = await fs.realpath(path.resolve(targetPath)).catch(() => null)
  if (!target) throw new Error('Path does not exist')

  const rows = getDb().prepare('SELECT path FROM projects').all() as Array<{ path: string }>
  for (const row of rows) {
    const root = await fs.realpath(path.resolve(row.path)).catch(() => null)
    if (root && isWithinRoot(target, root)) return { target, root }
  }
  throw new Error('Path outside registered project boundaries')
}

function isSecretWritePath(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase()
  if (name === '.env' || (name.startsWith('.env.') && !['.env.example', '.env.sample', '.env.template'].includes(name))) return true
  if (/keypair.*\.json$/i.test(name)) return true
  if (/\.(?:pem|key|p12|pfx)$/i.test(name)) return true
  return /^(?:secret|secrets|seed|mnemonic)(?:\.[^.]+)?$/i.test(name)
}

function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, TEXT_SAMPLE_BYTES))
  if (sample.includes(0)) return true
  if (sample.length === 0) return false

  let controlBytes = 0
  for (const byte of sample) {
    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) controlBytes += 1
  }
  return controlBytes / sample.length > 0.1
}

function decodeText(buffer: Buffer): string {
  if (isProbablyBinary(buffer)) throw new Error('Binary files cannot be opened in Lite Workbench')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new Error('File is not valid UTF-8 text')
  }
}

function validateWriteContent(content: unknown): Buffer {
  if (typeof content !== 'string') throw new Error('File content must be text')
  if (content.includes('\0')) throw new Error('Binary content cannot be written in Lite Workbench')
  const buffer = Buffer.from(content, 'utf8')
  if (buffer.length > MAX_TEXT_BYTES) throw new Error('File too large (>2MB)')
  return buffer
}

function stopWatcher(): void {
  if (!activeWatcher) return
  if (activeWatcher.debounceTimer) clearTimeout(activeWatcher.debounceTimer)
  try { activeWatcher.watcher.close() } catch { /* already closed */ }
  activeWatcher = null
}

function isIgnoredChange(relativePath: string | null): boolean {
  if (!relativePath) return false
  return relativePath.split(/[\\/]/).some((segment) => IGNORED_NAMES.has(segment))
}

function startWatcher(event: Electron.IpcMainInvokeEvent, rootPath: string, canonicalRoot: string): void {
  stopWatcher()
  const watcher = fsSync.watch(canonicalRoot, { recursive: true }, (_eventType, filename) => {
    const relativePath = filename == null ? null : filename.toString()
    if (isIgnoredChange(relativePath) || activeWatcher?.watcher !== watcher) return
    if (activeWatcher.debounceTimer) clearTimeout(activeWatcher.debounceTimer)
    activeWatcher.debounceTimer = setTimeout(() => {
      if (activeWatcher?.watcher !== watcher || activeWatcher.senderId !== event.sender.id || event.sender.isDestroyed()) return
      event.sender.send('fs:changed', { rootPath })
    }, WATCH_DEBOUNCE_MS)
  })
  watcher.on('error', () => {
    if (activeWatcher?.watcher === watcher) stopWatcher()
  })
  activeWatcher = { rootPath, senderId: event.sender.id, watcher, debounceTimer: null }
}

async function readDirectory(dirPath: string, depth: number, remaining: { value: number }): Promise<FileEntry[]> {
  if (depth <= 0 || remaining.value <= 0) return []
  const items = await fs.readdir(dirPath, { withFileTypes: true })
  items.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
    return left.name.localeCompare(right.name)
  })

  const entries: FileEntry[] = []
  for (const item of items) {
    if (IGNORED_NAMES.has(item.name) || remaining.value <= 0) continue
    const entryPath = path.join(dirPath, item.name)
    const entry: FileEntry = { name: item.name, path: entryPath, isDirectory: item.isDirectory() }
    remaining.value -= 1
    if (item.isDirectory() && !item.isSymbolicLink() && depth > 1) {
      entry.children = await readDirectory(entryPath, depth - 1, remaining)
    }
    entries.push(entry)
  }
  return entries
}

export function registerLiteFilesystemHandlers(): void {
  ipcMain.handle('fs:readDir', ipcHandler(async (_event, dirPath: string, depth = 1) => {
    const { target } = await registeredRootFor(dirPath)
    const stats = await fs.stat(target)
    if (!stats.isDirectory()) throw new Error('Path is not a directory')
    const safeDepth = Math.max(1, Math.min(Number.isInteger(depth) ? depth : 1, MAX_READ_DIR_DEPTH))
    return readDirectory(target, safeDepth, { value: MAX_READ_DIR_ENTRIES })
  }))

  ipcMain.handle('fs:readFile', ipcHandler(async (_event, filePath: string) => {
    const { target } = await registeredRootFor(filePath)
    const stats = await fs.stat(target)
    if (!stats.isFile()) throw new Error('Path is not a file')
    if (stats.size > MAX_TEXT_BYTES) throw new Error('File too large (>2MB)')
    return { content: decodeText(await fs.readFile(target)), path: target }
  }))

  ipcMain.handle('fs:writeFile', ipcHandler(async (_event, filePath: string, content: string) => {
    const { target } = await registeredRootFor(filePath)
    const stats = await fs.stat(target)
    if (!stats.isFile()) throw new Error('Path is not a file')
    if (isSecretWritePath(target)) throw new Error('Lite Workbench refuses to write secret or keypair files')
    const buffer = validateWriteContent(content)
    await fs.writeFile(target, buffer)
  }))

  ipcMain.handle('fs:watch', ipcHandler(async (event, rootPath: string) => {
    const { target, root } = await registeredRootFor(rootPath)
    if (normalizedPath(target) !== normalizedPath(root)) throw new Error('Only a registered project root can be watched')
    startWatcher(event, rootPath, root)
  }))

  ipcMain.handle('fs:unwatch', ipcHandler(async (event) => {
    if (activeWatcher && activeWatcher.senderId !== event.sender.id) {
      throw new Error('Project watcher belongs to another window')
    }
    stopWatcher()
  }))
}

export function stopLiteFilesystemWatcher(): void {
  stopWatcher()
}

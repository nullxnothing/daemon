import path from 'node:path'
import fs from 'node:fs'
import { app, dialog, shell, BrowserWindow } from 'electron'
import { GoogleGenAI } from '@google/genai'
import * as SecureKey from './SecureKeyService'
import { getDb } from '../db/db'
import type { ImageRecord, ImageGenerateInput, ImageFilter } from '../shared/types'

const MODEL_MAP = {
  fast: 'imagen-4.0-fast-generate-001',
  standard: 'imagen-4.0-generate-001',
  ultra: 'imagen-4.0-ultra-generate-001',
} as const

const PRICING = {
  fast: 0.02,
  standard: 0.04,
  ultra: 0.06,
} as const

let watcher: ReturnType<typeof import('chokidar').watch> | null = null

function getStorageDir(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dir = path.join(app.getPath('pictures'), 'DAEMON', 'generated', `${yyyy}-${mm}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getScreenshotsDir(): string {
  if (process.platform === 'win32') {
    return path.join(app.getPath('pictures'), 'Screenshots')
  }
  if (process.platform === 'darwin') {
    return app.getPath('desktop')
  }
  return path.join(app.getPath('pictures'), 'Screenshots')
}

export async function generateImage(input: ImageGenerateInput): Promise<ImageRecord> {
  const apiKey = SecureKey.getKey('GEMINI_API_KEY')
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured')

  const modelName = MODEL_MAP[input.model]
  if (!modelName) throw new Error(`Invalid model tier: ${input.model}`)

  const genai = new GoogleGenAI({ apiKey })

  const response = await genai.models.generateImages({
    model: modelName,
    prompt: input.prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: input.aspectRatio,
    },
  })

  const image = response.generatedImages?.[0]
  if (!image?.image?.imageBytes) {
    throw new Error('No image returned from Imagen API')
  }

  const imageBuffer = Buffer.from(image.image.imageBytes, 'base64')
  const id = crypto.randomUUID()
  const filename = `${id}.png`
  const dir = getStorageDir()
  const filepath = path.join(dir, filename)

  fs.writeFileSync(filepath, imageBuffer)

  const db = getDb()
  const tags = JSON.stringify(input.tags ?? [])

  db.prepare(
    'INSERT INTO images (id, filename, filepath, prompt, model, project_id, tags, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(id, filename, filepath, input.prompt, input.model, input.projectId ?? null, tags, 'generated', Date.now())

  return db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRecord
}

export function listImages(filter: ImageFilter): ImageRecord[] {
  const db = getDb()
  const conditions: string[] = []
  const params: unknown[] = []

  if (filter.projectId) {
    conditions.push('project_id = ?')
    params.push(filter.projectId)
  }
  if (filter.source) {
    conditions.push('source = ?')
    params.push(filter.source)
  }
  if (filter.model) {
    conditions.push('model = ?')
    params.push(filter.model)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
  const offset = Math.max(filter.offset ?? 0, 0)

  return db.prepare(
    `SELECT * FROM images ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as ImageRecord[]
}

export function getImage(id: string): ImageRecord | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(id)
  return (row as ImageRecord) ?? null
}

export function deleteImage(id: string): void {
  const db = getDb()
  const row = db.prepare('SELECT filepath FROM images WHERE id = ?').get(id) as { filepath: string } | undefined

  db.prepare('DELETE FROM images WHERE id = ?').run(id)

  if (row?.filepath && fs.existsSync(row.filepath)) {
    shell.trashItem(row.filepath).catch(() => {
      try { fs.unlinkSync(row.filepath) } catch { /* best effort */ }
    })
  }
}

export function updateTags(id: string, tags: string[]): ImageRecord {
  const db = getDb()
  db.prepare('UPDATE images SET tags = ? WHERE id = ?').run(JSON.stringify(tags), id)
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(id)
  if (!row) throw new Error('Image not found')
  return row as ImageRecord
}

export function getBase64(id: string): { data: string; mimeType: string } {
  const db = getDb()
  const row = db.prepare('SELECT filepath FROM images WHERE id = ?').get(id) as { filepath: string } | undefined
  if (!row) throw new Error('Image not found')
  if (!fs.existsSync(row.filepath)) throw new Error('Image file not found on disk')

  const buffer = fs.readFileSync(row.filepath)
  return { data: buffer.toString('base64'), mimeType: 'image/png' }
}

export async function importFile(): Promise<ImageRecord | null> {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(win!, {
    title: 'Import Image',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    properties: ['openFile'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  const ext = path.extname(sourcePath)
  const id = crypto.randomUUID()
  const filename = `${id}${ext}`
  const dir = getStorageDir()
  const filepath = path.join(dir, filename)

  fs.copyFileSync(sourcePath, filepath)

  const db = getDb()
  db.prepare(
    'INSERT INTO images (id, filename, filepath, prompt, model, project_id, tags, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(id, filename, filepath, null, null, null, '[]', 'imported', Date.now())

  return db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRecord
}

export function revealImage(id: string): void {
  const db = getDb()
  const row = db.prepare('SELECT filepath FROM images WHERE id = ?').get(id) as { filepath: string } | undefined
  if (!row) throw new Error('Image not found')
  shell.showItemInFolder(row.filepath)
}

export async function startWatcher(): Promise<void> {
  if (watcher) return

  const chokidar = await import('chokidar')
  const screenshotsDir = getScreenshotsDir()

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true })
  }

  watcher = chokidar.watch(screenshotsDir, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 500 },
  })

  watcher.on('add', (filePath: string) => {
    const ext = path.extname(filePath).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) return

    const id = crypto.randomUUID()
    const filename = path.basename(filePath)
    const dir = getStorageDir()
    const destPath = path.join(dir, `${id}${ext}`)

    try {
      fs.copyFileSync(filePath, destPath)
      const db = getDb()
      db.prepare(
        'INSERT INTO images (id, filename, filepath, prompt, model, project_id, tags, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run(id, filename, destPath, null, null, null, '[]', 'screenshot', Date.now())

      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.send('images:watcher-new', { id, filename, source: 'screenshot' })
    } catch { /* file may be locked or transient */ }
  })
}

export function stopWatcher(): void {
  if (!watcher) return
  watcher.close()
  watcher = null
}

export function isWatcherActive(): boolean {
  return watcher !== null
}

export function hasApiKey(): boolean {
  return Boolean(SecureKey.getKey('GEMINI_API_KEY'))
}

import { dialog, ipcMain } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getDb } from '../db/db'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { invalidatePathCache } from '../shared/pathValidation'
import type { Project, ProjectCreateInput } from '../shared/types'

const PICK_CAPABILITY_TTL_MS = 2 * 60 * 1000
const MAX_PROJECT_NAME_LENGTH = 120

interface PickCapability {
  path: string
  senderId: number
  expiresAt: number
}

let pendingPick: PickCapability | null = null

function normalizedPath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

async function canonicalDirectory(value: string): Promise<string> {
  const resolved = await fs.realpath(path.resolve(value))
  const stats = await fs.stat(resolved)
  if (!stats.isDirectory()) throw new Error('Selected project path is not a directory')
  return resolved
}

function validateProjectName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Project name is required')
  const name = value.trim()
  if (!name) throw new Error('Project name is required')
  if (name.length > MAX_PROJECT_NAME_LENGTH) throw new Error('Project name is too long')
  return name
}

function consumePick(senderId: number): PickCapability {
  const capability = pendingPick
  pendingPick = null
  if (!capability || capability.expiresAt < Date.now()) {
    throw new Error('Choose the project folder again before importing it')
  }
  if (capability.senderId !== senderId) {
    throw new Error('Project folder selection belongs to another window')
  }
  return capability
}

function insertProject(name: string, projectPath: string): Project {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath) as Project | undefined
  if (existing) return existing

  const id = crypto.randomUUID()
  const now = Date.now()
  db.prepare('INSERT INTO projects (id, name, path, last_active) VALUES (?,?,?,?)')
    .run(id, name, projectPath, now)
  invalidatePathCache()
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project
}

export function registerLiteProjectHandlers(): void {
  ipcMain.handle('projects:list', ipcHandler(async () => {
    return getDb()
      .prepare('SELECT * FROM projects ORDER BY pinned DESC, last_active DESC, created_at DESC')
      .all() as Project[]
  }))

  ipcMain.handle('projects:openDialog', ipcHandler(async (event) => {
    pendingPick = null
    const smokePath = process.env.DAEMON_SMOKE_TEST === '1'
      ? process.env.DAEMON_SMOKE_PROJECT_DIALOG_PATH?.trim()
      : null
    let selectedPath = smokePath || null
    if (!selectedPath) {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder',
      })
      if (result.canceled || !result.filePaths.length) return null
      selectedPath = result.filePaths[0]
    }

    const projectPath = await canonicalDirectory(selectedPath)
    pendingPick = {
      path: projectPath,
      senderId: event.sender.id,
      expiresAt: Date.now() + PICK_CAPABILITY_TTL_MS,
    }
    return projectPath
  }))

  ipcMain.handle('projects:create', ipcHandler(async (event, input: ProjectCreateInput & { requireNewDirectory?: boolean }) => {
    if (!input || typeof input.path !== 'string') throw new Error('Project path is required')
    if (input.requireNewDirectory) throw new Error('Lite can only import an existing selected folder')

    const capability = consumePick(event.sender.id)
    const projectPath = await canonicalDirectory(input.path)
    if (normalizedPath(projectPath) !== normalizedPath(capability.path)) {
      throw new Error('Project path does not match the selected folder')
    }
    return insertProject(validateProjectName(input.name), capability.path)
  }))
}

export function clearLiteProjectPickCapability(): void {
  pendingPick = null
}

import { ipcMain, dialog } from 'electron'
import { getDb } from '../db/db'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { ProjectCreateInput } from '../shared/types'

export function registerProjectHandlers() {
  ipcMain.handle('projects:list', ipcHandler(async () => {
    const db = getDb()
    return db.prepare('SELECT * FROM projects ORDER BY last_active DESC, created_at DESC').all()
  }))

  ipcMain.handle('projects:create', ipcHandler(async (_event, project: ProjectCreateInput) => {
    const db = getDb()
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO projects (id, name, path, last_active) VALUES (?,?,?,?)')
      .run(id, project.name, project.path, Date.now())
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  }))

  ipcMain.handle('projects:delete', ipcHandler(async (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }))

  ipcMain.handle('projects:openDialog', ipcHandler(async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Folder',
    })
    if (result.canceled || !result.filePaths.length) {
      return null
    }
    return result.filePaths[0]
  }))
}

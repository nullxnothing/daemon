import { ipcMain, dialog } from 'electron'
import { getDb } from '../db/db'

export function registerProjectHandlers() {
  ipcMain.handle('projects:list', async () => {
    try {
      const db = getDb()
      const projects = db.prepare('SELECT * FROM projects ORDER BY last_active DESC, created_at DESC').all()
      return { ok: true, data: projects }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('projects:create', async (_event, project: { name: string; path: string }) => {
    try {
      const db = getDb()
      const id = crypto.randomUUID()
      db.prepare(
        'INSERT INTO projects (id, name, path, last_active) VALUES (?,?,?,?)'
      ).run(id, project.name, project.path, Date.now())
      const created = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
      return { ok: true, data: created }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('projects:delete', async (_event, id: string) => {
    try {
      const db = getDb()
      db.prepare('DELETE FROM projects WHERE id = ?').run(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('projects:openDialog', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Project Folder',
      })
      if (result.canceled || !result.filePaths.length) {
        return { ok: true, data: null }
      }
      return { ok: true, data: result.filePaths[0] }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

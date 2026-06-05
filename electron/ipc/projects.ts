import { ipcMain, dialog } from 'electron'
import simpleGit from 'simple-git'
import { getDb } from '../db/db'
import { invalidatePathCache } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { Project, ProjectCreateInput } from '../shared/types'

/** Best-effort current branch; null when the path isn't a git repo or is gone. */
async function resolveBranch(path: string): Promise<string | null> {
  try {
    const branch = await simpleGit(path).revparse(['--abbrev-ref', 'HEAD'])
    return branch.trim() || null
  } catch {
    return null
  }
}

export function registerProjectHandlers() {
  ipcMain.handle('projects:list', ipcHandler(async () => {
    const db = getDb()
    const rows = db
      .prepare('SELECT * FROM projects ORDER BY pinned DESC, last_active DESC, created_at DESC')
      .all() as Project[]

    // Refresh the cached branch for each project so the recents list stays accurate.
    const updateBranch = db.prepare('UPDATE projects SET branch = ? WHERE id = ?')
    await Promise.all(
      rows.map(async (row) => {
        const branch = await resolveBranch(row.path)
        if (branch !== row.branch) {
          updateBranch.run(branch, row.id)
          row.branch = branch
        }
      })
    )
    return rows
  }))

  ipcMain.handle('projects:setPinned', ipcHandler(async (_event, input: { id: string; pinned: boolean }) => {
    const db = getDb()
    db.prepare('UPDATE projects SET pinned = ? WHERE id = ?').run(input.pinned ? 1 : 0, input.id)
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(input.id) as Project
  }))

  ipcMain.handle('projects:create', ipcHandler(async (_event, project: ProjectCreateInput) => {
    const db = getDb()
    const id = crypto.randomUUID()
    db.prepare('INSERT INTO projects (id, name, path, last_active) VALUES (?,?,?,?)')
      .run(id, project.name, project.path, Date.now())
    invalidatePathCache()
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  }))

  ipcMain.handle('projects:delete', ipcHandler(async (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    invalidatePathCache()
  }))

  ipcMain.handle('projects:openDialog', ipcHandler(async () => {
    if (process.env.DAEMON_SMOKE_TEST === '1' && process.env.DAEMON_SMOKE_PROJECT_DIALOG_PATH) {
      return process.env.DAEMON_SMOKE_PROJECT_DIALOG_PATH
    }

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

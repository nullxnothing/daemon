import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import simpleGit from 'simple-git'
import { getDb } from '../db/db'
import { invalidatePathCache } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { extractFromProject } from '../services/MemoryExtractionService'
import type { Project, ProjectCreateInput } from '../shared/types'

const DEMO_WORKSPACE_NAME = 'daemon-first-mission'

const DEMO_README = `# daemon-first-mission

A tiny demo workspace created by DAEMON's setup wizard so the first mission
has something real to read. Safe to delete at any time.

## What happens here

The operator (ARIA) reads this project's status and tree, reports what it
found, then asks permission before saving a single fact to project memory.
Reads run automatically. Writes wait for you.

Everything runs on devnet defaults. No wallet, no funds, nothing on-chain.
`

const DEMO_MISSION = `# Mission notes

- Reads run automatically. Looking is free.
- Writes stop and ask. Nothing changes without a yes.
- Sensitive actions make you type the tool name. Money and keys are never one click.

When you are ready for a real project, open one from the Explorer or scaffold
a starter from Project Templates.
`

const DEMO_GITIGNORE = `node_modules/
dist/
.env
`

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
    // Day-one seeding: extract a starter knowledge base so the project's memory isn't
    // empty on first open. Best-effort — never block project creation. Suggestions land
    // as 'suggested' for the user to review (createSuggestion dedupes + gates secrets).
    try { extractFromProject(project.path, id) } catch { /* seeding is advisory */ }
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
  }))

  ipcMain.handle('projects:delete', ipcHandler(async (_event, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    invalidatePathCache()
  }))

  // One-click demo workspace for the wizard's Project step: three files + git init,
  // registered and ready for the first mission's read tools. Idempotent — re-running
  // reuses the existing folder and project row instead of duplicating either.
  ipcMain.handle('projects:createDemoWorkspace', ipcHandler(async () => {
    const dir = path.join(os.homedir(), DEMO_WORKSPACE_NAME)
    fs.mkdirSync(dir, { recursive: true })

    const files: Array<[string, string]> = [
      ['README.md', DEMO_README],
      ['mission.md', DEMO_MISSION],
      ['.gitignore', DEMO_GITIGNORE],
    ]
    for (const [name, content] of files) {
      const filePath = path.join(dir, name)
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, 'utf8')
    }

    if (!fs.existsSync(path.join(dir, '.git'))) {
      try { await simpleGit(dir).init() } catch { /* git missing is fine — the mission still reads files */ }
    }

    const db = getDb()
    const existing = db.prepare('SELECT * FROM projects WHERE path = ?').get(dir) as Project | undefined
    if (existing) {
      db.prepare('UPDATE projects SET last_active = ? WHERE id = ?').run(Date.now(), existing.id)
      return existing
    }

    const id = crypto.randomUUID()
    db.prepare('INSERT INTO projects (id, name, path, last_active) VALUES (?,?,?,?)')
      .run(id, DEMO_WORKSPACE_NAME, dir, Date.now())
    invalidatePathCache()
    try { extractFromProject(dir, id) } catch { /* seeding is advisory */ }
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
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

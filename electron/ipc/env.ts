import { ipcMain, clipboard } from 'electron'
import path from 'node:path'
import * as Env from '../services/EnvService'
import { getDb } from '../db/db'
import { isEnvPathSafe, isProjectPathSafe } from '../shared/pathValidation'

const ENV_FILE_NAMES = new Set(['.env', '.env.local', '.env.production', '.env.staging', '.env.development'])

export function registerEnvHandlers() {
  // Scan all projects, return unified key list
  ipcMain.handle('env:scan-all', async () => {
    try {
      const keys = Env.scanAllProjects()
      return { ok: true, data: keys }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Get all vars for one project
  ipcMain.handle('env:project-vars', async (_event, projectPath: string) => {
    try {
      const files = Env.scanProjectEnvFiles(projectPath)
      return { ok: true, data: files }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Update a var value in a specific .env file
  ipcMain.handle('env:update-var', async (_event, filePath: string, key: string, value: string) => {
    try {
      if (!isEnvPathSafe(filePath, ENV_FILE_NAMES)) return { ok: false, error: 'Path outside project boundaries' }
      Env.writeEnvVar(filePath, key, value)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Add a var to one or multiple projects
  ipcMain.handle('env:add-var', async (_event, key: string, value: string, projectPaths: string[]) => {
    try {
      const safePaths = projectPaths.filter(isProjectPathSafe)
      if (safePaths.length === 0) return { ok: false, error: 'No valid project paths' }
      let added = 0
      for (const projectPath of safePaths) {
        const envPath = path.join(projectPath, '.env')
        Env.addEnvVar(envPath, key, value)
        added++
      }
      return { ok: true, data: { added } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Delete a var from a specific .env file
  ipcMain.handle('env:delete-var', async (_event, filePath: string, key: string) => {
    try {
      if (!isEnvPathSafe(filePath, ENV_FILE_NAMES)) return { ok: false, error: 'Path outside project boundaries' }
      Env.deleteEnvVar(filePath, key)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Diff two projects
  ipcMain.handle('env:diff', async (_event, pathA: string, pathB: string) => {
    try {
      const diff = Env.diffProjects(pathA, pathB)
      return { ok: true, data: diff }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Copy value to clipboard, auto-clear after 30s
  ipcMain.handle('env:copy-value', async (_event, value: string) => {
    try {
      clipboard.writeText(value)
      setTimeout(() => {
        if (clipboard.readText() === value) {
          clipboard.writeText('')
        }
      }, 30000)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Propagate a var to multiple projects
  ipcMain.handle('env:propagate', async (_event, key: string, value: string, projectPaths: string[]) => {
    try {
      // Validate all paths are registered projects
      const safePaths = projectPaths.filter(isProjectPathSafe)
      if (safePaths.length === 0) return { ok: false, error: 'No valid project paths' }
      const updated = Env.propagateVar(key, value, safePaths)
      return { ok: true, data: { updated } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // List all registered projects (for dropdowns)
  ipcMain.handle('env:projects', async () => {
    try {
      const db = getDb()
      const projects = db.prepare('SELECT id, name, path FROM projects ORDER BY name').all()
      return { ok: true, data: projects }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

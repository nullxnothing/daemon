import { ipcMain, clipboard } from 'electron'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as Env from '../services/EnvService'
import { getDb } from '../db/db'
import { isEnvPathSafe, isProjectPathSafe } from '../shared/pathValidation'

const execFileAsync = promisify(execFile)

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
      if (!isProjectPathSafe(projectPath)) return { ok: false, error: 'Path outside project boundaries' }
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
      if (!isProjectPathSafe(pathA) || !isProjectPathSafe(pathB)) return { ok: false, error: 'Path outside project boundaries' }
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

  // Pull env vars from Vercel for a project
  ipcMain.handle('env:pull-vercel', async (_event, projectPath: string, environment = 'production') => {
    try {
      if (!isProjectPathSafe(projectPath)) return { ok: false, error: 'Path outside project boundaries' }

      const targetFile = `.env.${environment === 'production' ? 'production' : environment}.local`
      await execFileAsync('vercel', ['env', 'pull', targetFile, '--environment', environment, '--yes'], {
        cwd: projectPath,
        timeout: 30000,
      })

      // Read the pulled file and parse it
      const pulledPath = path.join(projectPath, targetFile)
      const localPath = path.join(projectPath, '.env')
      const pulledRaw = Env.parseEnvFile(pulledPath)
      const localRaw = Env.parseEnvFile(localPath)

      const toMap = (vars: typeof pulledRaw) => {
        const m: Record<string, string> = {}
        for (const v of vars) { if (!v.isComment && v.key) m[v.key] = v.value }
        return m
      }

      const pulledVars = toMap(pulledRaw)
      const localVars = toMap(localRaw)

      const pulledKeys = new Set(Object.keys(pulledVars))
      const localKeys = new Set(Object.keys(localVars))

      const onlyVercel = [...pulledKeys].filter((k) => !localKeys.has(k)).map((k) => ({ key: k, value: pulledVars[k] }))
      const onlyLocal = [...localKeys].filter((k) => !pulledKeys.has(k)).map((k) => ({ key: k, value: localVars[k] }))
      const different = [...pulledKeys].filter((k) => localKeys.has(k) && pulledVars[k] !== localVars[k]).map((k) => ({
        key: k,
        vercelValue: pulledVars[k],
        localValue: localVars[k],
      }))

      return {
        ok: true,
        data: {
          pulledFile: targetFile,
          onlyVercel,
          onlyLocal,
          different,
          totalPulled: pulledKeys.size,
        },
      }
    } catch (err) {
      const message = (err as Error).message
      if (message.includes('ENOENT')) return { ok: false, error: 'Vercel CLI not found. Install with: npm i -g vercel' }
      return { ok: false, error: message }
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

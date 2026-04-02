import { ipcMain, clipboard } from 'electron'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as Env from '../services/EnvService'
import * as DeployService from '../services/DeployService'
import { getDb } from '../db/db'
import { isEnvPathSafe, isProjectPathSafe } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { TIMEOUTS } from '../config/constants'

const execFileAsync = promisify(execFile)

const ENV_FILE_NAMES = new Set(['.env', '.env.local', '.env.production', '.env.staging', '.env.development'])

let clipboardGeneration = 0

function validateProjectPath(p: string): void {
  if (!isProjectPathSafe(p)) throw new Error('Path outside project boundaries')
}

function validateEnvPath(p: string): void {
  if (!isEnvPathSafe(p, ENV_FILE_NAMES)) throw new Error('Path outside project boundaries')
}

export function registerEnvHandlers() {
  // Scan all projects, return unified key list
  ipcMain.handle('env:scan-all', ipcHandler(async () => {
    return Env.scanAllProjects()
  }))

  // Get all vars for one project
  ipcMain.handle('env:project-vars', ipcHandler(async (_event, projectPath: string) => {
    validateProjectPath(projectPath)
    return Env.scanProjectEnvFiles(projectPath)
  }))

  // Update a var value in a specific .env file
  ipcMain.handle('env:update-var', ipcHandler(async (_event, filePath: string, key: string, value: string) => {
    validateEnvPath(filePath)
    Env.writeEnvVar(filePath, key, value)
  }))

  // Add a var to one or multiple projects
  ipcMain.handle('env:add-var', ipcHandler(async (_event, key: string, value: string, projectPaths: string[]) => {
    const safePaths = projectPaths.filter(isProjectPathSafe)
    if (safePaths.length === 0) throw new Error('No valid project paths')
    let added = 0
    for (const projectPath of safePaths) {
      const envPath = path.join(projectPath, '.env')
      Env.addEnvVar(envPath, key, value)
      added++
    }
    return { added }
  }))

  // Delete a var from a specific .env file
  ipcMain.handle('env:delete-var', ipcHandler(async (_event, filePath: string, key: string) => {
    validateEnvPath(filePath)
    Env.deleteEnvVar(filePath, key)
  }))

  // Diff two projects
  ipcMain.handle('env:diff', ipcHandler(async (_event, pathA: string, pathB: string) => {
    validateProjectPath(pathA)
    validateProjectPath(pathB)
    return Env.diffProjects(pathA, pathB)
  }))

  // Copy value to clipboard, auto-clear after 30s
  ipcMain.handle('env:copy-value', ipcHandler(async (_event, value: string) => {
    clipboardGeneration++
    const gen = clipboardGeneration
    clipboard.writeText(value)
    setTimeout(() => {
      if (clipboardGeneration === gen && clipboard.readText() === value) {
        clipboard.writeText('')
      }
    }, TIMEOUTS.CLIPBOARD_CLEAR)
  }))

  // Propagate a var to multiple projects
  ipcMain.handle('env:propagate', ipcHandler(async (_event, key: string, value: string, projectPaths: string[]) => {
    const safePaths = projectPaths.filter(isProjectPathSafe)
    if (safePaths.length === 0) throw new Error('No valid project paths')
    const updated = Env.propagateVar(key, value, safePaths)
    return { updated }
  }))

  // Pull env vars from Vercel for a project
  ipcMain.handle('env:pull-vercel', ipcHandler(async (_event, projectPath: string, environment = 'production') => {
    validateProjectPath(projectPath)

    const targetFile = `.env.${environment === 'production' ? 'production' : environment}.local`
    await execFileAsync('vercel', ['env', 'pull', targetFile, '--environment', environment, '--yes'], {
      cwd: projectPath,
      timeout: TIMEOUTS.VERCEL_PULL,
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
      pulledFile: targetFile,
      onlyVercel,
      onlyLocal,
      different,
      totalPulled: pulledKeys.size,
    }
  }, (err) => {
    const message = (err as Error).message
    if (message.includes('ENOENT')) return 'Vercel CLI not found. Install with: npm i -g vercel'
    return message
  }))

  // List all registered projects (for dropdowns)
  ipcMain.handle('env:projects', ipcHandler(async () => {
    const db = getDb()
    return db.prepare('SELECT id, name, path FROM projects ORDER BY name').all()
  }))

  // --- Vercel Env Var Management ---

  ipcMain.handle('env:vercel-vars', ipcHandler(async (_event, daemonProjectId: string) => {
    const infra = DeployService.getProjectInfra(daemonProjectId)
    if (!infra.vercel) throw new Error('Project not linked to Vercel')
    return Env.fetchVercelEnvVars(infra.vercel.projectId, infra.vercel.teamId)
  }))

  ipcMain.handle('env:vercel-create-var', ipcHandler(async (_event, daemonProjectId: string, key: string, value: string, target: string[], type?: string) => {
    const infra = DeployService.getProjectInfra(daemonProjectId)
    if (!infra.vercel) throw new Error('Project not linked to Vercel')
    await Env.createVercelEnvVar(infra.vercel.projectId, infra.vercel.teamId, key, value, target, type)
  }))

  ipcMain.handle('env:vercel-update-var', ipcHandler(async (_event, daemonProjectId: string, envVarId: string, value: string, target?: string[]) => {
    const infra = DeployService.getProjectInfra(daemonProjectId)
    if (!infra.vercel) throw new Error('Project not linked to Vercel')
    await Env.updateVercelEnvVar(infra.vercel.projectId, infra.vercel.teamId, envVarId, value, target)
  }))

  ipcMain.handle('env:vercel-delete-var', ipcHandler(async (_event, daemonProjectId: string, envVarId: string) => {
    const infra = DeployService.getProjectInfra(daemonProjectId)
    if (!infra.vercel) throw new Error('Project not linked to Vercel')
    await Env.deleteVercelEnvVar(infra.vercel.projectId, infra.vercel.teamId, envVarId)
  }))
}

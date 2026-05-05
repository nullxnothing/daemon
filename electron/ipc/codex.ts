import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

import * as SecureKey from '../services/SecureKeyService'
import * as CodexMcp from '../services/CodexMcpConfig'
import { CodexProvider } from '../services/providers/CodexProvider'
import { isPathSafe } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { broadcast } from '../services/EventBus'
import { restartProviderInPty, restartAllProviderSessions } from '../shared/providerRestart'

/**
 * Gracefully exit Codex in a PTY and resume with `codex resume --last`.
 */
async function restartCodexInPty(terminalId: string): Promise<void> {
  return restartProviderInPty(terminalId, 'codex resume --last', 'codex')
}

function validateProjectPath(projectPath: string): void {
  if (!isPathSafe(projectPath)) throw new Error('Path not within a registered project')
}

async function getAgentsMdContext(projectPath: string): Promise<{ content: string; diff: string }> {
  const mdPath = path.join(projectPath, 'AGENTS.md')
  const content = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
  let diff = ''
  try {
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD~5'], { cwd: projectPath, encoding: 'utf8', timeout: 10000 })
    diff = stdout.slice(0, 5000)
  } catch {
    diff = '(no git history)'
  }
  return { content, diff }
}

export function registerCodexHandlers() {
  // --- Connection ---

  ipcMain.handle('codex:verify-connection', ipcHandler(async () => {
    const conn = await CodexProvider.verifyConnection()
    broadcast('auth:changed', { providerId: 'codex' })
    return conn
  }))

  ipcMain.handle('codex:get-connection', ipcHandler(async () => {
    return CodexProvider.getConnection()
  }))

  // --- MCP Management (reads/writes ~/.codex/config.toml) ---

  ipcMain.handle('codex:mcp-all', ipcHandler(async () => {
    return CodexMcp.getCodexMcps()
  }))

  ipcMain.handle('codex:mcp-toggle', ipcHandler(async (_event, name: string, enabled: boolean) => {
    CodexMcp.toggleCodexMcp(name, enabled)
  }))

  ipcMain.handle('codex:mcp-add', ipcHandler(async (_event, name: string, command: string, args?: string[], env?: Record<string, string>) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new Error('Invalid MCP name')
    if (!/^[a-zA-Z0-9_./-]+$/.test(command)) throw new Error('Invalid MCP command')
    if (args && args.some((a) => typeof a !== 'string')) throw new Error('Invalid MCP args')
    if (env && Object.keys(env).some((k) => !/^[A-Z0-9_]+$/.test(k))) throw new Error('Invalid env key')
    CodexMcp.addCodexMcp(name, command, args, env)
  }))

  // --- Session Restart ---

  ipcMain.handle('codex:restart-session', ipcHandler(async (_event, terminalId: string) => {
    await restartCodexInPty(terminalId)
    return { id: terminalId }
  }))

  ipcMain.handle('codex:restart-all-sessions', ipcHandler(async () => {
    return await restartAllProviderSessions('codex resume --last', 'codex')
  }))

  // --- Secure Keys ---

  ipcMain.handle('codex:store-key', ipcHandler(async (_event, name: string, value: string) => {
    if (!/^[A-Z0-9_-]{1,100}$/.test(name)) throw new Error('Invalid key name')
    SecureKey.storeKey(name, value)
  }))

  // --- AGENTS.md (Codex equivalent of CLAUDE.md) ---

  ipcMain.handle('codex:agentsmd-read', ipcHandler(async (_event, projectPath: string) => {
    validateProjectPath(projectPath)
    return await getAgentsMdContext(projectPath)
  }))

  ipcMain.handle('codex:agentsmd-write', ipcHandler(async (_event, projectPath: string, content: string) => {
    validateProjectPath(projectPath)
    const mdPath = path.join(projectPath, 'AGENTS.md')
    fs.writeFileSync(mdPath, content, 'utf8')
  }))

  // --- Logout / Account Switch ---

  ipcMain.handle('codex:logout', ipcHandler(async () => {
    const authPath = path.join(os.homedir(), '.codex', 'auth.json')
    let removedAuthFile = false
    if (fs.existsSync(authPath)) {
      const backup = `${authPath}.bak-${Date.now()}`
      try {
        fs.renameSync(authPath, backup)
        removedAuthFile = true
      } catch (err) {
        try { fs.unlinkSync(authPath); removedAuthFile = true } catch {
          throw new Error(`Failed to remove ${authPath}: ${(err as Error).message}`)
        }
      }
    }

    // Clear stored OPENAI_API_KEY from secure storage (best-effort)
    try { SecureKey.storeKey('OPENAI_API_KEY', '') } catch { /* non-fatal */ }

    CodexProvider.clearCache()
    broadcast('auth:changed', { providerId: 'codex' })

    // Clear persisted connection so UI refetches cleanly
    try {
      const { getDb } = require('../db/db')
      const db = getDb()
      const del = db.prepare('DELETE FROM app_settings WHERE key IN (?, ?, ?)')
      del.run('codex_path', 'codex_auth_mode', 'codex_verified_at')
    } catch { /* non-fatal */ }

    return { removedAuthFile }
  }))

  // --- CLI Install ---

  ipcMain.handle('codex:install-cli', ipcHandler(async () => {
    const isWin = process.platform === 'win32'
    let npmPath = isWin ? 'npm.cmd' : 'npm'

    try {
      const npmPrefix = require('child_process')
        .execSync('npm prefix -g', { encoding: 'utf8', timeout: 10000 }).trim()
      const candidate = isWin
        ? path.join(npmPrefix, 'npm.cmd')
        : path.join(npmPrefix, 'bin', 'npm')
      if (fs.existsSync(candidate)) npmPath = candidate
    } catch {
      // fallback to PATH resolution
    }

    const { stdout, stderr } = await execFileAsync(npmPath, ['install', '-g', '@openai/codex'], {
      timeout: 120000,
      env: { ...process.env },
    })

    CodexProvider.clearCache()
    broadcast('auth:changed', { providerId: 'codex' })

    return { stdout: stdout.trim(), stderr: stderr.trim() }
  }))

  // --- Config Info ---

  ipcMain.handle('codex:get-model', ipcHandler(async () => {
    return CodexMcp.getCodexModel()
  }))

  ipcMain.handle('codex:get-reasoning-effort', ipcHandler(async () => {
    return CodexMcp.getCodexReasoningEffort()
  }))
}

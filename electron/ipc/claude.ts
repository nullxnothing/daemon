import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { exec, execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)
import * as SecureKey from '../services/SecureKeyService'
import * as McpConfig from '../services/McpConfig'
import * as Anthropic from '../services/AnthropicService'
import * as Skills from '../services/SkillsConfig'
import * as ClaudeRouter from '../services/ClaudeRouter'
import { isPathSafe } from '../shared/pathValidation'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { getSession, getAllSessionIds } from './terminal'
import type { McpAddInput } from '../shared/types'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Gracefully exit Claude in a PTY and resume with `claude -c`.
 * Uses fixed delays — more reliable than prompt detection which can false-positive.
 */
async function restartClaudeInPty(terminalId: string): Promise<void> {
  const session = getSession(terminalId)
  if (!session) throw new Error('Session not found')

  // Only restart terminals that are running Claude (have an agentId)
  if (!session.agentId) return

  // Ctrl+C to exit Claude
  session.pty.write('\x03')
  await wait(2000)

  // Second Ctrl+C in case Claude asked for confirmation
  session.pty.write('\x03')
  await wait(1000)

  // Clear any partial input, then resume
  session.pty.write('\r')
  await wait(300)
  session.pty.write('claude -c\r')
}

async function getClaudeMdContext(projectPath: string): Promise<{ content: string; diff: string }> {
  const mdPath = path.join(projectPath, 'CLAUDE.md')
  const content = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
  let diff = ''
  try {
    const { stdout } = await execAsync('git diff HEAD~5', { cwd: projectPath, encoding: 'utf8', timeout: 10000 })
    diff = stdout.slice(0, 5000)
  } catch {
    diff = '(no git history)'
  }
  return { content, diff }
}

function validateProjectPath(projectPath: string): void {
  if (!isPathSafe(projectPath)) throw new Error('Path not within a registered project')
}

export function registerClaudeHandlers() {
  // --- MCP ---

  ipcMain.handle('claude:project-mcp-all', ipcHandler(async (_event, projectPath: string) => {
    validateProjectPath(projectPath)
    return McpConfig.getProjectMcps(projectPath)
  }))

  ipcMain.handle('claude:project-mcp-toggle', ipcHandler(async (_event, projectPath: string, name: string, enabled: boolean) => {
    validateProjectPath(projectPath)
    McpConfig.toggleProjectMcp(projectPath, name, enabled)
  }))

  ipcMain.handle('claude:global-mcp-all', ipcHandler(async () => {
    return McpConfig.getGlobalMcps()
  }))

  ipcMain.handle('claude:global-mcp-toggle', ipcHandler(async (_event, name: string, enabled: boolean) => {
    McpConfig.toggleMcp(name, enabled)
  }))

  ipcMain.handle('claude:mcp-add', ipcHandler(async (_event, mcp: McpAddInput) => {
    McpConfig.addRegistryMcp(mcp.name, mcp.config, mcp.description, mcp.isGlobal)
  }))

  // --- Skills & Plugins ---

  ipcMain.handle('claude:skills', ipcHandler(async () => {
    return Skills.getAllSkillsAndPlugins()
  }))

  // --- Session Restart ---
  // Sends Ctrl+C to exit Claude, waits, then types `claude -c` to resume
  // Same PTY stays alive — shell is running underneath, buffer preserved

  // Restart a single terminal session
  ipcMain.handle('claude:restart-session', ipcHandler(async (_event, terminalId: string) => {
    await restartClaudeInPty(terminalId)
    return { id: terminalId }
  }))

  // Restart ALL terminal sessions (used when MCP is toggled)
  ipcMain.handle('claude:restart-all-sessions', ipcHandler(async () => {
    const allIds = getAllSessionIds()
    const results = await Promise.allSettled(allIds.map(restartClaudeInPty))
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    return { restarted: succeeded, total: allIds.length }
  }))

  // --- Anthropic Status ---

  ipcMain.handle('claude:status', ipcHandler(async () => {
    return await Anthropic.fetchAnthropicStatus()
  }))

  // --- Usage Stats (reads from ~/.claude.json, no admin key needed) ---

  ipcMain.handle('claude:usage', ipcHandler(async (_event, projectPath?: string) => {
    const usage = McpConfig.getSessionUsage(projectPath)
    if (!usage) throw new Error('No usage data available')
    return usage
  }))

  // --- AI Commit Suggestions ---

  ipcMain.handle('claude:suggest-commit-message', ipcHandler(async (_event, diff: string) => {
    if (!diff || !diff.trim()) {
      throw new Error('No staged changes found to summarize')
    }

    const suggestion = await ClaudeRouter.runPrompt({
      prompt: `Write a concise git commit message for this staged diff.\n\nRules:\n- Return one line only\n- Imperative mood (e.g. \"Add\", \"Fix\", \"Refactor\")\n- No surrounding quotes\n- Max 72 characters\n\nStaged diff:\n${diff}`,
      systemPrompt: 'You generate precise git commit messages for code diffs.',
      model: 'haiku',
      effort: 'low',
    })

    return suggestion.trim().split(/\r?\n/)[0]
  }))

  // --- Markdown Tidy ---

  ipcMain.handle('claude:tidy-markdown', ipcHandler(async (_event, filePath: string, content: string) => {
    if (!filePath || !/\.(md|mdx)$/i.test(filePath)) {
      throw new Error('Only Markdown files are supported (.md, .mdx)')
    }

    validateProjectPath(filePath)

    if (!content || !content.trim()) {
      throw new Error('File is empty, nothing to tidy')
    }

    const timeoutMs = content.length > 14_000 ? 120_000 : 60_000

    const tidied = await ClaudeRouter.runPrompt({
      prompt: `Format and polish the following Markdown. Return ONLY the revised markdown, nothing else.

Rules:
- Preserve technical meaning, facts, links, commands, and code semantics
- Fix typos and grammar where safe
- Ensure consistent heading hierarchy (H1 -> H2 -> H3)
- Normalize list formatting and spacing
- Keep fenced code blocks valid and include language tags when confidently inferable
- Do NOT remove existing content unless it is duplicate/empty noise
- Do NOT add marketing language or unsupported claims

Markdown:
${content}`,
      systemPrompt: 'You are a strict technical writer. Return only revised markdown, no explanations.',
      model: 'haiku',
      effort: 'low',
      timeoutMs,
      allowApiFallback: false,
    })

    // Strip wrapping code fences if the model returned ```markdown ... ```
    return tidied.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }))

  // --- Secure Keys ---

  ipcMain.handle('claude:store-key', ipcHandler(async (_event, name: string, value: string) => {
    if (!/^[A-Z0-9_-]{1,100}$/.test(name)) throw new Error('Invalid key name')
    SecureKey.storeKey(name, value)
  }))

  ipcMain.handle('claude:list-keys', ipcHandler(async () => {
    return SecureKey.listKeys()
  }))

  ipcMain.handle('claude:delete-key', ipcHandler(async (_event, name: string) => {
    SecureKey.deleteKey(name)
  }))

  // --- CLAUDE.md ---

  ipcMain.handle('claude:claudemd-read', ipcHandler(async (_event, projectPath: string) => {
    validateProjectPath(projectPath)
    return await getClaudeMdContext(projectPath)
  }))

  ipcMain.handle('claude:claudemd-generate', ipcHandler(async (_event, projectPath: string) => {
    validateProjectPath(projectPath)
    const { content, diff } = await getClaudeMdContext(projectPath)

    return await ClaudeRouter.runPrompt({
      prompt: `Update this CLAUDE.md based on recent changes. Preserve structure and style. Return ONLY the updated markdown.\n\nCurrent CLAUDE.md:\n${content}\n\nRecent changes:\n${diff}`,
      systemPrompt: 'You are a technical documentation expert. Update the CLAUDE.md file based on recent code changes. Preserve the existing structure and style. Only add or modify sections that are affected by the changes. Return ONLY the updated markdown content, no explanations.',
      model: 'sonnet',
      effort: 'medium',
      cwd: projectPath,
    })
  }))

  ipcMain.handle('claude:claudemd-write', ipcHandler(async (_event, projectPath: string, content: string) => {
    validateProjectPath(projectPath)
    const mdPath = path.join(projectPath, 'CLAUDE.md')
    fs.writeFileSync(mdPath, content, 'utf8')
  }))

  // --- Connection Management ---

  ipcMain.handle('claude:verify-connection', ipcHandler(async () => {
    return await ClaudeRouter.verifyConnection()
  }))

  ipcMain.handle('claude:get-connection', ipcHandler(async () => {
    return ClaudeRouter.getConnection()
  }))

  // --- CLI Install ---

  ipcMain.handle('claude:install-cli', ipcHandler(async () => {
    // Resolve npm path first
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

    const { stdout, stderr } = await execFileAsync(npmPath, ['install', '-g', '@anthropic-ai/claude-code'], {
      timeout: 120000,
      env: { ...process.env },
    })

    // Invalidate cached path so next verifyConnection picks up the new binary
    ClaudeRouter.clearCachedPath()

    return { stdout: stdout.trim(), stderr: stderr.trim() }
  }))

  // --- Auth Login (opens browser for OAuth) ---

  ipcMain.handle('claude:auth-login', ipcHandler(async () => {
    const claudePath = ClaudeRouter.getClaudePath()

    return new Promise<{ success: boolean }>((resolve, reject) => {
      const child = spawn(claudePath, ['login'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      })

      child.stdin.end()

      let stdout = ''
      let stderr = ''
      let isSettled = false

      const timeout = setTimeout(() => {
        if (!isSettled) {
          isSettled = true
          try { child.kill() } catch {}
          // If the process ran for 60s it likely opened a browser and is waiting
          // Treat as success — user may still be completing OAuth in browser
          resolve({ success: true })
        }
      }, 60000)

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

      child.on('close', (code) => {
        if (isSettled) return
        isSettled = true
        clearTimeout(timeout)
        if (code === 0) {
          resolve({ success: true })
        } else {
          reject(new Error(stderr.trim() || `claude login exited with code ${code}`))
        }
      })

      child.on('error', (err) => {
        if (isSettled) return
        isSettled = true
        clearTimeout(timeout)
        reject(new Error(err.message || 'Failed to start claude login'))
      })
    })
  }))

  // Disconnect: clear credentials, API key, and cached connection state
  ipcMain.handle('claude:disconnect', ipcHandler(async () => {
    // Clear stored API key
    try { SecureKey.deleteKey('ANTHROPIC_API_KEY') } catch {}

    // Clear OAuth credentials file
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json')
    try {
      if (fs.existsSync(credPath)) fs.unlinkSync(credPath)
    } catch {}

    // Clear cached connection in ClaudeRouter
    ClaudeRouter.clearCachedConnection()

    // Clear persisted connection from app_settings
    try {
      const { getDb } = await import('../db/db')
      const db = getDb()
      for (const key of ['claude_path', 'claude_auth_mode', 'claude_verified_at']) {
        db.prepare('DELETE FROM app_settings WHERE key = ?').run(key)
      }
    } catch {}

    return { disconnected: true }
  }))
}

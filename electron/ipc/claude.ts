import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import * as SecureKey from '../services/SecureKeyService'
import * as McpConfig from '../services/McpConfig'
import * as Anthropic from '../services/AnthropicService'
import * as Skills from '../services/SkillsConfig'
import * as ClaudeRouter from '../services/ClaudeRouter'
import { isPathSafe } from '../shared/pathValidation'
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

function getClaudeMdContext(projectPath: string): { content: string; diff: string } {
  const mdPath = path.join(projectPath, 'CLAUDE.md')
  const content = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
  let diff = ''
  try {
    diff = execSync('git diff HEAD~5', { cwd: projectPath, encoding: 'utf8', timeout: 10000 })
  } catch {
    diff = '(no git history)'
  }
  return { content, diff }
}

export function registerClaudeHandlers() {
  // --- MCP ---

  ipcMain.handle('claude:project-mcp-all', async (_event, projectPath: string) => {
    try {
      if (!isPathSafe(projectPath)) return { ok: false, error: 'Path not within a registered project' }
      return { ok: true, data: McpConfig.getProjectMcps(projectPath) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:project-mcp-toggle', async (_event, projectPath: string, name: string, enabled: boolean) => {
    try {
      if (!isPathSafe(projectPath)) return { ok: false, error: 'Path not within a registered project' }
      McpConfig.toggleProjectMcp(projectPath, name, enabled)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:global-mcp-all', async () => {
    try {
      return { ok: true, data: McpConfig.getGlobalMcps() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:global-mcp-toggle', async (_event, name: string, enabled: boolean) => {
    try {
      McpConfig.toggleMcp(name, enabled)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:mcp-add', async (_event, mcp: McpAddInput) => {
    try {
      McpConfig.addRegistryMcp(mcp.name, mcp.config, mcp.description, mcp.isGlobal)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- Skills & Plugins ---

  ipcMain.handle('claude:skills', async () => {
    try {
      return { ok: true, data: Skills.getAllSkillsAndPlugins() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- Session Restart ---
  // Sends Ctrl+C to exit Claude, waits, then types `claude -c` to resume
  // Same PTY stays alive — shell is running underneath, buffer preserved

  // Restart a single terminal session
  ipcMain.handle('claude:restart-session', async (_event, terminalId: string) => {
    try {
      await restartClaudeInPty(terminalId)
      return { ok: true, data: { id: terminalId } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Restart ALL terminal sessions (used when MCP is toggled)
  ipcMain.handle('claude:restart-all-sessions', async () => {
    try {
      const allIds = getAllSessionIds()
      const results = await Promise.allSettled(allIds.map(restartClaudeInPty))
      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      return { ok: true, data: { restarted: succeeded, total: allIds.length } }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- Anthropic Status ---

  ipcMain.handle('claude:status', async () => {
    try {
      const status = await Anthropic.fetchAnthropicStatus()
      return { ok: true, data: status }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- Usage Stats (reads from ~/.claude.json, no admin key needed) ---

  ipcMain.handle('claude:usage', async (_event, projectPath?: string) => {
    try {
      const usage = McpConfig.getSessionUsage(projectPath)
      if (!usage) return { ok: false, error: 'No usage data available' }
      return { ok: true, data: usage }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- AI Commit Suggestions ---

  ipcMain.handle('claude:suggest-commit-message', async (_event, diff: string) => {
    try {
      if (!diff || !diff.trim()) {
        return { ok: false, error: 'No staged changes found to summarize' }
      }

      const suggestion = await ClaudeRouter.runPrompt({
        prompt: `Write a concise git commit message for this staged diff.\n\nRules:\n- Return one line only\n- Imperative mood (e.g. \"Add\", \"Fix\", \"Refactor\")\n- No surrounding quotes\n- Max 72 characters\n\nStaged diff:\n${diff}`,
        systemPrompt: 'You generate precise git commit messages for code diffs.',
        model: 'haiku',
        effort: 'low',
      })

      return { ok: true, data: suggestion.trim().split(/\r?\n/)[0] }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- Markdown Tidy ---

  ipcMain.handle('claude:tidy-markdown', async (_event, filePath: string, content: string) => {
    try {
      if (!filePath || !/\.(md|mdx)$/i.test(filePath)) {
        return { ok: false, error: 'Only Markdown files are supported (.md, .mdx)' }
      }

      if (!isPathSafe(filePath)) {
        return { ok: false, error: 'Path not within a registered project' }
      }

      if (!content || !content.trim()) {
        return { ok: false, error: 'File is empty, nothing to tidy' }
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
      const stripped = tidied.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n?```\s*$/, '')
      return { ok: true, data: stripped }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- Secure Keys ---

  ipcMain.handle('claude:store-key', async (_event, name: string, value: string) => {
    try {
      SecureKey.storeKey(name, value)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:list-keys', async () => {
    try {
      return { ok: true, data: SecureKey.listKeys() }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:delete-key', async (_event, name: string) => {
    try {
      SecureKey.deleteKey(name)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- CLAUDE.md ---

  ipcMain.handle('claude:claudemd-read', async (_event, projectPath: string) => {
    try {
      if (!isPathSafe(projectPath)) return { ok: false, error: 'Path not within a registered project' }
      return { ok: true, data: getClaudeMdContext(projectPath) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:claudemd-generate', async (_event, projectPath: string) => {
    try {
      if (!isPathSafe(projectPath)) return { ok: false, error: 'Path not within a registered project' }
      const { content, diff } = getClaudeMdContext(projectPath)

      const updated = await ClaudeRouter.runPrompt({
        prompt: `Update this CLAUDE.md based on recent changes. Preserve structure and style. Return ONLY the updated markdown.\n\nCurrent CLAUDE.md:\n${content}\n\nRecent changes:\n${diff}`,
        systemPrompt: 'You are a technical documentation expert. Update the CLAUDE.md file based on recent code changes. Preserve the existing structure and style. Only add or modify sections that are affected by the changes. Return ONLY the updated markdown content, no explanations.',
        model: 'sonnet',
        effort: 'medium',
        cwd: projectPath,
      })

      return { ok: true, data: updated }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:claudemd-write', async (_event, projectPath: string, content: string) => {
    try {
      if (!isPathSafe(projectPath)) return { ok: false, error: 'Path not within a registered project' }
      const mdPath = path.join(projectPath, 'CLAUDE.md')
      fs.writeFileSync(mdPath, content, 'utf8')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // --- Connection Management ---

  ipcMain.handle('claude:verify-connection', async () => {
    try {
      const connection = await ClaudeRouter.verifyConnection()
      return { ok: true, data: connection }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('claude:get-connection', async () => {
    try {
      const connection = ClaudeRouter.getConnection()
      return { ok: true, data: connection }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}

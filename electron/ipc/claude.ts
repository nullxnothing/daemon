import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as SecureKey from '../services/SecureKeyService'
import * as McpConfig from '../services/McpConfig'
import * as Anthropic from '../services/AnthropicService'
import * as Skills from '../services/SkillsConfig'
import * as ClaudeRouter from '../services/ClaudeRouter'
import { isPathSafe } from '../shared/pathValidation'
import { ipcHandler, withValidation } from '../services/IpcHandlerFactory'
import { restartProviderInPty, restartAllProviderSessions } from '../shared/providerRestart'
import type { McpAddInput } from '../shared/types'

const execAsync = promisify(exec)

// Cache git diff for 30 seconds to prevent repeated expensive shell calls
const diffCache = new Map<string, { diff: string; timestamp: number }>()
const DIFF_CACHE_TTL = 30_000

/**
 * Gracefully exit Claude in a PTY and resume with `claude -c`.
 * Uses fixed delays — more reliable than prompt detection which can false-positive.
 */
async function restartClaudeInPty(terminalId: string): Promise<void> {
  return restartProviderInPty(terminalId, 'claude -c')
}

async function getClaudeMdContext(projectPath: string): Promise<{ content: string; diff: string }> {
  const mdPath = path.join(projectPath, 'CLAUDE.md')
  const content = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : ''
  
  // Check cache first
  const cached = diffCache.get(projectPath)
  if (cached && Date.now() - cached.timestamp < DIFF_CACHE_TTL) {
    return { content, diff: cached.diff }
  }
  
  // Async git diff with 5s timeout - prevents blocking main thread
  let diff = ''
  try {
    const { stdout } = await execAsync('git diff HEAD~5', {
      cwd: projectPath,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1024 * 1024, // 1MB max
    })
    diff = stdout
    diffCache.set(projectPath, { diff, timestamp: Date.now() })
  } catch {
    diff = '(no git history)'
  }
  return { content, diff }
}

export function registerClaudeHandlers() {
  // --- MCP ---

  ipcMain.handle('claude:project-mcp-all', ipcHandler(async (_event, projectPath: string) => {
    return McpConfig.getProjectMcps(projectPath)
  }))

  ipcMain.handle('claude:project-mcp-toggle', ipcHandler(
    withValidation(
      (_event, projectPath: string) => !isPathSafe(projectPath) ? 'Path not within a registered project' : null,
      async (_event, projectPath: string, name: string, enabled: boolean) => {
        McpConfig.toggleProjectMcp(projectPath, name, enabled)
      }
    )
  ))

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
    return await restartAllProviderSessions('claude -c')
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

    if (!isPathSafe(filePath)) {
      throw new Error('Path not within a registered project')
    }

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
    SecureKey.storeKey(name, value)
  }))

  ipcMain.handle('claude:list-keys', ipcHandler(async () => {
    return SecureKey.listKeys()
  }))

  ipcMain.handle('claude:delete-key', ipcHandler(async (_event, name: string) => {
    SecureKey.deleteKey(name)
  }))

  // --- CLAUDE.md ---

  ipcMain.handle('claude:claudemd-read', ipcHandler(
    withValidation(
      (_event, projectPath: string) => !isPathSafe(projectPath) ? 'Path not within a registered project' : null,
      async (_event, projectPath: string) => {
        return await getClaudeMdContext(projectPath)
      }
    )
  ))

  ipcMain.handle('claude:claudemd-generate', ipcHandler(
    withValidation(
      (_event, projectPath: string) => !isPathSafe(projectPath) ? 'Path not within a registered project' : null,
      async (_event, projectPath: string) => {
        const { content, diff } = await getClaudeMdContext(projectPath)

        return await ClaudeRouter.runPrompt({
          prompt: `Update this CLAUDE.md based on recent changes. Preserve structure and style. Return ONLY the updated markdown.\n\nCurrent CLAUDE.md:\n${content}\n\nRecent changes:\n${diff}`,
          systemPrompt: 'You are a technical documentation expert. Update the CLAUDE.md file based on recent code changes. Preserve the existing structure and style. Only add or modify sections that are affected by the changes. Return ONLY the updated markdown content, no explanations.',
          model: 'sonnet',
          effort: 'medium',
          cwd: projectPath,
        })
      }
    )
  ))

  ipcMain.handle('claude:claudemd-write', ipcHandler(
    withValidation(
      (_event, projectPath: string) => !isPathSafe(projectPath) ? 'Path not within a registered project' : null,
      async (_event, projectPath: string, content: string) => {
        const mdPath = path.join(projectPath, 'CLAUDE.md')
        fs.writeFileSync(mdPath, content, 'utf8')
      }
    )
  ))

  // --- Connection Management ---

  ipcMain.handle('claude:verify-connection', ipcHandler(async () => {
    return await ClaudeRouter.verifyConnection()
  }))

  ipcMain.handle('claude:get-connection', ipcHandler(async () => {
    return ClaudeRouter.getConnection()
  }))
}

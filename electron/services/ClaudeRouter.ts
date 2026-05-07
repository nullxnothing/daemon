import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execSync } from 'node:child_process'
import { getDb } from '../db/db'
import * as SecureKey from './SecureKeyService'
import { sanitizeAiPrompt } from '../security/PrivacyGuard'
import { writeProjectMcpConfig, readProjectMcpConfig, getRegistryMcps, hasProjectMcpFile } from './McpConfig'
import { getRegisteredPorts } from './PortService'
import type { ClaudeConnection } from '../shared/types'

// --- In-memory cache ---

let cachedConnection: ClaudeConnection | null = null
let cachedClaudePath: string | null = null

// --- Types ---

interface AgentRow {
  id: string
  name: string
  system_prompt: string
  model: string
  mcps: string
  shortcut: string | null
}

interface ProjectRow {
  id: string
  name: string
  path: string
  session_summary: string | null
}

interface RunPromptOpts {
  prompt: string
  systemPrompt?: string
  model?: string
  effort?: string
  maxTokens?: number
  cwd?: string
  timeoutMs?: number
  allowApiFallback?: boolean
}

// --- Path Resolution (single implementation) ---

function resolveClaudePath(): string {
  if (cachedClaudePath) return cachedClaudePath

  const home = os.homedir()
  const isWin = process.platform === 'win32'

  const candidates: string[] = isWin
    ? [
        path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
        path.join(home, 'AppData', 'Local', 'npm', 'claude.cmd'),
        path.join(home, 'AppData', 'Roaming', 'npm', 'claude'),
        path.join(home, '.local', 'bin', 'claude.exe'),
        path.join(home, '.local', 'bin', 'claude'),
      ]
    : [
        path.join(home, '.local', 'bin', 'claude'),
        path.join(home, '.npm-global', 'bin', 'claude'),
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
      ]

  // Also check npm prefix dynamically
  try {
    const npmPrefix = execSync('npm prefix -g', { encoding: 'utf8', timeout: 3000 }).trim()
    const npmBin = isWin
      ? path.join(npmPrefix, 'claude.cmd')
      : path.join(npmPrefix, 'bin', 'claude')
    if (!candidates.includes(npmBin)) candidates.unshift(npmBin)
  } catch {}

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedClaudePath = candidate
      return candidate
    }
  }

  // Fallback — rely on shell PATH resolution via node-pty
  const fallback = isWin ? 'claude.cmd' : 'claude'
  cachedClaudePath = fallback
  return fallback
}

// --- Connection Verification ---

export async function verifyConnection(): Promise<ClaudeConnection> {
  const claudePath = resolveClaudePath()

  // Check CLI authentication via credentials file
  let isAuthenticated = false
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json')
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'))
      // Check if there's an OAuth token that isn't expired
      if (creds.oauthToken || creds.accessToken) {
        const expiry = creds.expiresAt || creds.expiry
        if (!expiry || expiry > Date.now()) {
          isAuthenticated = true
        }
      }
    }
  } catch {}

  // Also verify claude binary actually works
  if (!isAuthenticated) {
    try {
      const result = await runCliCommand(claudePath, ['--version'], os.homedir(), 5000)
      if (result.trim()) isAuthenticated = true
    } catch {}
  }

  // Check API key availability
  const hasApiKey = !!(SecureKey.getKey('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY)

  // Determine auth mode
  let authMode: ClaudeConnection['authMode'] = 'none'
  if (hasApiKey && isAuthenticated) authMode = 'both'
  else if (hasApiKey) authMode = 'api'
  else if (isAuthenticated) authMode = 'cli'

  const connection: ClaudeConnection = {
    claudePath,
    hasApiKey,
    isAuthenticated,
    authMode,
  }

  // Cache in memory
  cachedConnection = connection

  // Persist to app_settings
  try {
    const db = getDb()
    const upsert = db.prepare(
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    )
    const now = Date.now()
    upsert.run('claude_path', claudePath, now)
    upsert.run('claude_auth_mode', authMode, now)
    upsert.run('claude_verified_at', String(now), now)
  } catch {}

  return connection
}

export function getConnection(): ClaudeConnection | null {
  if (cachedConnection) return cachedConnection

  // Try to restore from app_settings
  try {
    const db = getDb()
    const get = (key: string) => {
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
      return row?.value ?? null
    }

    const claudePath = get('claude_path')
    const authMode = get('claude_auth_mode') as ClaudeConnection['authMode'] | null
    const verifiedAt = get('claude_verified_at')

    if (!claudePath || !authMode || !verifiedAt) return null

    // If verified within last 24 hours, use cached values
    const age = Date.now() - Number(verifiedAt)
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
    if (age > TWENTY_FOUR_HOURS) return null

    cachedConnection = {
      claudePath,
      hasApiKey: authMode === 'api' || authMode === 'both',
      isAuthenticated: authMode === 'cli' || authMode === 'both',
      authMode,
    }

    return cachedConnection
  } catch {
    return null
  }
}

export function getClaudePath(): string {
  return cachedConnection?.claudePath ?? resolveClaudePath()
}

export function clearCachedPath(): void {
  cachedClaudePath = null
}

export function clearCachedConnection(): void {
  cachedConnection = null
}

// --- One-Shot Prompt Execution ---

export async function runPrompt(opts: RunPromptOpts): Promise<string> {
  const {
    prompt,
    systemPrompt,
    model = 'haiku',
    effort = 'low',
    maxTokens,
    cwd,
    timeoutMs,
    allowApiFallback = false,
  } = opts
  const sanitized = sanitizeAiPrompt({
    prompt,
    systemPrompt,
    context: {
      capability: 'claude_router.run_prompt',
      dataClasses: ['project_code', 'personal_data', 'env_secret', 'wallet_secret'],
      destination: 'ai_provider',
    },
  })
  const conn = getConnection() ?? await verifyConnection()

  // Prefer CLI when authenticated — DAEMON's primary integrated path
  if (conn.isAuthenticated || conn.authMode === 'cli' || conn.authMode === 'both') {
    try {
      return await runPromptViaCli(sanitized.prompt, sanitized.systemPrompt, model, effort, cwd, timeoutMs)
    } catch (err) {
      // Fall through to API fallback when CLI execution fails and API is available
      if (!conn.hasApiKey || !allowApiFallback || process.env.DAEMON_ENABLE_ANTHROPIC_FALLBACK !== '1') {
        throw err
      }
    }
  }

  // API fallback (optional)
  if (conn.hasApiKey && allowApiFallback && process.env.DAEMON_ENABLE_ANTHROPIC_FALLBACK === '1') {
    return await runPromptViaApi(sanitized.prompt, sanitized.systemPrompt, model, maxTokens)
  }

  throw new Error('No Claude CLI authentication available. Sign in to Claude CLI to continue.')
}

async function runPromptViaApi(
  prompt: string,
  systemPrompt: string | undefined,
  model: string,
  maxTokens?: number,
): Promise<string> {
  const apiKey = SecureKey.getKey('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('No API key available')

  // Resolve model shorthand to full versioned string
  const resolvedModel = resolveModelName(model)

  // Dynamic import to avoid loading SDK at startup
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: resolvedModel,
    max_tokens: maxTokens ?? 4096,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: 'user', content: prompt }],
  })

  const block = response.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from API')
  return block.text
}

async function runPromptViaCli(
  prompt: string,
  systemPrompt: string | undefined,
  model: string,
  effort: string,
  cwd?: string,
  timeoutMs?: number,
): Promise<string> {
  const claudePath = getClaudePath()

  const resolvedModel = resolveModelName(model)

  const args: string[] = [
    '-p', prompt,
    '--model', resolvedModel,
    '--effort', effort,
    '--output-format', 'text',
    '--max-turns', '1',
  ]

  // Write system prompt to temp file if provided
  let systemPromptFile: string | null = null
  if (systemPrompt) {
    systemPromptFile = path.join(os.tmpdir(), `daemon_prompt_${Date.now()}.txt`)
    fs.writeFileSync(systemPromptFile, systemPrompt, 'utf8')
    args.push('--append-system-prompt-file', systemPromptFile)
  }

  try {
    return await runCliCommand(claudePath, args, cwd ?? os.tmpdir(), timeoutMs ?? 60000)
  } finally {
    if (systemPromptFile) {
      try { fs.unlinkSync(systemPromptFile) } catch {}
    }
  }
}

// --- Interactive Terminal Command Builder ---

export function buildCommand(agent: AgentRow, project: ProjectRow): {
  command: string
  args: string[]
  contextFilePath: string
} {
  const portMap = buildPortMap()

  const contextContent = [
    agent.system_prompt,
    '',
    '--- DAEMON CONTEXT ---',
    `Project: ${project.name}`,
    `Path: ${project.path}`,
    project.session_summary ? `Last session: ${project.session_summary}` : '',
    portMap ? `\nPort map (all registered services):\n${portMap}` : '',
    '--- END CONTEXT ---',
  ].filter(Boolean).join('\n')

  const contextFilePath = path.join(
    os.tmpdir(),
    `daemon_agent_${agent.id}_${Date.now()}.txt`
  )
  fs.writeFileSync(contextFilePath, contextContent, 'utf8')

  // Bootstrap project MCPs from the agent only on first run
  bootstrapAgentMcps(project.path, agent.mcps)

  const args: string[] = [
    '--model', agent.model,
    '--append-system-prompt-file', contextFilePath,
  ]

  return { command: getClaudePath(), args, contextFilePath }
}

export function cleanupContextFile(filePath: string): void {
  try { fs.unlinkSync(filePath) } catch {}
}

// --- Internal Utilities ---

function bootstrapAgentMcps(projectPath: string, mcpsJson: string): void {
  try {
    if (hasProjectMcpFile(projectPath)) return

    const mcpNames: string[] = JSON.parse(mcpsJson)
    if (mcpNames.length === 0) return

    const existing = readProjectMcpConfig(projectPath)
    const registry = getRegistryMcps()
    const registryMap = new Map(registry.map((r) => [r.name, r.config]))

    for (const name of mcpNames) {
      const config = registryMap.get(name)
      if (config && !existing[name]) {
        existing[name] = JSON.parse(config)
      }
    }

    writeProjectMcpConfig(projectPath, existing)
  } catch {}
}

function buildPortMap(): string {
  try {
    const ports = getRegisteredPorts()
    if (ports.length === 0) return ''
    return ports
      .map((p) => `  :${p.port} → ${p.serviceName} (${p.projectName})`)
      .join('\n')
  } catch {
    return ''
  }
}

function resolveModelName(shorthand: string): string {
  const modelMap: Record<string, string> = {
    'haiku': 'claude-haiku-4-5-20251001',
    'sonnet': 'claude-sonnet-4-20250514',
    'opus': 'claude-opus-4-20250514',
  }
  return modelMap[shorthand] ?? shorthand
}

function buildSubscriptionEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  // Remove API key so CLI uses subscription OAuth instead of pay-per-token billing
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

function runCliCommand(command: string, args: string[], cwd: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: buildSubscriptionEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    // Close stdin immediately — prevents "no stdin data received" warning
    child.stdin.end()

    let stdout = ''
    let stderr = ''
    let isSettled = false
    let isTimedOut = false

    const timeoutHandle = setTimeout(() => {
      if (isSettled) return
      isTimedOut = true
      try { child.kill() } catch {}
    }, timeout)

    const finalizeReject = (message: string) => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timeoutHandle)
      reject(new Error(message))
    }

    const finalizeResolve = (value: string) => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timeoutHandle)
      resolve(value)
    }

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('close', (code, signal) => {
      if (code === 0) {
        finalizeResolve(stdout.trim())
        return
      }

      const stderrText = stderr.trim()
      if (isTimedOut) {
        const suffix = stderrText ? `: ${stderrText}` : ''
        finalizeReject(`Claude CLI timed out after ${timeout}ms${suffix}`)
        return
      }

      if (signal) {
        const suffix = stderrText ? `: ${stderrText}` : ''
        finalizeReject(`Claude CLI terminated by signal ${signal}${suffix}`)
        return
      }

      if (code === null) {
        const suffix = stderrText ? `: ${stderrText}` : ''
        finalizeReject(`Claude CLI exited unexpectedly (no exit code)${suffix}`)
        return
      }

      finalizeReject(stderrText || `claude exited with code ${code}`)
    })

    child.on('error', (err) => {
      const prefix = err.message?.trim() ? `${err.message.trim()}` : 'Failed to start Claude CLI process'
      const stderrText = stderr.trim()
      const suffix = stderrText ? `: ${stderrText}` : ''
      finalizeReject(`${prefix}${suffix}`)
    })
  })
}

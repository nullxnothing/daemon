import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execSync } from 'node:child_process'
import { getDb } from '../db/db'
import * as SecureKey from './SecureKeyService'
import { TIMEOUTS } from '../config/constants'
import { writeProjectMcpConfig, readProjectMcpConfig, getRegistryMcps, hasProjectMcpFile } from './McpConfig'
import { getRegisteredPorts } from './PortService'
import { getEmailAccountSummary, EMAIL_TOOL_NAMES } from './email/EmailTools'
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
    const npmPrefix = execSync('npm prefix -g', { encoding: 'utf8', timeout: TIMEOUTS.NPM_PREFIX }).trim()
    const npmBin = isWin
      ? path.join(npmPrefix, 'claude.cmd')
      : path.join(npmPrefix, 'bin', 'claude')
    if (!candidates.includes(npmBin)) candidates.unshift(npmBin)
  } catch (err) {
    console.warn('[ClaudeRouter] npm prefix lookup failed:', (err as Error).message)
  }

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
  } catch (err) {
    console.warn('[ClaudeRouter] credential file check failed:', (err as Error).message)
  }

  // Also verify claude binary actually works
  if (!isAuthenticated) {
    try {
      const result = await runCliCommand(claudePath, ['--version'], os.homedir(), TIMEOUTS.VERSION_CHECK)
      if (result.trim()) isAuthenticated = true
    } catch (err) {
      console.warn('[ClaudeRouter] claude --version check failed:', (err as Error).message)
    }
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
  } catch (err) {
    console.warn('[ClaudeRouter] failed to persist connection to app_settings:', (err as Error).message)
  }

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
  cachedConnection = null
}

export const clearCachedConnection = clearCachedPath

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
  const conn = getConnection() ?? await verifyConnection()

  // Prefer CLI when authenticated — DAEMON's primary integrated path
  if (conn.isAuthenticated || conn.authMode === 'cli' || conn.authMode === 'both') {
    try {
      return await runPromptViaCli(prompt, systemPrompt, model, effort, cwd, timeoutMs)
    } catch (err) {
      // Fall through to API fallback when CLI execution fails and API is available
      if (!conn.hasApiKey || !allowApiFallback || process.env.DAEMON_ENABLE_ANTHROPIC_FALLBACK !== '1') {
        throw err
      }
    }
  }

  // API fallback (optional)
  if (conn.hasApiKey && allowApiFallback && process.env.DAEMON_ENABLE_ANTHROPIC_FALLBACK === '1') {
    return await runPromptViaApi(prompt, systemPrompt, model, maxTokens)
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
    ...(systemPrompt ? { system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }] } : {}),
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
    return await runCliCommand(claudePath, args, cwd ?? os.tmpdir(), timeoutMs ?? TIMEOUTS.CLI_PROMPT_DEFAULT)
  } finally {
    if (systemPromptFile) {
      try { fs.unlinkSync(systemPromptFile) } catch (err) {
        console.warn('[ClaudeRouter] failed to cleanup system prompt file:', (err as Error).message)
      }
    }
  }
}

// --- Interactive Terminal Command Builder ---

export async function buildCommand(agent: AgentRow, project: ProjectRow): Promise<{
  command: string
  args: string[]
  contextFilePath: string
}> {
  const tags = parseContextTags(agent.system_prompt)
  const systemPrompt = stripContextTags(agent.system_prompt)

  const sections: string[] = [systemPrompt, '']

  // Always inject: project name, path, tech stack
  sections.push('<daemon-context>')
  sections.push(`<project-info>`)
  sections.push(`Project: ${project.name}`)
  sections.push(`Path: ${project.path}`)
  if (project.session_summary) sections.push(`Last session: ${project.session_summary}`)
  sections.push(`</project-info>`)

  // Port map: only for agents tagged with "ports"
  if (tags.has('ports')) {
    const portMap = buildPortMap()
    if (portMap) {
      sections.push(`<port-map>`)
      sections.push(portMap)
      sections.push(`</port-map>`)
    }
  }

  // Email: only for agents tagged with "email"
  if (tags.has('email')) {
    const emailSummary = await getEmailAccountSummary()
    sections.push(`<email-context>`)
    sections.push(emailSummary)
    sections.push(`Email tools: ${EMAIL_TOOL_NAMES}`)
    sections.push(`</email-context>`)
  }

  // MPP (Machine Payments Protocol) context for solana agents
  if (tags.has('solana')) {
    sections.push('<mpp-context>')
    sections.push('Machine Payments Protocol (MPP) by Stripe × Tempo enables autonomous agent-to-agent payments on Solana.')
    sections.push('Package: @solana/mpp — use @solana/mpp/client for paying agents, @solana/mpp/server for receiving.')
    sections.push('Key concepts: MppClient.pay(recipient, amount, memo) sends USDC via Solana. Agents can autonomously pay for services.')
    sections.push('Docs: https://docs.solana.com/mpp')
    sections.push('</mpp-context>')
  }

  // PayAI x402 skill: inject for agents tagged with "solana" or "x402"
  if (tags.has('solana') || tags.has('x402')) {
    const skillPath = path.join(__dirname, '..', 'skills', 'payai-x402', 'SKILL.md')
    try {
      if (fs.existsSync(skillPath)) {
        const skillContent = fs.readFileSync(skillPath, 'utf8')
        sections.push('<payai-x402-skill>')
        sections.push(skillContent)
        sections.push('</payai-x402-skill>')
      }
    } catch {
      // skill file missing — non-fatal
    }
  }

  sections.push('</daemon-context>')

  const contextContent = sections.filter(Boolean).join('\n')

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
  try { fs.unlinkSync(filePath) } catch (err) {
    console.warn('[ClaudeRouter] failed to cleanup context file:', (err as Error).message)
  }
}

// --- Internal Utilities ---

function parseContextTags(systemPrompt: string): Set<string> {
  const match = systemPrompt.match(/<context-tags>(.*?)<\/context-tags>/)
  if (!match) return new Set(['project']) // default: project info only
  return new Set(match[1].split(',').map((t) => t.trim()).filter(Boolean))
}

function stripContextTags(systemPrompt: string): string {
  return systemPrompt.replace(/<context-tags>.*?<\/context-tags>\n?/g, '').trim()
}

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
  } catch (err) {
    console.warn('[ClaudeRouter] failed to bootstrap agent MCPs:', (err as Error).message)
  }
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
      try { child.kill() } catch (err) {
        console.warn('[ClaudeRouter] failed to kill timed-out CLI process:', (err as Error).message)
      }
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

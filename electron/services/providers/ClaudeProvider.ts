import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawn, execSync } from 'node:child_process'
import { getDb } from '../../db/db'
import * as SecureKey from '../SecureKeyService'
import { TIMEOUTS } from '../../config/constants'
import { writeProjectMcpConfig, readProjectMcpConfig, getRegistryMcps, hasProjectMcpFile } from '../McpConfig'
import { parseContextTags, stripContextTags, buildPortMap, buildEmailContext, buildMppContext } from './contextUtils'
import type { ProviderInterface, ProviderConnection, ProviderBuildResult, ProviderRunPromptOpts, AgentRow, ProjectRow } from './ProviderInterface'

// --- In-memory cache ---

let cachedConnection: ProviderConnection | null = null
let cachedClaudePath: string | null = null

// --- Model Resolution ---

const MODEL_MAP: Record<string, string> = {
  'haiku': 'claude-haiku-4-5-20251001',
  'sonnet': 'claude-sonnet-4-20250514',
  'opus': 'claude-opus-4-20250514',
}

function resolveModelName(shorthand: string): string {
  return MODEL_MAP[shorthand] ?? shorthand
}

// --- Claude Provider ---

export const ClaudeProvider: ProviderInterface = {
  id: 'claude',

  resolvePath(): string {
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

    try {
      const npmPrefix = execSync('npm prefix -g', { encoding: 'utf8', timeout: TIMEOUTS.NPM_PREFIX }).trim()
      const npmBin = isWin
        ? path.join(npmPrefix, 'claude.cmd')
        : path.join(npmPrefix, 'bin', 'claude')
      if (!candidates.includes(npmBin)) candidates.unshift(npmBin)
    } catch (err) {
      console.warn('[ClaudeProvider] npm prefix lookup failed:', (err as Error).message)
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        cachedClaudePath = candidate
        return candidate
      }
    }

    const fallback = isWin ? 'claude.cmd' : 'claude'
    cachedClaudePath = fallback
    return fallback
  },

  async verifyConnection(): Promise<ProviderConnection> {
    const cliPath = this.resolvePath()

    let isAuthenticated = false
    try {
      const credPath = path.join(os.homedir(), '.claude', '.credentials.json')
      if (fs.existsSync(credPath)) {
        const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'))
        if (creds.oauthToken || creds.accessToken) {
          const expiry = creds.expiresAt || creds.expiry
          if (!expiry || expiry > Date.now()) {
            isAuthenticated = true
          }
        }
      }
    } catch (err) {
      console.warn('[ClaudeProvider] credential file check failed:', (err as Error).message)
    }

    if (!isAuthenticated) {
      try {
        const result = await runCliCommand(cliPath, ['--version'], os.homedir(), TIMEOUTS.VERSION_CHECK)
        if (result.trim()) isAuthenticated = true
      } catch (err) {
        console.warn('[ClaudeProvider] claude --version check failed:', (err as Error).message)
      }
    }

    const hasApiKey = !!(SecureKey.getKey('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY)

    let authMode: ProviderConnection['authMode'] = 'none'
    if (hasApiKey && isAuthenticated) authMode = 'both'
    else if (hasApiKey) authMode = 'api'
    else if (isAuthenticated) authMode = 'cli'

    const connection: ProviderConnection = {
      providerId: 'claude',
      cliPath,
      hasApiKey,
      isAuthenticated,
      authMode,
    }

    cachedConnection = connection

    try {
      const db = getDb()
      const upsert = db.prepare(
        'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      )
      const now = Date.now()
      upsert.run('claude_path', cliPath, now)
      upsert.run('claude_auth_mode', authMode, now)
      upsert.run('claude_verified_at', String(now), now)
    } catch (err) {
      console.warn('[ClaudeProvider] failed to persist connection to app_settings:', (err as Error).message)
    }

    return connection
  },

  getConnection(): ProviderConnection | null {
    if (cachedConnection) return cachedConnection

    try {
      const db = getDb()
      const get = (key: string) => {
        const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined
        return row?.value ?? null
      }

      const cliPath = get('claude_path')
      const authMode = get('claude_auth_mode') as ProviderConnection['authMode'] | null
      const verifiedAt = get('claude_verified_at')

      if (!cliPath || !authMode || !verifiedAt) return null

      const age = Date.now() - Number(verifiedAt)
      const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000
      if (age > TWENTY_FOUR_HOURS) return null

      cachedConnection = {
        providerId: 'claude',
        cliPath,
        hasApiKey: authMode === 'api' || authMode === 'both',
        isAuthenticated: authMode === 'cli' || authMode === 'both',
        authMode,
      }

      return cachedConnection
    } catch {
      return null
    }
  },

  clearCache(): void {
    cachedClaudePath = null
    cachedConnection = null
  },

  async buildCommand(agent: AgentRow, project: ProjectRow): Promise<ProviderBuildResult> {
    const tags = parseContextTags(agent.system_prompt)
    const systemPrompt = stripContextTags(agent.system_prompt)

    const sections: string[] = [systemPrompt, '']

    sections.push('<daemon-context>')
    sections.push(`<project-info>`)
    sections.push(`Project: ${project.name}`)
    sections.push(`Path: ${project.path}`)
    if (project.session_summary) sections.push(`Last session: ${project.session_summary}`)
    sections.push(`</project-info>`)

    if (tags.has('ports')) {
      const portMap = buildPortMap()
      if (portMap) {
        sections.push(`<port-map>`)
        sections.push(portMap)
        sections.push(`</port-map>`)
      }
    }

    if (tags.has('email')) {
      sections.push(...await buildEmailContext())
    }

    if (tags.has('solana')) {
      sections.push(...buildMppContext())
    }

    if (tags.has('solana') || tags.has('x402')) {
      const skillPath = path.join(__dirname, '..', '..', 'skills', 'payai-x402', 'SKILL.md')
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
    const contextFilePath = path.join(os.tmpdir(), `daemon_agent_${agent.id}_${Date.now()}.txt`)
    fs.writeFileSync(contextFilePath, contextContent, 'utf8')

    bootstrapAgentMcps(project.path, agent.mcps)

    const args: string[] = [
      '--model', resolveModelName(agent.model),
      '--append-system-prompt-file', contextFilePath,
    ]

    return { command: this.resolvePath(), args, contextFilePath }
  },

  cleanupContextFile(filePath: string): void {
    try { fs.unlinkSync(filePath) } catch (err) {
      console.warn('[ClaudeProvider] failed to cleanup context file:', (err as Error).message)
    }
  },

  async runPrompt(opts: ProviderRunPromptOpts): Promise<string> {
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
    const conn = this.getConnection() ?? await this.verifyConnection()

    if (conn.isAuthenticated || conn.authMode === 'cli' || conn.authMode === 'both') {
      try {
        return await runPromptViaCli(this.resolvePath(), prompt, systemPrompt, model, effort, cwd, timeoutMs)
      } catch (err) {
        if (!conn.hasApiKey || !allowApiFallback || process.env.DAEMON_ENABLE_ANTHROPIC_FALLBACK !== '1') {
          throw err
        }
      }
    }

    if (conn.hasApiKey && allowApiFallback && process.env.DAEMON_ENABLE_ANTHROPIC_FALLBACK === '1') {
      return await runPromptViaApi(prompt, systemPrompt, model, maxTokens)
    }

    throw new Error('No Claude CLI authentication available. Sign in to Claude CLI to continue.')
  },

  getResumeCommand(): string {
    return 'claude -c'
  },

  getStrippedEnvKeys(): string[] {
    return ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']
  },
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
  } catch (err) {
    console.warn('[ClaudeProvider] failed to bootstrap agent MCPs:', (err as Error).message)
  }
}

function buildSubscriptionEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

async function runPromptViaApi(
  prompt: string,
  systemPrompt: string | undefined,
  model: string,
  maxTokens?: number,
): Promise<string> {
  const apiKey = SecureKey.getKey('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('No API key available')

  const resolvedModel = resolveModelName(model)

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
  claudePath: string,
  prompt: string,
  systemPrompt: string | undefined,
  model: string,
  effort: string,
  cwd?: string,
  timeoutMs?: number,
): Promise<string> {
  const resolvedModel = resolveModelName(model)

  const args: string[] = [
    '-p', prompt,
    '--model', resolvedModel,
    '--effort', effort,
    '--output-format', 'text',
    '--max-turns', '1',
  ]

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
        console.warn('[ClaudeProvider] failed to cleanup system prompt file:', (err as Error).message)
      }
    }
  }
}

function runCliCommand(command: string, args: string[], cwd: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: buildSubscriptionEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    child.stdin.end()

    let stdout = ''
    let stderr = ''
    let isSettled = false
    let isTimedOut = false

    const timeoutHandle = setTimeout(() => {
      if (isSettled) return
      isTimedOut = true
      try { child.kill() } catch (err) {
        console.warn('[ClaudeProvider] failed to kill timed-out CLI process:', (err as Error).message)
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

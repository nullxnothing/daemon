import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawn, execSync } from 'node:child_process'
import { getDb } from '../../db/db'
import * as SecureKey from '../SecureKeyService'
import { TIMEOUTS } from '../../config/constants'
import { parseContextTags, stripContextTags, buildPortMap, buildEmailContext, buildMppContext, buildSolanaRuntimeContext } from './contextUtils'
import type { ProviderInterface, ProviderConnection, ProviderBuildResult, ProviderRunPromptOpts, AgentRow, ProjectRow } from './ProviderInterface'

// --- In-memory cache ---

let cachedConnection: ProviderConnection | null = null
let cachedCodexPath: string | null = null

// --- Codex Provider ---

export const CodexProvider: ProviderInterface = {
  id: 'codex',

  resolvePath(): string {
    if (cachedCodexPath) return cachedCodexPath

    const home = os.homedir()
    const isWin = process.platform === 'win32'

    const candidates: string[] = isWin
      ? [
          path.join(home, 'AppData', 'Roaming', 'npm', 'codex.cmd'),
          path.join(home, 'AppData', 'Local', 'npm', 'codex.cmd'),
          path.join(home, 'AppData', 'Roaming', 'npm', 'codex'),
          path.join(home, '.local', 'bin', 'codex.exe'),
          path.join(home, '.local', 'bin', 'codex'),
        ]
      : [
          path.join(home, '.local', 'bin', 'codex'),
          path.join(home, '.npm-global', 'bin', 'codex'),
          '/usr/local/bin/codex',
          '/opt/homebrew/bin/codex',
        ]

    try {
      const npmPrefix = execSync('npm prefix -g', { encoding: 'utf8', timeout: TIMEOUTS.NPM_PREFIX }).trim()
      const npmBin = isWin
        ? path.join(npmPrefix, 'codex.cmd')
        : path.join(npmPrefix, 'bin', 'codex')
      if (!candidates.includes(npmBin)) candidates.unshift(npmBin)
    } catch (err) {
      console.warn('[CodexProvider] npm prefix lookup failed:', (err as Error).message)
    }

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        cachedCodexPath = candidate
        return candidate
      }
    }

    const fallback = isWin ? 'codex.cmd' : 'codex'
    cachedCodexPath = fallback
    return fallback
  },

  async verifyConnection(): Promise<ProviderConnection> {
    const cliPath = this.resolvePath()

    let isAuthenticated = false

    // Check auth.json for stored API key
    try {
      const authPath = path.join(os.homedir(), '.codex', 'auth.json')
      if (fs.existsSync(authPath)) {
        const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'))
        if (auth.OPENAI_API_KEY || auth.auth_mode === 'apikey') {
          isAuthenticated = true
        }
      }
    } catch (err) {
      console.warn('[CodexProvider] auth.json check failed:', (err as Error).message)
    }

    // Check env var as additional auth source
    if (!isAuthenticated && process.env.OPENAI_API_KEY) {
      isAuthenticated = true
    }

    // Check for API key in secure storage or env
    const hasApiKey = !!(SecureKey.getKey('OPENAI_API_KEY') || process.env.OPENAI_API_KEY)

    let authMode: ProviderConnection['authMode'] = 'none'
    if (hasApiKey && isAuthenticated) authMode = 'both'
    else if (hasApiKey) authMode = 'api'
    else if (isAuthenticated) authMode = 'cli'

    const connection: ProviderConnection = {
      providerId: 'codex',
      cliPath,
      hasApiKey,
      isAuthenticated,
      authMode,
    }

    cachedConnection = connection

    // Persist to app_settings
    try {
      const db = getDb()
      const upsert = db.prepare(
        'INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      )
      const now = Date.now()
      upsert.run('codex_path', cliPath, now)
      upsert.run('codex_auth_mode', authMode, now)
      upsert.run('codex_verified_at', String(now), now)
    } catch (err) {
      console.warn('[CodexProvider] failed to persist connection to app_settings:', (err as Error).message)
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

      const cliPath = get('codex_path')
      const authMode = get('codex_auth_mode') as ProviderConnection['authMode'] | null
      const verifiedAt = get('codex_verified_at')

      if (!cliPath || !authMode || !verifiedAt) return null

      const age = Date.now() - Number(verifiedAt)
      const FIVE_MINUTES = 5 * 60 * 1000
      if (age > FIVE_MINUTES) return null

      cachedConnection = {
        providerId: 'codex',
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
    cachedCodexPath = null
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
      sections.push(...buildSolanaRuntimeContext(project))
      sections.push(...buildMppContext())
    }

    sections.push('</daemon-context>')

    const contextContent = sections.filter(Boolean).join('\n')
    const contextFilePath = path.join(os.tmpdir(), `daemon_codex_${agent.id}_${randomUUID()}.txt`)
    fs.writeFileSync(contextFilePath, contextContent, { encoding: 'utf8', mode: 0o600 })

    // Resolve model — map Claude models to Codex equivalents
    const model = resolveCodexModel(agent.model)

    const args: string[] = [
      '--model', model,
      '--full-auto',
      '--no-alt-screen',
      '-c', `instructions_file=${contextFilePath}`,
      '-C', project.path,
    ]

    return { command: this.resolvePath(), args, contextFilePath }
  },

  cleanupContextFile(filePath: string): void {
    try { fs.unlinkSync(filePath) } catch (err) {
      console.warn('[CodexProvider] failed to cleanup context file:', (err as Error).message)
    }
  },

  async runPrompt(opts: ProviderRunPromptOpts): Promise<string> {
    const {
      prompt,
      systemPrompt,
      model = 'gpt-5.4',
      cwd,
      timeoutMs,
    } = opts

    const conn = this.getConnection() ?? await this.verifyConnection()

    if (conn.authMode === 'none') {
      throw new Error('No Codex CLI authentication available. Run `codex login` to continue.')
    }

    const codexPath = this.resolvePath()
    const resolvedModel = resolveCodexModel(model)

    const outputFile = path.join(os.tmpdir(), `daemon_codex_out_${randomUUID()}.txt`)

    const args: string[] = [
      'exec',
      '--model', resolvedModel,
      '--ephemeral',
      '--sandbox', 'read-only',
      '-o', outputFile,
    ]

    // Write system prompt to temp file and pass via -c instructions_file
    let contextFile: string | null = null
    if (systemPrompt) {
      contextFile = path.join(os.tmpdir(), `daemon_codex_prompt_${randomUUID()}.txt`)
      fs.writeFileSync(contextFile, systemPrompt, { encoding: 'utf8', mode: 0o600 })
      args.push('-c', `instructions_file=${contextFile}`)
    }

    args.push(prompt)

    try {
      await runCliCommand(codexPath, args, cwd ?? os.tmpdir(), timeoutMs ?? TIMEOUTS.CLI_PROMPT_DEFAULT)
      // Read the output file written by codex exec -o
      if (fs.existsSync(outputFile)) {
        return fs.readFileSync(outputFile, 'utf8').trim()
      }
      return ''
    } finally {
      for (const f of [contextFile, outputFile]) {
        if (f) try { fs.unlinkSync(f) } catch { /* non-fatal */ }
      }
    }
  },

  getResumeCommand(): string {
    return 'codex resume --last'
  },

  getStrippedEnvKeys(): string[] {
    return ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']
  },
}

// --- Model Resolution ---

const CLAUDE_TO_CODEX_MAP: Record<string, string> = {
  'claude-opus-4-20250514': 'gpt-5.4',
  'claude-sonnet-4-20250514': 'gpt-5.4',
  'claude-haiku-4-5-20251001': 'o4-mini',
  'haiku': 'o4-mini',
  'sonnet': 'gpt-5.4',
  'opus': 'gpt-5.4',
}

function resolveCodexModel(model: string): string {
  return CLAUDE_TO_CODEX_MAP[model] ?? model
}

// --- Internal Utilities ---

function buildCodexEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  // Don't leak Anthropic keys to Codex processes
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

function runCliCommand(command: string, args: string[], cwd: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: buildCodexEnv(),
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
        console.warn('[CodexProvider] failed to kill timed-out CLI process:', (err as Error).message)
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
        finalizeReject(`Codex CLI timed out after ${timeout}ms${stderrText ? `: ${stderrText}` : ''}`)
        return
      }
      if (signal) {
        finalizeReject(`Codex CLI terminated by signal ${signal}${stderrText ? `: ${stderrText}` : ''}`)
        return
      }
      if (code === null) {
        finalizeReject(`Codex CLI exited unexpectedly${stderrText ? `: ${stderrText}` : ''}`)
        return
      }
      finalizeReject(stderrText || `codex exited with code ${code}`)
    })

    child.on('error', (err) => {
      const prefix = err.message?.trim() || 'Failed to start Codex CLI process'
      const stderrText = stderr.trim()
      finalizeReject(`${prefix}${stderrText ? `: ${stderrText}` : ''}`)
    })
  })
}

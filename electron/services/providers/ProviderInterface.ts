// Provider abstraction — Claude and Codex are peer implementations of this interface.

export type ProviderId = 'claude' | 'codex'

export interface ProviderConnection {
  providerId: ProviderId
  cliPath: string
  hasApiKey: boolean
  isAuthenticated: boolean
  authMode: 'api' | 'cli' | 'both' | 'none'
}

export interface ProviderBuildResult {
  command: string
  args: string[]
  contextFilePath: string
  env?: Record<string, string>
}

export interface ProviderRunPromptOpts {
  prompt: string
  systemPrompt?: string
  model?: string
  effort?: string
  maxTokens?: number
  cwd?: string
  timeoutMs?: number
  allowApiFallback?: boolean
}

export interface AgentRow {
  id: string
  name: string
  system_prompt: string
  model: string
  mcps: string
  shortcut: string | null
  provider?: string | null
}

export interface ProjectRow {
  id: string
  name: string
  path: string
  session_summary: string | null
}

export interface ProviderInterface {
  readonly id: ProviderId

  /** Resolve the CLI binary path */
  resolvePath(): string

  /** Verify CLI installation and authentication */
  verifyConnection(): Promise<ProviderConnection>

  /** Get cached connection (null if not yet verified) */
  getConnection(): ProviderConnection | null

  /** Clear all cached state */
  clearCache(): void

  /** Build the command + args for spawning an interactive agent terminal */
  buildCommand(agent: AgentRow, project: ProjectRow): Promise<ProviderBuildResult>

  /** Remove temp context file after session ends */
  cleanupContextFile(filePath: string): void

  /** Run a one-shot prompt and return the text result */
  runPrompt(opts: ProviderRunPromptOpts): Promise<string>

  /** The shell command to resume a session after Ctrl+C (e.g. 'claude -c') */
  getResumeCommand(): string

  /** Env var keys to strip from agent terminal environment */
  getStrippedEnvKeys(): string[]
}

// Thin facade — delegates to ClaudeProvider via the provider abstraction.
// All existing imports (verifyConnection, buildCommand, runPrompt, etc.) continue to work.

import { ClaudeProvider } from './providers/ClaudeProvider'
import type { ProviderConnection, ProviderRunPromptOpts, AgentRow, ProjectRow } from './providers/ProviderInterface'
import type { ClaudeConnection } from '../shared/types'

// Re-export types used by callers
export type { AgentRow, ProjectRow }
export type RunPromptOpts = ProviderRunPromptOpts

// --- Facade functions (delegate to ClaudeProvider) ---

export async function verifyConnection(): Promise<ClaudeConnection> {
  const conn = await ClaudeProvider.verifyConnection()
  return toClaudeConnection(conn)
}

export function getConnection(): ClaudeConnection | null {
  const conn = ClaudeProvider.getConnection()
  return conn ? toClaudeConnection(conn) : null
}

export function getClaudePath(): string {
  return ClaudeProvider.resolvePath()
}

export function clearCachedPath(): void {
  ClaudeProvider.clearCache()
}

export function clearCachedConnection(): void {
  ClaudeProvider.clearCache()
}

export async function runPrompt(opts: RunPromptOpts): Promise<string> {
  return ClaudeProvider.runPrompt(opts)
}

export async function buildCommand(agent: AgentRow, project: ProjectRow): Promise<{
  command: string
  args: string[]
  contextFilePath: string
  env?: Record<string, string>
}> {
  return ClaudeProvider.buildCommand(agent, project)
}

export function cleanupContextFile(filePath: string): void {
  ClaudeProvider.cleanupContextFile(filePath)
}

// --- Adapter: ProviderConnection -> ClaudeConnection ---

function toClaudeConnection(conn: ProviderConnection): ClaudeConnection {
  return {
    claudePath: conn.cliPath,
    hasApiKey: conn.hasApiKey,
    isAuthenticated: conn.isAuthenticated,
    authMode: conn.authMode,
  }
}

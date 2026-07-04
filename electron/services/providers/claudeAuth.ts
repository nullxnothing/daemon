/**
 * Anthropic credential-source introspection for the ARIA operator loop.
 *
 * runClaudeAgentTurn resolves its API key as stored (SecureKeyService) first,
 * then the shell environment. When the key in play is rejected, the operator
 * must tell the user which credential failed and how to fix it instead of
 * silently degrading to the tool-less CLI fallback. This module is pure so it
 * stays trivially testable; key VALUES never pass through it — sources only.
 */

export type ClaudeKeySource = 'stored' | 'env' | 'none'

/**
 * Mirror of runClaudeAgentTurn's key precedence: a stored key shadows the
 * shell environment. A throwing key reader (secure storage unavailable)
 * falls through to the environment, matching the runtime behavior.
 */
export function resolveClaudeKeySource(
  readStoredKey: () => string | null | undefined,
  env: Record<string, string | undefined>,
): ClaudeKeySource {
  try {
    if (readStoredKey()) return 'stored'
  } catch { /* secure storage unavailable — fall through to env */ }
  if (env.ANTHROPIC_API_KEY) return 'env'
  return 'none'
}

/**
 * True for Anthropic auth/permission rejections (invalid, revoked, or
 * disabled-org keys). Rate limits, overloads, and network failures are NOT
 * auth errors — those should keep their original error message.
 */
export function isAnthropicAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: unknown }).status
  if (status === 401 || status === 403) return true
  const message = err instanceof Error ? err.message : ''
  return /authentication_error|permission_error|invalid x-api-key|organization has been disabled/i.test(message)
}

/** Actionable user-facing explanation for an auth failure, keyed by credential source. */
export function describeClaudeAuthFailure(source: ClaudeKeySource): string {
  if (source === 'env') {
    return 'ARIA operator tools are unavailable: the ANTHROPIC_API_KEY inherited from your shell environment was rejected by the Anthropic API (invalid or disabled). Unset that environment variable or save a valid key in Settings > AI Providers to restore tools. Answering without tools for now.'
  }
  if (source === 'stored') {
    return 'ARIA operator tools are unavailable: the Anthropic API key saved in Settings was rejected (invalid or disabled). Replace it in Settings > AI Providers to restore tools. Answering without tools for now.'
  }
  return 'ARIA operator tools are unavailable: Anthropic API authentication failed. Add a valid API key in Settings > AI Providers to restore tools. Answering without tools for now.'
}

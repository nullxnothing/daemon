import { describe, it, expect } from 'vitest'
import {
  resolveClaudeKeySource,
  isAnthropicAuthError,
  describeClaudeAuthFailure,
} from '../../electron/services/providers/claudeAuth'

describe('resolveClaudeKeySource (mirrors runClaudeAgentTurn precedence)', () => {
  it('prefers the stored key over a shell env key when both exist', () => {
    const source = resolveClaudeKeySource(() => 'stored-key', { ANTHROPIC_API_KEY: 'env-key' })
    expect(source).toBe('stored')
  })

  it('falls back to the shell env key when no stored key exists', () => {
    expect(resolveClaudeKeySource(() => null, { ANTHROPIC_API_KEY: 'env-key' })).toBe('env')
    expect(resolveClaudeKeySource(() => undefined, { ANTHROPIC_API_KEY: 'env-key' })).toBe('env')
  })

  it('reports none when neither credential exists', () => {
    expect(resolveClaudeKeySource(() => null, {})).toBe('none')
  })

  it('treats an empty env value as absent', () => {
    expect(resolveClaudeKeySource(() => null, { ANTHROPIC_API_KEY: '' })).toBe('none')
  })

  it('falls through to env when secure storage throws', () => {
    const source = resolveClaudeKeySource(
      () => { throw new Error('keychain locked') },
      { ANTHROPIC_API_KEY: 'env-key' },
    )
    expect(source).toBe('env')
  })
})

describe('isAnthropicAuthError', () => {
  it('matches 401/403 SDK errors by status', () => {
    expect(isAnthropicAuthError(Object.assign(new Error('bad'), { status: 401 }))).toBe(true)
    expect(isAnthropicAuthError(Object.assign(new Error('bad'), { status: 403 }))).toBe(true)
  })

  it('matches auth error types by message when status is missing', () => {
    expect(isAnthropicAuthError(new Error('400 {"type":"authentication_error"}'))).toBe(true)
    expect(isAnthropicAuthError(new Error('permission_error: org restricted'))).toBe(true)
    expect(isAnthropicAuthError(new Error('invalid x-api-key'))).toBe(true)
    expect(isAnthropicAuthError(new Error('Your organization has been disabled.'))).toBe(true)
  })

  it('does not classify rate limits, overloads, or network failures as auth errors', () => {
    expect(isAnthropicAuthError(Object.assign(new Error('rate_limit_error'), { status: 429 }))).toBe(false)
    expect(isAnthropicAuthError(Object.assign(new Error('overloaded_error'), { status: 529 }))).toBe(false)
    expect(isAnthropicAuthError(new Error('ECONNRESET'))).toBe(false)
    expect(isAnthropicAuthError(null)).toBe(false)
    expect(isAnthropicAuthError('authentication_error')).toBe(false)
  })
})

describe('describeClaudeAuthFailure', () => {
  it('tells the user the SHELL key failed when the env credential was in play', () => {
    const msg = describeClaudeAuthFailure('env')
    expect(msg).toContain('ANTHROPIC_API_KEY')
    expect(msg).toContain('shell environment')
    expect(msg).toContain('Settings')
  })

  it('points at Settings when the stored key failed', () => {
    const msg = describeClaudeAuthFailure('stored')
    expect(msg).toContain('saved in Settings')
    expect(msg).not.toContain('shell environment')
  })

  it('gives a generic actionable message when no source is known', () => {
    const msg = describeClaudeAuthFailure('none')
    expect(msg).toContain('Settings')
  })

  it('never asks for or echoes key material', () => {
    for (const source of ['env', 'stored', 'none'] as const) {
      expect(describeClaudeAuthFailure(source)).not.toMatch(/sk-ant/i)
    }
  })
})

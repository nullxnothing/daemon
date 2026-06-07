import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/services/SecureKeyService', () => ({ getKey: vi.fn() }))
vi.mock('node:fs', async (orig) => {
  const actual = await orig<typeof import('node:fs')>()
  return { ...actual, default: { ...actual, existsSync: vi.fn(() => false) }, existsSync: vi.fn(() => false) }
})

import fs from 'node:fs'
import { getKey } from '../../electron/services/SecureKeyService'
import { getGlmEndpoint, resolveOperatorBackend, glmKeyMissing } from '../../electron/services/providers/glmConfig'

const mockGetKey = getKey as unknown as ReturnType<typeof vi.fn>
const mockExists = fs.existsSync as unknown as ReturnType<typeof vi.fn>

const ENV_KEYS = ['ZAI_API_KEY', 'ANTHROPIC_API_KEY', 'CODEX_API_KEY']
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k] }
  mockGetKey.mockReturnValue(null)
  mockExists.mockReturnValue(false)
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
  vi.clearAllMocks()
})

describe('resolveOperatorBackend precedence', () => {
  it('returns null when nothing is configured', () => {
    expect(resolveOperatorBackend()).toBeNull()
  })

  it('prefers glm when a Z.AI key is present', () => {
    mockGetKey.mockImplementation((n: string) => (n === 'ZAI_API_KEY' ? 'zk-123' : null))
    expect(resolveOperatorBackend()).toBe('glm')
  })

  it('falls back to claude when only an Anthropic key is present', () => {
    mockGetKey.mockImplementation((n: string) => (n === 'ANTHROPIC_API_KEY' ? 'sk-ant' : null))
    expect(resolveOperatorBackend()).toBe('claude')
  })

  it('falls back to codex when only codex auth.json exists', () => {
    mockExists.mockImplementation((p: string) => String(p).includes('auth.json'))
    expect(resolveOperatorBackend()).toBe('codex')
  })

  it('still prefers glm over claude and codex when all are present', () => {
    mockGetKey.mockReturnValue('present')
    mockExists.mockReturnValue(true)
    expect(resolveOperatorBackend()).toBe('glm')
  })

  it('reads the Z.AI key from the environment as a fallback', () => {
    process.env.ZAI_API_KEY = 'env-zk'
    expect(resolveOperatorBackend()).toBe('glm')
  })
})

describe('getGlmEndpoint', () => {
  it('returns null without a key', () => {
    expect(getGlmEndpoint()).toBeNull()
    expect(glmKeyMissing()).toBe(true)
  })

  it('returns the Anthropic-compatible z.ai endpoint with a key', () => {
    mockGetKey.mockImplementation((n: string) => (n === 'ZAI_API_KEY' ? 'zk-xyz' : null))
    const ep = getGlmEndpoint()
    expect(ep).toEqual({
      apiKey: 'zk-xyz',
      baseURL: 'https://api.z.ai/api/anthropic',
      model: 'glm-4.7',
    })
    expect(glmKeyMissing()).toBe(false)
  })
})

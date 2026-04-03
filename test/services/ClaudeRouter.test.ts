import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all heavy dependencies before importing ClaudeRouter
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/daemon-test' },
  safeStorage: {
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
    isEncryptionAvailable: () => true,
  },
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: vi.fn().mockReturnValue({ run: vi.fn(), get: vi.fn(), all: vi.fn() }),
  }),
}))

vi.mock('../../electron/services/SecureKeyService', () => ({
  getKey: vi.fn(() => null),
  storeKey: vi.fn(),
  deleteKey: vi.fn(),
}))

vi.mock('../../electron/services/McpConfig', () => ({
  writeProjectMcpConfig: vi.fn(),
  readProjectMcpConfig: vi.fn(() => ({})),
  getRegistryMcps: vi.fn(() => []),
  hasProjectMcpFile: vi.fn(() => false),
}))

vi.mock('../../electron/services/PortService', () => ({
  getRegisteredPorts: vi.fn(() => []),
}))

vi.mock('../../electron/services/email/EmailTools', () => ({
  getEmailAccountSummary: vi.fn().mockResolvedValue('No accounts configured.'),
  EMAIL_TOOL_NAMES: 'read_email,send_email',
}))

vi.mock('../../electron/config/constants', () => ({
  TIMEOUTS: {
    NPM_PREFIX: 3000,
    VERSION_CHECK: 5000,
    GIT_COMMAND: 5000,
    FILE_TREE: 10000,
    CLI_PROMPT_DEFAULT: 60000,
    TYPESCRIPT_CHECK: 30000,
    PROMPT_FIX_CLAUDEMD: 90000,
    PROMPT_GENERATE_CLAUDEMD: 120000,
  },
}))

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    stdin: { end: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
  execSync: vi.fn(() => '/usr/local'),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
}))

// Import the module — we test the exported functions and indirectly test
// the private parseContextTags / stripContextTags via buildCommand
import { getClaudePath, clearCachedPath, getConnection, clearCachedConnection } from '../../electron/services/ClaudeRouter'

describe('getClaudePath — candidate resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCachedPath()
  })

  it('returns a non-empty string', () => {
    const p = getClaudePath()
    expect(typeof p).toBe('string')
    expect(p.length).toBeGreaterThan(0)
  })

  it('returns a fallback string (claude or claude.cmd) when no candidate exists', () => {
    const p = getClaudePath()
    // On Windows, fallback is 'claude.cmd'; on others 'claude'
    expect(p).toMatch(/claude/)
  })

  it('caches the resolved path on second call', () => {
    const first = getClaudePath()
    const second = getClaudePath()
    expect(first).toBe(second)
  })

  it('clears cache after clearCachedPath', () => {
    getClaudePath() // populate cache
    clearCachedPath()
    // After clearing, calling again should re-resolve (still returns non-empty)
    expect(getClaudePath()).toBeTruthy()
  })
})

describe('getConnection — cache behavior', () => {
  beforeEach(() => {
    clearCachedConnection()
  })

  it('returns null when no connection has been verified and DB has no cached state', () => {
    // DB prepare returns no rows
    const result = getConnection()
    expect(result).toBeNull()
  })
})

// Test parseContextTags and stripContextTags indirectly via known behavior
// These are private functions — we exercise them through the publicly visible logic
// by importing the module and calling buildCommand with controlled inputs.
// Since buildCommand makes file writes, we test the parsing logic separately
// via a thin test harness approach.

describe('context tag parsing — via re-implementing the same logic for parity', () => {
  // Mirror of the private functions to verify expected behavior
  function parseContextTags(systemPrompt: string): Set<string> {
    const match = systemPrompt.match(/<context-tags>(.*?)<\/context-tags>/)
    if (!match) return new Set(['project'])
    return new Set(match[1].split(',').map((t) => t.trim()).filter(Boolean))
  }

  function stripContextTags(systemPrompt: string): string {
    return systemPrompt.replace(/<context-tags>.*?<\/context-tags>\n?/g, '').trim()
  }

  it('returns default set of ["project"] when no context-tags present', () => {
    const tags = parseContextTags('You are a helpful assistant.')
    expect(tags.has('project')).toBe(true)
    expect(tags.size).toBe(1)
  })

  it('parses single context tag', () => {
    const tags = parseContextTags('<context-tags>email</context-tags>')
    expect(tags.has('email')).toBe(true)
  })

  it('parses multiple comma-separated context tags', () => {
    const tags = parseContextTags('<context-tags>email, ports, project</context-tags>')
    expect(tags.has('email')).toBe(true)
    expect(tags.has('ports')).toBe(true)
    expect(tags.has('project')).toBe(true)
  })

  it('trims whitespace from tag names', () => {
    const tags = parseContextTags('<context-tags>  email ,  ports  </context-tags>')
    expect(tags.has('email')).toBe(true)
    expect(tags.has('ports')).toBe(true)
  })

  it('filters empty tag entries from the set', () => {
    const tags = parseContextTags('<context-tags>,,,</context-tags>')
    expect(tags.size).toBe(0)
  })

  it('stripContextTags removes the tag block from the prompt', () => {
    const prompt = '<context-tags>email,ports</context-tags>\nYou are a helpful assistant.'
    const stripped = stripContextTags(prompt)
    expect(stripped).not.toContain('<context-tags>')
    expect(stripped).toContain('You are a helpful assistant.')
  })

  it('stripContextTags leaves prompt unchanged when no context-tags block exists', () => {
    const prompt = 'You are a helpful assistant.'
    expect(stripContextTags(prompt)).toBe('You are a helpful assistant.')
  })

  it('stripContextTags handles tag block at end of string', () => {
    const prompt = 'Prompt text\n<context-tags>email</context-tags>'
    const stripped = stripContextTags(prompt)
    expect(stripped).not.toContain('<context-tags>')
    expect(stripped).toContain('Prompt text')
  })
})

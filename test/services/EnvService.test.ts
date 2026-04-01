import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExistsSync, mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    readdirSync: vi.fn().mockReturnValue([]),
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  readdirSync: vi.fn().mockReturnValue([]),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]), run: vi.fn(), get: vi.fn() }),
  }),
}))

import { parseEnvFile, writeEnvVar, deleteEnvVar, detectSecret } from '../../electron/services/EnvService'

describe('parseEnvFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array for non-existent file', () => {
    mockExistsSync.mockReturnValue(false)
    const result = parseEnvFile('/nonexistent/.env')
    expect(result).toEqual([])
  })

  it('parses basic KEY=value pairs', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('FOO=bar\nBAZ=qux')
    const vars = parseEnvFile('/project/.env')
    const entries = vars.filter((v) => !v.isComment)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ key: 'FOO', value: 'bar' })
    expect(entries[1]).toMatchObject({ key: 'BAZ', value: 'qux' })
  })

  it('strips double quotes from values', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('API_KEY="my-secret-key"')
    const vars = parseEnvFile('/project/.env')
    const entry = vars.find((v) => v.key === 'API_KEY')
    expect(entry?.value).toBe('my-secret-key')
  })

  it('strips single quotes from values', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue("TOKEN='abc123'")
    const vars = parseEnvFile('/project/.env')
    const entry = vars.find((v) => v.key === 'TOKEN')
    expect(entry?.value).toBe('abc123')
  })

  it('handles export KEY=value prefix', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('export MY_VAR=hello')
    const vars = parseEnvFile('/project/.env')
    const entry = vars.find((v) => v.key === 'MY_VAR')
    expect(entry).toBeDefined()
    expect(entry?.value).toBe('hello')
  })

  it('marks comment lines as isComment=true', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('# This is a comment\nFOO=bar')
    const vars = parseEnvFile('/project/.env')
    expect(vars[0].isComment).toBe(true)
    expect(vars[1].isComment).toBe(false)
  })

  it('marks empty lines as comments', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('\nFOO=bar')
    const vars = parseEnvFile('/project/.env')
    expect(vars[0].isComment).toBe(true)
  })
})

describe('writeEnvVar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates existing key in place', () => {
    mockReadFileSync.mockReturnValue('FOO=old\nBAR=baz')
    writeEnvVar('/project/.env', 'FOO', 'new')
    const written = mockWriteFileSync.mock.calls[0][1] as string
    expect(written).toContain('FOO=new')
    expect(written).toContain('BAR=baz')
    expect(written).not.toContain('FOO=old')
  })

  it('appends when key is not found', () => {
    mockReadFileSync.mockReturnValue('FOO=bar')
    writeEnvVar('/project/.env', 'NEW_KEY', 'newval')
    const written = mockWriteFileSync.mock.calls[0][1] as string
    expect(written).toContain('FOO=bar')
    expect(written).toContain('NEW_KEY=newval')
  })

  it('preserves export prefix when updating', () => {
    mockReadFileSync.mockReturnValue('export MY_VAR=old')
    writeEnvVar('/project/.env', 'MY_VAR', 'new')
    const written = mockWriteFileSync.mock.calls[0][1] as string
    expect(written).toContain('export MY_VAR=new')
  })
})

describe('deleteEnvVar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('removes only the target key', () => {
    mockReadFileSync.mockReturnValue('FOO=one\nBAR=two\nBAZ=three')
    deleteEnvVar('/project/.env', 'BAR')
    const written = mockWriteFileSync.mock.calls[0][1] as string
    expect(written).toContain('FOO=one')
    expect(written).not.toContain('BAR=two')
    expect(written).toContain('BAZ=three')
  })

  it('is a no-op when key does not exist', () => {
    mockReadFileSync.mockReturnValue('FOO=one\nBAR=two')
    deleteEnvVar('/project/.env', 'MISSING')
    const written = mockWriteFileSync.mock.calls[0][1] as string
    expect(written).toContain('FOO=one')
    expect(written).toContain('BAR=two')
  })

  it('handles export prefix when deleting', () => {
    mockReadFileSync.mockReturnValue('export SECRET_KEY=abc\nFOO=bar')
    deleteEnvVar('/project/.env', 'SECRET_KEY')
    const written = mockWriteFileSync.mock.calls[0][1] as string
    expect(written).not.toContain('SECRET_KEY')
    expect(written).toContain('FOO=bar')
  })
})

describe('detectSecret', () => {
  it('detects _KEY pattern', () => {
    const result = detectSecret('API_KEY')
    expect(result.isSecret).toBe(true)
    expect(result.label).toBe('_KEY')
  })

  it('detects _TOKEN pattern', () => {
    const result = detectSecret('GITHUB_TOKEN')
    expect(result.isSecret).toBe(true)
    expect(result.label).toBe('_TOKEN')
  })

  it('detects _SECRET pattern', () => {
    const result = detectSecret('CLIENT_SECRET')
    expect(result.isSecret).toBe(true)
    expect(result.label).toBe('_SECRET')
  })

  it('detects sk- prefix (OpenAI-style keys)', () => {
    const result = detectSecret('sk-abc123')
    expect(result.isSecret).toBe(true)
  })

  it('returns isSecret=false for non-secret keys', () => {
    const result = detectSecret('NODE_ENV')
    expect(result.isSecret).toBe(false)
    expect(result.label).toBeNull()
  })

  it('is case-insensitive in detection', () => {
    const result = detectSecret('my_secret')
    expect(result.isSecret).toBe(true)
  })
})

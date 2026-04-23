import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'

// vi.hoisted ensures these refs are initialized before vi.mock factory runs
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
    mkdirSync: vi.fn(),
    statSync: vi.fn().mockReturnValue({ size: 0 }),
    createWriteStream: vi.fn().mockReturnValue({ write: vi.fn(), end: vi.fn(), on: vi.fn() }),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

vi.mock('node:os', () => ({
  default: { homedir: () => '/home/testuser' },
  homedir: () => '/home/testuser',
}))

const { mockPrepare, mockDbRun } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockDbRun: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({ prepare: mockPrepare }),
}))

import { toggleProjectMcp, getProjectMcps } from '../../electron/services/McpConfig'

const FAKE_PROJECT = '/home/testuser/projects/myapp'
// Use path.join so the expected path uses the OS separator, matching what the service builds
const MCP_JSON_PATH = path.join(FAKE_PROJECT, '.mcp.json')

const REGISTRY_CONFIG = JSON.stringify({ command: 'npx', args: ['-y', 'my-mcp-server'] })

function setupRegistryMcp(name = 'my-mcp') {
  mockPrepare.mockImplementation((sql: string) => {
    if (sql.includes('SELECT config FROM mcp_registry WHERE name')) {
      return { get: vi.fn().mockReturnValue({ config: REGISTRY_CONFIG }) }
    }
    if (sql.includes('SELECT * FROM mcp_registry')) {
      return { all: vi.fn().mockReturnValue([{ name, config: REGISTRY_CONFIG, description: 'Test MCP', is_global: 0 }]) }
    }
    return { run: mockDbRun, get: vi.fn().mockReturnValue(undefined), all: vi.fn().mockReturnValue([]) }
  })
}

describe('toggleProjectMcp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enables an MCP — writes mcpServers entry to .mcp.json', () => {
    mockExistsSync.mockReturnValue(false)
    setupRegistryMcp('my-mcp')

    toggleProjectMcp(FAKE_PROJECT, 'my-mcp', true)

    expect(mockWriteFileSync).toHaveBeenCalledOnce()
    const [writePath, content] = mockWriteFileSync.mock.calls[0]
    expect(writePath).toBe(MCP_JSON_PATH)

    const parsed = JSON.parse(content as string)
    expect(parsed.mcpServers['my-mcp']).toEqual(JSON.parse(REGISTRY_CONFIG))
  })

  it('disables an MCP — removes entry from .mcp.json', () => {
    const existingConfig = {
      mcpServers: {
        'my-mcp': { command: 'npx', args: ['-y', 'my-mcp-server'] },
        'other-mcp': { command: 'node', args: ['other.js'] },
      },
    }
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(existingConfig))
    setupRegistryMcp('my-mcp')

    toggleProjectMcp(FAKE_PROJECT, 'my-mcp', false)

    const [, content] = mockWriteFileSync.mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.mcpServers['my-mcp']).toBeUndefined()
    expect(parsed.mcpServers['other-mcp']).toBeDefined()
  })

  it('throws when enabling an MCP not in registry', () => {
    mockExistsSync.mockReturnValue(false)
    mockPrepare.mockReturnValue({ get: vi.fn().mockReturnValue(undefined), all: vi.fn().mockReturnValue([]) })

    expect(() => toggleProjectMcp(FAKE_PROJECT, 'unknown-mcp', true)).toThrow('not found in registry')
  })

  it('handles missing .mcp.json without crashing when disabling', () => {
    mockExistsSync.mockReturnValue(false)
    setupRegistryMcp('ghost-mcp')

    expect(() => toggleProjectMcp(FAKE_PROJECT, 'ghost-mcp', false)).not.toThrow()

    const [, content] = mockWriteFileSync.mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.mcpServers['ghost-mcp']).toBeUndefined()
  })

  it('handles corrupted .mcp.json without crashing', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{ this is: not valid json !!!')
    setupRegistryMcp('my-mcp')

    expect(() => toggleProjectMcp(FAKE_PROJECT, 'my-mcp', true)).not.toThrow()

    const [, content] = mockWriteFileSync.mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.mcpServers['my-mcp']).toBeDefined()
  })
})

describe('getProjectMcps', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns enabled=true for MCPs present in .mcp.json', () => {
    const existingConfig = {
      mcpServers: {
        'active-mcp': { command: 'npx', args: ['active'] },
      },
    }
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(existingConfig))

    mockPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([]),
      run: vi.fn(),
    })

    const result = getProjectMcps(FAKE_PROJECT)
    const active = result.find((m) => m.name === 'active-mcp')
    expect(active).toBeDefined()
    expect(active?.enabled).toBe(true)
    expect(active?.source).toBe('project')
  })

  it('returns enabled=false for registry MCPs not in .mcp.json', () => {
    mockExistsSync.mockReturnValue(false)

    mockPrepare.mockReturnValue({
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([
        { name: 'registry-mcp', config: REGISTRY_CONFIG, description: 'A registry tool', is_global: 0 },
      ]),
      run: vi.fn(),
    })

    const result = getProjectMcps(FAKE_PROJECT)
    const registryEntry = result.find((m) => m.name === 'registry-mcp')
    expect(registryEntry).toBeDefined()
    expect(registryEntry?.enabled).toBe(false)
    expect(registryEntry?.source).toBe('registry')
  })

  it('project MCPs are isolated — global ~/.claude.json is not read for getProjectMcps', () => {
    mockExistsSync.mockReturnValue(false)
    mockPrepare.mockReturnValue({ get: vi.fn(), all: vi.fn().mockReturnValue([]), run: vi.fn() })

    getProjectMcps(FAKE_PROJECT)

    // readFileSync should only be called for the project .mcp.json, not ~/.claude.json
    const readCalls = mockReadFileSync.mock.calls.map((c) => c[0] as string)
    const globalJsonRead = readCalls.some((p) => p.includes('.claude.json'))
    expect(globalJsonRead).toBe(false)
  })

  it('returns empty array when no .mcp.json and no registry entries', () => {
    mockExistsSync.mockReturnValue(false)
    mockPrepare.mockReturnValue({ get: vi.fn(), all: vi.fn().mockReturnValue([]), run: vi.fn() })

    const result = getProjectMcps(FAKE_PROJECT)
    expect(result).toEqual([])
  })
})

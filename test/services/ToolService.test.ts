import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockRmSync,
  mockReaddirSync,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockRmSync: vi.fn(),
  mockReaddirSync: vi.fn().mockReturnValue([]),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    rmSync: mockRmSync,
    readdirSync: mockReaddirSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  rmSync: mockRmSync,
  readdirSync: mockReaddirSync,
}))

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => '/tmp/daemon-userdata',
  },
}))

const { mockPrepare, mockRun } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockRun: vi.fn(),
}))

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({ prepare: mockPrepare }),
}))

import { scaffoldTool, importTool, deleteTool, buildRunCommand } from '../../electron/services/ToolService'
import type { ToolRow } from '../../electron/shared/types'

const TOOLS_BASE = '/tmp/daemon-userdata/tools'

function makeToolRow(overrides: Partial<ToolRow> = {}): ToolRow {
  return {
    id: 'tool-id-1',
    name: 'My Tool',
    description: null,
    category: 'general',
    language: 'typescript',
    entrypoint: 'index.ts',
    tool_path: `${TOOLS_BASE}/my-tool`,
    icon: '',
    version: '1.0.0',
    author: null,
    tags: '[]',
    config: '{}',
    last_run_at: null,
    run_count: 0,
    enabled: 1,
    sort_order: 0,
    created_at: Date.now(),
    ...overrides,
  }
}

describe('scaffoldTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // tools base dir exists, new tool dir does NOT
    mockExistsSync.mockImplementation((p: string) => {
      if (p === TOOLS_BASE) return true
      return false
    })
    const createdRow = makeToolRow()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('INSERT INTO tools')) return { run: mockRun }
      if (sql.includes('SELECT * FROM tools WHERE id')) return { get: vi.fn().mockReturnValue(createdRow) }
      return { run: mockRun, get: vi.fn(), all: vi.fn() }
    })
  })

  it('creates a directory with the slugified tool name', () => {
    scaffoldTool({ name: 'My Cool Tool' })
    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('my-cool-tool'),
      expect.objectContaining({ recursive: true }),
    )
  })

  it('slugifies name — strips special characters', () => {
    scaffoldTool({ name: 'Hello @World! 2024' })
    const dirArg = mockMkdirSync.mock.calls[0][0] as string
    // Split on either separator for cross-platform compatibility
    const slug = dirArg.split(/[/\\]/).pop()!
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(slug).not.toContain('@')
    expect(slug).not.toContain('!')
  })

  it('writes manifest.json and entrypoint file', () => {
    scaffoldTool({ name: 'Test Tool', language: 'typescript' })
    const writtenPaths = mockWriteFileSync.mock.calls.map((c) => c[0] as string)
    expect(writtenPaths.some((p) => p.endsWith('manifest.json'))).toBe(true)
    expect(writtenPaths.some((p) => p.endsWith('index.ts'))).toBe(true)
  })

  it('uses index.ts entrypoint for typescript', () => {
    scaffoldTool({ name: 'TS Tool', language: 'typescript' })
    const writtenPaths = mockWriteFileSync.mock.calls.map((c) => c[0] as string)
    expect(writtenPaths.some((p) => p.endsWith('index.ts'))).toBe(true)
  })

  it('uses main.py entrypoint for python', () => {
    scaffoldTool({ name: 'Py Tool', language: 'python' })
    const writtenPaths = mockWriteFileSync.mock.calls.map((c) => c[0] as string)
    expect(writtenPaths.some((p) => p.endsWith('main.py'))).toBe(true)
  })

  it('uses run.sh entrypoint for shell', () => {
    scaffoldTool({ name: 'Shell Tool', language: 'shell' })
    const writtenPaths = mockWriteFileSync.mock.calls.map((c) => c[0] as string)
    expect(writtenPaths.some((p) => p.endsWith('run.sh'))).toBe(true)
  })

  it('uses index.js entrypoint for javascript', () => {
    scaffoldTool({ name: 'JS Tool', language: 'javascript' })
    const writtenPaths = mockWriteFileSync.mock.calls.map((c) => c[0] as string)
    expect(writtenPaths.some((p) => p.endsWith('index.js'))).toBe(true)
  })

  it('throws if tool directory already exists', () => {
    mockExistsSync.mockReturnValue(true)
    expect(() => scaffoldTool({ name: 'Existing Tool' })).toThrow('already exists')
  })
})

describe('importTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM tools WHERE tool_path')) return { get: vi.fn().mockReturnValue(undefined) }
      if (sql.includes('INSERT INTO tools')) return { run: mockRun }
      if (sql.includes('SELECT * FROM tools WHERE id')) return { get: vi.fn().mockReturnValue(makeToolRow()) }
      return { run: mockRun, get: vi.fn(), all: vi.fn() }
    })
  })

  it('rejects when manifest.json is missing', () => {
    mockExistsSync.mockReturnValue(false)
    expect(() => importTool('/some/tool/dir')).toThrow('No manifest.json')
  })

  it('rejects manifest missing name field', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json')) return true
      return false
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ entrypoint: 'index.ts' }))
    expect(() => importTool('/some/tool/dir')).toThrow('Invalid manifest')
  })

  it('rejects manifest missing entrypoint field', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json')) return true
      return false
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'My Tool' }))
    expect(() => importTool('/some/tool/dir')).toThrow('Invalid manifest')
  })

  it('rejects when entrypoint file does not exist', () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('manifest.json')) return true
      return false
    })
    mockReadFileSync.mockReturnValue(JSON.stringify({ name: 'My Tool', entrypoint: 'index.ts' }))
    expect(() => importTool('/some/tool/dir')).toThrow('Entrypoint not found')
  })

  it('successfully imports a valid tool', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify({
      name: 'Valid Tool',
      entrypoint: 'index.ts',
      language: 'typescript',
      version: '1.0.0',
      description: 'A valid tool',
      category: 'general',
    }))

    const result = importTool('/some/tool/dir')
    expect(result).toBeDefined()
    expect(mockRun).toHaveBeenCalled()
  })
})

describe('deleteTool', () => {
  beforeEach(() => vi.clearAllMocks())

  it('with removeFiles=false — does not remove directory from disk', () => {
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT tool_path')) return { get: vi.fn().mockReturnValue({ tool_path: `${TOOLS_BASE}/my-tool` }) }
      if (sql.includes('DELETE FROM tools')) return { run: mockRun }
      return { run: mockRun, get: vi.fn() }
    })
    mockExistsSync.mockReturnValue(true)

    deleteTool('tool-id-1', false)

    expect(mockRmSync).not.toHaveBeenCalled()
    expect(mockRun).toHaveBeenCalled()
  })

  it('with removeFiles=true — removes tool directory from disk', () => {
    const toolPath = `${TOOLS_BASE}/my-tool`
    mockExistsSync.mockReturnValue(true)
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT tool_path')) return { get: vi.fn().mockReturnValue({ tool_path: toolPath }) }
      if (sql.includes('DELETE FROM tools')) return { run: mockRun }
      return { run: mockRun, get: vi.fn() }
    })

    deleteTool('tool-id-1', true)

    expect(mockRmSync).toHaveBeenCalledWith(toolPath, { recursive: true, force: true })
    expect(mockRun).toHaveBeenCalled()
  })

  it('with removeFiles=true but path does not exist — skips rmSync', () => {
    const toolPath = `${TOOLS_BASE}/vanished-tool`
    mockExistsSync.mockReturnValue(false)
    mockPrepare.mockImplementation((sql: string) => {
      if (sql.includes('SELECT tool_path')) return { get: vi.fn().mockReturnValue({ tool_path: toolPath }) }
      if (sql.includes('DELETE FROM tools')) return { run: mockRun }
      return { run: mockRun, get: vi.fn() }
    })

    deleteTool('tool-id-1', true)

    expect(mockRmSync).not.toHaveBeenCalled()
  })
})

describe('buildRunCommand', () => {
  it('returns npx tsx for typescript', () => {
    const result = buildRunCommand(makeToolRow({ language: 'typescript', entrypoint: 'index.ts' }))
    expect(result.command).toBe('npx')
    expect(result.args).toEqual(['tsx', 'index.ts'])
  })

  it('returns node for javascript', () => {
    const result = buildRunCommand(makeToolRow({ language: 'javascript', entrypoint: 'index.js' }))
    expect(result.command).toBe('node')
    expect(result.args).toEqual(['index.js'])
  })

  it('returns python for python', () => {
    const result = buildRunCommand(makeToolRow({ language: 'python', entrypoint: 'main.py' }))
    expect(result.command).toBe('python')
    expect(result.args).toEqual(['main.py'])
  })

  it('returns bash or powershell for shell depending on platform', () => {
    const result = buildRunCommand(makeToolRow({ language: 'shell', entrypoint: 'run.sh' }))
    expect(['bash', 'powershell']).toContain(result.command)
  })

  it('returns node for unknown language', () => {
    const result = buildRunCommand(makeToolRow({ language: 'cobol', entrypoint: 'main.cob' }))
    expect(result.command).toBe('node')
    expect(result.args).toEqual(['main.cob'])
  })
})

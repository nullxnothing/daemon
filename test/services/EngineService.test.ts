import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/daemon-test' },
}))

// Capture prepare mock at hoisted level so we can inspect SQL queries
const mockPrepare = vi.fn()

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: mockPrepare,
  }),
}))

vi.mock('../../electron/services/PortService', () => ({
  getRegisteredPorts: vi.fn(() => [
    { port: 3000, serviceName: 'dev-server', projectName: 'MyApp' },
  ]),
}))

vi.mock('../../electron/services/ClaudeRouter', () => ({
  runPrompt: vi.fn().mockResolvedValue('mocked AI response'),
  getConnection: vi.fn(() => null),
  verifyConnection: vi.fn().mockResolvedValue({ isAuthenticated: true, hasApiKey: false, authMode: 'cli' }),
}))

vi.mock('../../electron/services/LogService', () => ({
  LogService: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('../../electron/config/constants', () => ({
  TIMEOUTS: {
    GIT_COMMAND: 5000,
    FILE_TREE: 10000,
    CLI_PROMPT_DEFAULT: 60000,
    TYPESCRIPT_CHECK: 30000,
    PROMPT_FIX_CLAUDEMD: 90000,
    PROMPT_GENERATE_CLAUDEMD: 120000,
  },
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: any, cb: Function) => {
    cb(null, { stdout: 'main', stderr: '' })
  }),
  promisify: vi.fn((fn: any) => fn),
}))

import { getContext, runAction } from '../../electron/services/EngineService'

// Helper: build a prepare mock that handles the key SQL queries in buildContext
function buildContextPrepare({
  projects = [],
  sessionCounts = [],
  activeAgents = [],
  recentErrors = [],
  userProfile = [],
}: {
  projects?: object[]
  sessionCounts?: Array<{ project_id: string; session_count: number }>
  activeAgents?: object[]
  recentErrors?: object[]
  userProfile?: object[]
} = {}) {
  return (sql: string) => {
    if (sql.includes('FROM projects ORDER BY last_active')) {
      return { all: vi.fn().mockReturnValue(projects) }
    }
    if (sql.includes('FROM active_sessions GROUP BY project_id')) {
      return { all: vi.fn().mockReturnValue(sessionCounts) }
    }
    if (sql.includes('JOIN agents') && sql.includes('active_sessions')) {
      return { all: vi.fn().mockReturnValue(activeAgents) }
    }
    if (sql.includes('FROM error_logs')) {
      return { all: vi.fn().mockReturnValue(recentErrors) }
    }
    if (sql.includes("key LIKE 'user_%'")) {
      return { all: vi.fn().mockReturnValue(userProfile) }
    }
    return { all: vi.fn().mockReturnValue([]), run: vi.fn(), get: vi.fn() }
  }
}

describe('buildContext — session count aggregation (N+1 fix)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aggregates session counts from a separate query, not per-project fetches', async () => {
    const projects = [
      { id: 'p1', name: 'App1', path: '/projects/app1', status: 'active', session_summary: null },
      { id: 'p2', name: 'App2', path: '/projects/app2', status: 'idle', session_summary: null },
    ]
    const sessionCounts = [
      { project_id: 'p1', session_count: 3 },
      { project_id: 'p2', session_count: 1 },
    ]

    mockPrepare.mockImplementation(buildContextPrepare({ projects, sessionCounts }))

    const ctx = await getContext()

    const p1 = ctx.projects.find((p) => p.id === 'p1')
    const p2 = ctx.projects.find((p) => p.id === 'p2')
    expect(p1?.activeSessions).toBe(3)
    expect(p2?.activeSessions).toBe(1)
  })

  it('defaults activeSessions to 0 for projects not in sessionCountMap', async () => {
    const projects = [
      { id: 'p1', name: 'App1', path: '/projects/app1', status: 'active', session_summary: null },
    ]

    // No session count rows — p1 should default to 0
    mockPrepare.mockImplementation(buildContextPrepare({ projects, sessionCounts: [] }))

    const ctx = await getContext()
    expect(ctx.projects[0].activeSessions).toBe(0)
  })

  it('uses a single GROUP BY query for session counts, not one query per project', async () => {
    const projects = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      name: `App${i}`,
      path: `/projects/app${i}`,
      status: 'active',
      session_summary: null,
    }))

    mockPrepare.mockImplementation(buildContextPrepare({ projects }))

    await getContext()

    // The GROUP BY query should appear exactly once
    const groupByCallCount = mockPrepare.mock.calls.filter(([sql]: [string]) =>
      sql.includes('GROUP BY project_id')
    ).length
    expect(groupByCallCount).toBe(1)
  })
})

describe('buildContext — error_logs query uses created_at column', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses created_at in ORDER BY (not a bare "timestamp" column)', async () => {
    mockPrepare.mockImplementation(buildContextPrepare())

    await getContext()

    const errorLogCall = mockPrepare.mock.calls.find(([sql]: [string]) =>
      sql.includes('error_logs')
    )

    expect(errorLogCall).toBeDefined()
    const sql = errorLogCall![0] as string
    // Correct: ORDER BY created_at (the actual column name)
    expect(sql).toContain('ORDER BY created_at')
    // Must not ORDER BY a raw "timestamp" column that doesn't exist
    expect(sql).not.toMatch(/ORDER BY timestamp\b/)
  })

  it('aliases created_at as timestamp in the SELECT for the context shape', async () => {
    mockPrepare.mockImplementation(buildContextPrepare())

    await getContext()

    const errorLogCall = mockPrepare.mock.calls.find(([sql]: [string]) =>
      sql.includes('error_logs')
    )
    const sql = errorLogCall![0] as string
    // created_at AS timestamp provides the .timestamp field on result rows
    expect(sql).toContain('created_at AS timestamp')
  })
})

describe('buildContext — context shape', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns expected top-level keys', async () => {
    mockPrepare.mockImplementation(buildContextPrepare())
    const ctx = await getContext()
    expect(ctx).toHaveProperty('projects')
    expect(ctx).toHaveProperty('activeAgents')
    expect(ctx).toHaveProperty('recentErrors')
    expect(ctx).toHaveProperty('portMap')
    expect(ctx).toHaveProperty('userProfile')
  })

  it('returns empty projects array when DB has no projects', async () => {
    mockPrepare.mockImplementation(buildContextPrepare({ projects: [] }))
    const ctx = await getContext()
    expect(ctx.projects).toEqual([])
  })
})

describe('runAction — unknown action', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok: false with unknown action error', async () => {
    mockPrepare.mockImplementation(buildContextPrepare())
    const result = await runAction({ type: 'nonexistent-action' as any })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/unknown action/i)
  })
})

describe('runAction — explain-error', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok: false when no error text provided', async () => {
    mockPrepare.mockImplementation(buildContextPrepare())
    const result = await runAction({ type: 'explain-error', payload: {} })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/no error text/i)
  })
})

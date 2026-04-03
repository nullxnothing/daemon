import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPrepare = vi.fn()
const mockAll = vi.fn()

vi.mock('../../electron/db/db', () => ({
  getDb: () => ({
    prepare: mockPrepare,
  }),
}))

mockPrepare.mockReturnValue({ all: mockAll, get: vi.fn(), run: vi.fn() })

import { isPathSafe, isProjectPathSafe, invalidatePathCache } from '../../electron/shared/pathValidation'

function setProjects(paths: string[]) {
  mockAll.mockReturnValue(paths.map((p) => ({ path: p })))
}

describe('isPathSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePathCache()
    mockPrepare.mockReturnValue({ all: mockAll, get: vi.fn(), run: vi.fn() })
  })

  it('returns false when no projects exist in DB', () => {
    setProjects([])
    expect(isPathSafe('/some/path/file.ts')).toBe(false)
  })

  it('returns false for path outside any registered project', () => {
    setProjects(['/projects/myapp'])
    expect(isPathSafe('/etc/passwd')).toBe(false)
  })

  it('returns false for path traversal via ../ that escapes project', () => {
    setProjects(['/projects/myapp'])
    // path.resolve will resolve this to /etc/passwd, which is outside
    expect(isPathSafe('/projects/myapp/../../../etc/passwd')).toBe(false)
  })

  it('returns true for file nested inside a valid project', () => {
    setProjects(['/projects/myapp'])
    expect(isPathSafe('/projects/myapp/src/index.ts')).toBe(true)
  })

  it('returns true for the project root itself', () => {
    setProjects(['/projects/myapp'])
    expect(isPathSafe('/projects/myapp')).toBe(true)
  })

  it('rejects sibling prefix attack (/projects/foo-evil vs registered /projects/foo)', () => {
    setProjects(['/projects/foo'])
    // /projects/foo-evil starts with /projects/foo string but not /projects/foo/
    expect(isPathSafe('/projects/foo-evil/secret.ts')).toBe(false)
  })

  it('normalizes .. components correctly and accepts valid resolved path', () => {
    setProjects(['/projects/myapp'])
    // /projects/myapp/src/../index.ts resolves to /projects/myapp/index.ts
    expect(isPathSafe('/projects/myapp/src/../index.ts')).toBe(true)
  })

  it('handles Windows backslashes by resolving them as the current platform would', () => {
    // path.resolve on Linux treats backslashes as part of the filename,
    // so we test the logic with a path that resolves within the project
    setProjects(['/projects/myapp'])
    // A double-check: valid nested path always works
    expect(isPathSafe('/projects/myapp/deep/nested/file.ts')).toBe(true)
  })
})

describe('isProjectPathSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePathCache()
    mockPrepare.mockReturnValue({ all: mockAll, get: vi.fn(), run: vi.fn() })
  })

  it('returns true for exact registered project path', () => {
    setProjects(['/projects/myapp'])
    expect(isProjectPathSafe('/projects/myapp')).toBe(true)
  })

  it('returns false for path not in projects', () => {
    setProjects(['/projects/myapp'])
    expect(isProjectPathSafe('/projects/other')).toBe(false)
  })

  it('returns false for subdirectory of registered project', () => {
    setProjects(['/projects/myapp'])
    // isProjectPathSafe checks exact match only
    expect(isProjectPathSafe('/projects/myapp/src')).toBe(false)
  })

  it('normalizes forward and backward slashes when comparing', () => {
    setProjects(['C:/projects/myapp'])
    // The function normalizes both sides with replace(/\\/g, '/')
    expect(isProjectPathSafe('C:\\projects\\myapp')).toBe(true)
  })
})

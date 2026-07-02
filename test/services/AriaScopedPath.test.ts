import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveScopedPath } from '../../electron/services/aria/tools/shared'

// File-read tools (read_file / search_files / list_project_tree) auto-run at risk 'read',
// including for external bridge agents that supply their own project root. So the shared path
// resolver is a security boundary: it must reject path escapes AND refuse to surface secret
// files (.env, keypairs, key material) even when they sit inside the root.

let root: string

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-scope-'))
  fs.writeFileSync(path.join(root, 'ok.txt'), 'fine')
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=1')
  fs.writeFileSync(path.join(root, '.env.local'), 'SECRET=2')
  fs.writeFileSync(path.join(root, 'keypair.json'), '[1,2,3]')
  fs.writeFileSync(path.join(root, 'server.key'), 'priv')
})

afterAll(() => {
  try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* best-effort */ }
})

describe('resolveScopedPath — containment + secret denial', () => {
  it('resolves an ordinary in-root file', () => {
    expect(resolveScopedPath('ok.txt', root)).toBe(path.join(root, 'ok.txt'))
  })

  it('rejects a parent-traversal escape', () => {
    // Forward slash is a separator on every platform, so this is always an escape.
    expect(() => resolveScopedPath('../outside.txt', root)).toThrow(/escapes/i)
    // Backslash is only a path separator on Windows; on POSIX it's an ordinary
    // filename character (so the path stays inside root). Only assert the escape
    // where the separator semantics make it one.
    if (path.sep === '\\') {
      expect(() => resolveScopedPath('..\\..\\outside.txt', root)).toThrow(/escapes/i)
    }
  })

  it('refuses .env and .env.local', () => {
    expect(() => resolveScopedPath('.env', root)).toThrow(/secret-bearing/i)
    expect(() => resolveScopedPath('.env.local', root)).toThrow(/secret-bearing/i)
  })

  it('refuses keypair json and key material', () => {
    expect(() => resolveScopedPath('keypair.json', root)).toThrow(/secret-bearing/i)
    expect(() => resolveScopedPath('server.key', root)).toThrow(/secret-bearing/i)
  })

  it('throws when no project root is set', () => {
    expect(() => resolveScopedPath('anything', null)).toThrow(/No active project/i)
  })
})

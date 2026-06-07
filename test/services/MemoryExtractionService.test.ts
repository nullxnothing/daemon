import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeProject } from '../../electron/services/MemoryExtractionService'

const tempRoots: string[] = []

function makeProject(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-mem-extract-'))
  tempRoots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('MemoryExtractionService.analyzeProject', () => {
  it('extracts package manager, stack, and known scripts', () => {
    const root = makeProject({
      'pnpm-lock.yaml': '',
      'package.json': JSON.stringify({
        scripts: { test: 'vitest run', build: 'vite build', dev: 'vite' },
        dependencies: { react: '18', '@solana/web3.js': '1' },
        devDependencies: { typescript: '5', vite: '5' },
      }),
    })
    const out = analyzeProject(root, 'p1')
    const byKind = (k: string) => out.filter((m) => m.kind === k)

    expect(byKind('package_manager')[0]?.value).toBe('pnpm')
    expect(byKind('stack')[0]?.value).toContain('React')
    expect(byKind('stack')[0]?.value).toContain('Solana')
    expect(byKind('test_command').some((m) => m.value === 'pnpm run test')).toBe(true)
    expect(byKind('build_command').some((m) => m.value === 'pnpm run build')).toBe(true)
    expect(byKind('dev_command').some((m) => m.value === 'pnpm run dev')).toBe(true)
  })

  it('prefers the declared packageManager field over lockfiles', () => {
    const root = makeProject({
      'yarn.lock': '',
      'package.json': JSON.stringify({ packageManager: 'pnpm@9.1.0', scripts: {} }),
    })
    expect(analyzeProject(root, 'p1').find((m) => m.kind === 'package_manager')?.value).toBe('pnpm')
  })

  it('records MCP config and Anchor presence', () => {
    const root = makeProject({
      'package.json': JSON.stringify({ scripts: {} }),
      '.mcp.json': '{}',
      'Anchor.toml': '[programs.localnet]\n',
    })
    const kinds = analyzeProject(root, 'p1').map((m) => m.kind)
    expect(kinds).toContain('mcp_config')
    expect(kinds).toContain('deployment_target')
  })

  it('skips a script whose value would carry a secret', () => {
    const root = makeProject({
      'pnpm-lock.yaml': '',
      // A pathological script name that injects a secret into the memorized command value.
      'package.json': JSON.stringify({
        scripts: { 'test secret=sk-ant-aaaaaaaaaaaaaaaaaaaaaaaa': 'vitest' },
        dependencies: {},
      }),
    })
    const out = analyzeProject(root, 'p1')
    // The known SCRIPT_KIND map only matches exact names, so the malformed name is ignored;
    // and even if it matched, the secret-bearing value would be filtered. Either way: no leak.
    expect(out.every((m) => !m.value.includes('sk-ant-'))).toBe(true)
  })

  it('returns nothing for a project with no recognizable config', () => {
    const root = makeProject({ 'README.md': '# hi' })
    expect(analyzeProject(root, 'p1')).toEqual([])
  })
})

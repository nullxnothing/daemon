import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../electron/db/db', () => ({ getDb: vi.fn() }))

import { discoverChecks, runCheck } from '../../electron/services/CheckRunnerService'
import type { CheckDefinition } from '../../electron/shared/types'

const tempRoots: string[] = []
function makeProject(pkg: object, extra: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-check-'))
  tempRoots.push(root)
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg))
  for (const [rel, content] of Object.entries(extra)) {
    fs.writeFileSync(path.join(root, rel), content)
  }
  return root
}
afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('CheckRunnerService.discoverChecks', () => {
  it('discovers typecheck/test/build and uses the detected manager', () => {
    const root = makeProject(
      { scripts: { typecheck: 'tsc', test: 'vitest run', build: 'vite build' } },
      { 'pnpm-lock.yaml': '' },
    )
    const checks = discoverChecks(root)
    const commands = checks.map((c) => c.command)
    expect(commands).toContain('pnpm run typecheck')
    expect(commands).toContain('pnpm run test')
    expect(commands).toContain('pnpm run build')
  })

  it('excludes deploy/publish scripts', () => {
    const root = makeProject({
      scripts: {
        test: 'vitest',
        deploy: 'vercel deploy --prod',
        'program-deploy': 'anchor deploy',
        release: 'npm publish',
      },
    })
    const ids = discoverChecks(root).map((c) => c.id)
    expect(ids).toContain('check_test')
    expect(ids).not.toContain('check_deploy')
    expect(ids).not.toContain('check_program-deploy')
    expect(ids).not.toContain('check_release')
  })

  it('returns nothing without a package.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-check-empty-'))
    tempRoots.push(root)
    expect(discoverChecks(root)).toEqual([])
  })
})

describe('CheckRunnerService.runCheck', () => {
  it('refuses to run a deploy-like command', async () => {
    const deploy: CheckDefinition = {
      id: 'x', kind: 'other', label: 'deploy', command: 'anchor deploy',
      source: 'package_script', memoryKind: null,
    }
    await expect(runCheck('/tmp', deploy)).rejects.toThrow(/deploy-like/)
  })
})

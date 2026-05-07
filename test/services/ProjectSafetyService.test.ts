import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { scanProjectSafety } from '../../electron/services/ProjectSafetyService'

const tempRoots: string[] = []

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-safety-'))
  tempRoots.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('ProjectSafetyService', () => {
  it('detects plaintext secrets, wallet keypairs, and permission bypasses', () => {
    const project = makeProject()
    fs.writeFileSync(path.join(project, '.env'), 'HELIUS_API_KEY=abc123\n', 'utf8')
    fs.mkdirSync(path.join(project, 'target', 'deploy'), { recursive: true })
    fs.writeFileSync(
      path.join(project, 'wallet-keypair.json'),
      `[${Array.from({ length: 64 }, (_, i) => i).join(',')}]`,
      'utf8',
    )
    fs.writeFileSync(
      path.join(project, 'build.ts'),
      'const cmd = "claude --dangerously-skip-permissions -p build"',
      'utf8',
    )

    const report = scanProjectSafety(project)
    const ids = report.findings.map((finding) => finding.id)

    expect(report.scannedFiles).toBe(3)
    expect(ids).toContain('secret-env-assignment')
    expect(ids).toContain('solana-keypair-json')
    expect(ids).toContain('dangerously-skip-permissions')
    expect(report.summary.critical).toBe(2)
    expect(report.summary.high).toBe(1)
  })

  it('ignores dependency and build output directories', () => {
    const project = makeProject()
    fs.mkdirSync(path.join(project, 'node_modules', 'bad'), { recursive: true })
    fs.writeFileSync(path.join(project, 'node_modules', 'bad', 'index.js'), 'API_KEY=leaked', 'utf8')
    fs.writeFileSync(path.join(project, 'src.ts'), 'export const ok = true', 'utf8')

    const report = scanProjectSafety(project)

    expect(report.scannedFiles).toBe(1)
    expect(report.findings).toHaveLength(0)
  })

  it('reports line numbers relative to project files', () => {
    const project = makeProject()
    fs.mkdirSync(path.join(project, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(project, 'src', 'main.ts'),
      ['const a = 1', 'const html = element.innerHTML', 'const b = 2'].join('\n'),
      'utf8',
    )

    const report = scanProjectSafety(project)
    const finding = report.findings.find((item) => item.id === 'unsafe-html-injection')

    expect(finding?.filePath).toBe(path.join('src', 'main.ts'))
    expect(finding?.line).toBe(2)
  })
})

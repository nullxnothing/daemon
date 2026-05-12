import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyUnifiedDiff, extractPatchFilePaths, validatePatchProposal } from '../../electron/services/PatchProposalService'

const SIMPLE_DIFF = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-const value = 1
+const value = 2
 export { value }
`

describe('PatchProposalService', () => {
  const tempRoots: string[] = []

  function makeTempProject(): string {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-patch-test-'))
    tempRoots.push(projectPath)
    execFileSync('git', ['init'], { cwd: projectPath, stdio: 'ignore' })
    return projectPath
  }

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('extracts file paths from unified diffs', () => {
    expect(extractPatchFilePaths(SIMPLE_DIFF)).toEqual(['src/app.ts'])
  })

  it('accepts normal source patches as low risk', () => {
    const result = validatePatchProposal({ unifiedDiff: SIMPLE_DIFF, projectPath: process.cwd() })

    expect(result.files).toEqual(['src/app.ts'])
    expect(result.riskLevel).toBe('low')
    expect(result.safetyFindings).toHaveLength(0)
  })

  it('blocks parent traversal and sensitive credential paths', () => {
    const diff = `diff --git a/../outside.ts b/../outside.ts
--- a/../outside.ts
+++ b/../outside.ts
@@ -0,0 +1 @@
+bad
diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1 +1 @@
-A=1
+A=2
`
    const result = validatePatchProposal({ unifiedDiff: diff, projectPath: process.cwd() })

    expect(result.riskLevel).toBe('blocked')
    expect(result.safetyFindings.map((finding) => finding.code)).toContain('unsafe_path')
    expect(result.safetyFindings.map((finding) => finding.code)).toContain('sensitive_path')
  })

  it('rejects empty, oversized, and binary patches', () => {
    expect(() => validatePatchProposal({ unifiedDiff: '' })).toThrow('unifiedDiff required')
    expect(() => validatePatchProposal({ unifiedDiff: 'x'.repeat(500_001) })).toThrow('unifiedDiff is too large')
    expect(() => validatePatchProposal({ unifiedDiff: 'GIT binary patch' })).toThrow('Binary patches are not supported')
  })

  it('applies accepted unified diffs through git apply', async () => {
    const projectPath = makeTempProject()
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true })
    fs.writeFileSync(path.join(projectPath, 'src', 'app.txt'), 'old\n')

    const diff = `diff --git a/src/app.txt b/src/app.txt
--- a/src/app.txt
+++ b/src/app.txt
@@ -1 +1 @@
-old
+new
`
    const result = await applyUnifiedDiff(projectPath, diff)

    expect(result.files).toEqual(['src/app.txt'])
    expect(fs.readFileSync(path.join(projectPath, 'src', 'app.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('new\n')
    expect(result.appliedAt).toBeGreaterThan(0)
  })

  it('refuses blocked patches before invoking git apply', async () => {
    const projectPath = makeTempProject()
    const diff = `diff --git a/.env b/.env
--- a/.env
+++ b/.env
@@ -1 +1 @@
-A=1
+A=2
`

    await expect(applyUnifiedDiff(projectPath, diff)).rejects.toThrow('blocked safety findings')
  })

  it('reports patches that no longer apply cleanly', async () => {
    const projectPath = makeTempProject()
    fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true })
    fs.writeFileSync(path.join(projectPath, 'src', 'app.txt'), 'current\n')

    const diff = `diff --git a/src/app.txt b/src/app.txt
--- a/src/app.txt
+++ b/src/app.txt
@@ -1 +1 @@
-old
+new
`

    await expect(applyUnifiedDiff(projectPath, diff)).rejects.toThrow('Patch no longer applies cleanly')
    expect(fs.readFileSync(path.join(projectPath, 'src', 'app.txt'), 'utf8').replace(/\r\n/g, '\n')).toBe('current\n')
  })
})

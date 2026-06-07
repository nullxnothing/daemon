import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { createSuggestion } from './MemoryService'
import type { CheckDefinition, CheckKind, CheckResult } from '../shared/types'

const execFileAsync = promisify(execFile)
const CHECK_TIMEOUT_MS = 5 * 60_000
const CHECK_MAX_BUFFER = 8 * 1024 * 1024

// Script names we are willing to run as checks, in priority order, mapped to a kind.
// Deploy/publish/release-style scripts are intentionally excluded — never auto-run those.
const SAFE_SCRIPT_CHECKS: Array<{ name: string; kind: CheckKind }> = [
  { name: 'typecheck', kind: 'typecheck' },
  { name: 'type-check', kind: 'typecheck' },
  { name: 'test', kind: 'test' },
  { name: 'lint', kind: 'lint' },
  { name: 'build', kind: 'build' },
]

const DEPLOY_RE = /\b(deploy|publish|release|push|--dangerously|program deploy|anchor deploy)\b/i

function detectManager(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) return 'bun'
  return 'npm'
}

/**
 * Pure discovery: read package.json scripts (and framework files) and return runnable
 * check definitions. Excludes any script whose body looks like a deploy/publish action.
 */
export function discoverChecks(projectPath: string): CheckDefinition[] {
  const checks: CheckDefinition[] = []
  const pkgPath = path.join(projectPath, 'package.json')
  if (!fs.existsSync(pkgPath)) return checks

  let scripts: Record<string, string> = {}
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
    scripts = pkg.scripts ?? {}
  } catch {
    return checks
  }

  const manager = detectManager(projectPath)
  for (const { name, kind } of SAFE_SCRIPT_CHECKS) {
    const body = scripts[name]
    if (typeof body !== 'string') continue
    if (DEPLOY_RE.test(body) || DEPLOY_RE.test(name)) continue
    checks.push({
      id: `check_${name}`,
      kind,
      label: `${manager} run ${name}`,
      command: `${manager} run ${name}`,
      source: 'package_script',
      memoryKind: kind === 'test' || kind === 'typecheck' ? 'test_command'
        : kind === 'build' ? 'build_command' : null,
    })
  }
  return checks
}

/** Split "pnpm run test" into a safe (file, args) pair — never shelled out. */
function splitCommand(command: string): { file: string; args: string[] } {
  const parts = command.trim().split(/\s+/)
  return { file: parts[0], args: parts.slice(1) }
}

export async function runCheck(projectPath: string, check: CheckDefinition): Promise<CheckResult> {
  if (DEPLOY_RE.test(check.command)) {
    throw new Error(`Refusing to run deploy-like command as a check: ${check.command}`)
  }
  const { file, args } = splitCommand(check.command)
  const startedAt = Date.now()
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: projectPath,
      timeout: CHECK_TIMEOUT_MS,
      maxBuffer: CHECK_MAX_BUFFER,
      windowsHide: true,
      shell: process.platform === 'win32', // npm/pnpm are .cmd shims on Windows
    })
    const result: CheckResult = {
      check,
      status: 'passed',
      exitCode: 0,
      durationMs: Date.now() - startedAt,
      output: `${stdout}\n${stderr}`.trim(),
    }
    promoteToMemory(projectPath, check)
    return result
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    return {
      check,
      status: 'failed',
      exitCode: typeof e.code === 'number' ? e.code : null,
      durationMs: Date.now() - startedAt,
      output: `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim(),
    }
  }
}

/** A passing check becomes a memory *suggestion* (never auto-approved). */
function promoteToMemory(projectPath: string, check: CheckDefinition): void {
  if (!check.memoryKind) return
  try {
    createSuggestion({
      projectId: null,
      kind: check.memoryKind,
      title: `Known-good ${check.kind} command`,
      value: check.command,
      sourceType: 'successful_check',
      sourceRef: `${path.basename(projectPath)}:${check.id}`,
      confidence: 0.85,
      createdBy: 'check_runner',
    })
  } catch {
    // Secret guard / dedupe failures are non-fatal for the check run.
  }
}

/**
 * Process-tree termination for swarm lanes. On Windows, ChildProcess.kill()
 * only signals the direct child (often a cmd.exe shim), leaving the real
 * claude/node descendants alive — and any live descendant holds file locks
 * that make worktree removal fail with EBUSY/EPERM. taskkill /T takes the
 * whole tree down.
 */
import { execFile } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'

const TASKKILL_TIMEOUT_MS = 5_000

export function killProcessTree(child: ChildProcess): void {
  if (child.pid && process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: TASKKILL_TIMEOUT_MS, windowsHide: true }, () => {})
    return
  }
  try { child.kill('SIGKILL') } catch { /* already gone */ }
}

/** Resolve once the child has exited, or after timeoutMs — whichever is first. */
export function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * Boot-time kill of an orphaned lane process by recorded PID. PIDs get reused,
 * so on Windows we only fire when the image name still looks like a CLI lane
 * (claude/node/cmd). Elsewhere this is a no-op: POSIX lets us delete a
 * worktree out from under a running process, so there is nothing to unlock.
 */
export function killOrphanLanePid(pid: number): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve()
  return new Promise((resolve) => {
    execFile(
      'tasklist',
      ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
      { timeout: TASKKILL_TIMEOUT_MS, windowsHide: true },
      (err, stdout) => {
        const imageName = stdout?.split(',')[0]?.replace(/"/g, '').toLowerCase() ?? ''
        if (err || !/^(claude|node|cmd)(\.exe)?$/.test(imageName)) {
          resolve()
          return
        }
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: TASKKILL_TIMEOUT_MS, windowsHide: true }, () => resolve())
      },
    )
  })
}

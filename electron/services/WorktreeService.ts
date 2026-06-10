/**
 * WorktreeService — DB layer + git-worktree lifecycle for swarm runs.
 *
 * Owns the swarm_runs / swarm_lanes tables and the actual `git worktree`
 * calls. Cleanup is the critical concern: a lane's worktree is removed when
 * the lane reaches a terminal status, and a reconcile-on-boot pass removes any
 * worktree whose lane row is already terminal (mirrors how terminal.ts cleans
 * up active_sessions on exit / boot).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import simpleGit from 'simple-git'
import { getDb } from '../db/db'
import { LogService } from './LogService'
import { killOrphanLanePid } from './procKill'
import { swarmRootFor } from '../ipc/git'

// Windows: a lane process (or Defender/indexer) holding any handle inside the
// worktree makes removal fail with EBUSY/EPERM. Retry with backoff instead of
// failing once and leaking the worktree.
const REMOVE_ATTEMPTS = 4
const REMOVE_BACKOFF_MS = 350

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type SwarmRunStatus = 'running' | 'done' | 'failed' | 'cancelled'
export type SwarmLaneStatus = 'pending' | 'spawning' | 'running' | 'done' | 'failed' | 'cancelled'

const TERMINAL_LANE: SwarmLaneStatus[] = ['done', 'failed', 'cancelled']

export interface SwarmRun {
  id: string
  session_id: string | null
  project_id: string | null
  project_path: string
  base_branch: string | null
  status: SwarmRunStatus
  created_at: number
  updated_at: number
}

export interface SwarmLane {
  id: string
  run_id: string
  task: string
  worktree_path: string
  branch: string
  pid: number | null
  status: SwarmLaneStatus
  results_path: string | null
  exit_code: number | null
  created_at: number
  updated_at: number
}

// ---------------- run + lane records ----------------

export function createRun(input: {
  sessionId: string | null
  projectId: string | null
  projectPath: string
  baseBranch: string | null
}): SwarmRun {
  const db = getDb()
  const id = crypto.randomUUID()
  db.prepare(
    'INSERT INTO swarm_runs (id, session_id, project_id, project_path, base_branch) VALUES (?,?,?,?,?)'
  ).run(id, input.sessionId, input.projectId, input.projectPath, input.baseBranch)
  return getRun(id)!
}

export function createLane(input: {
  id?: string
  runId: string
  task: string
  worktreePath: string
  branch: string
}): SwarmLane {
  const db = getDb()
  const id = input.id ?? crypto.randomUUID()
  db.prepare(
    'INSERT INTO swarm_lanes (id, run_id, task, worktree_path, branch) VALUES (?,?,?,?,?)'
  ).run(id, input.runId, input.task, input.worktreePath, input.branch)
  return getLane(id)!
}

export function getRun(id: string): SwarmRun | undefined {
  return getDb().prepare('SELECT * FROM swarm_runs WHERE id = ?').get(id) as SwarmRun | undefined
}

export function listRuns(limit = 30): SwarmRun[] {
  return getDb().prepare('SELECT * FROM swarm_runs ORDER BY created_at DESC LIMIT ?').all(limit) as SwarmRun[]
}

export function getLane(id: string): SwarmLane | undefined {
  return getDb().prepare('SELECT * FROM swarm_lanes WHERE id = ?').get(id) as SwarmLane | undefined
}

export function listLanes(runId: string): SwarmLane[] {
  return getDb().prepare('SELECT * FROM swarm_lanes WHERE run_id = ? ORDER BY created_at ASC').all(runId) as SwarmLane[]
}

export function setRunStatus(runId: string, status: SwarmRunStatus): void {
  getDb().prepare('UPDATE swarm_runs SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), runId)
}

export function setLaneStatus(laneId: string, status: SwarmLaneStatus, fields: { pid?: number | null; exitCode?: number | null; resultsPath?: string | null } = {}): void {
  const db = getDb()
  const lane = getLane(laneId)
  if (!lane) return
  db.prepare(
    'UPDATE swarm_lanes SET status = ?, pid = ?, exit_code = ?, results_path = ?, updated_at = ? WHERE id = ?'
  ).run(
    status,
    fields.pid !== undefined ? fields.pid : lane.pid,
    fields.exitCode !== undefined ? fields.exitCode : lane.exit_code,
    fields.resultsPath !== undefined ? fields.resultsPath : lane.results_path,
    Date.now(),
    laneId,
  )
}

/** Roll the run up to a terminal status once all its lanes are terminal. */
export function rollupRunStatus(runId: string): void {
  const lanes = listLanes(runId)
  if (lanes.length === 0) return
  if (!lanes.every((l) => TERMINAL_LANE.includes(l.status))) return
  const anyFailed = lanes.some((l) => l.status === 'failed')
  const anyCancelled = lanes.some((l) => l.status === 'cancelled')
  setRunStatus(runId, anyFailed ? 'failed' : anyCancelled ? 'cancelled' : 'done')
}

// ---------------- worktree lifecycle ----------------

/**
 * Build the per-lane worktree path under the managed swarm root. Short id
 * prefixes instead of full UUIDs: a worktree with node_modules inside it
 * blows past Windows' 260-char MAX_PATH fast, and the full path is stored
 * on the lane row anyway so the dir name doesn't need to be unique forever.
 */
export function laneWorktreePath(projectPath: string, runId: string, laneId: string): string {
  return path.join(swarmRootFor(projectPath), runId.slice(0, 8), laneId.slice(0, 8))
}

export async function addWorktree(projectPath: string, worktreePath: string, branch: string, base: string | null): Promise<void> {
  const git = simpleGit(projectPath)
  // A worktree needs a commit to branch from. A fresh repo with an unborn HEAD
  // (no commits) can't host a swarm — fail with a clear message instead of a
  // raw `invalid reference` git error.
  try {
    await git.revparse(['HEAD'])
  } catch {
    throw new Error('This project has no commits yet — make an initial commit before launching a swarm.')
  }
  const args = ['worktree', 'add', '-b', branch, worktreePath]
  args.push(base && base.trim() ? base.trim() : 'HEAD')
  await git.raw(args)
}

export async function removeWorktree(projectPath: string, worktreePath: string, branch?: string | null): Promise<void> {
  const git = simpleGit(projectPath)
  let removed = false
  for (let attempt = 1; attempt <= REMOVE_ATTEMPTS; attempt++) {
    try {
      await git.raw(['worktree', 'remove', worktreePath, '--force'])
      removed = true
      break
    } catch (err) {
      if (!fs.existsSync(worktreePath)) { removed = true; break }
      if (attempt === REMOVE_ATTEMPTS) {
        LogService.warn('Swarm', `Failed to remove worktree ${worktreePath} after ${REMOVE_ATTEMPTS} attempts`, { error: (err as Error).message })
      } else {
        await sleep(REMOVE_BACKOFF_MS * attempt)
      }
    }
  }
  // Force-delete whatever git couldn't; rmSync retries EBUSY/EPERM natively.
  try {
    fs.rmSync(worktreePath, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
    const parent = path.dirname(worktreePath)
    if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent)
  } catch (err) {
    if (!removed) LogService.warn('Swarm', `Worktree dir still locked: ${worktreePath}`, { error: (err as Error).message })
  }
  // Prune AFTER the dir is gone so git drops the stale metadata entry.
  try {
    await git.raw(['worktree', 'prune'])
  } catch { /* best-effort */ }
  // Delete the lane's throwaway branch so swarm/* refs don't accumulate.
  if (branch) {
    try { await git.raw(['branch', '-D', branch]) } catch { /* may not exist */ }
  }
}

/**
 * Reconcile-on-boot: any lane already terminal but whose worktree may linger
 * gets its worktree removed. Also marks orphaned non-terminal lanes (a crash
 * left them mid-flight) as failed so a stale run can't block forever.
 */
export async function reconcileOnBoot(): Promise<void> {
  const db = getDb()
  let runs: SwarmRun[] = []
  try {
    runs = db.prepare("SELECT * FROM swarm_runs WHERE status = 'running'").all() as SwarmRun[]
  } catch {
    return // table not migrated yet
  }
  for (const run of runs) {
    for (const lane of listLanes(run.id)) {
      if (!TERMINAL_LANE.includes(lane.status)) {
        // A crashed app can leave the lane's claude process alive, holding
        // locks that block worktree removal on Windows — kill it (guarded by
        // an image-name check, since PIDs get reused) before failing the lane.
        if (lane.pid) await killOrphanLanePid(lane.pid)
        setLaneStatus(lane.id, 'failed', { exitCode: null })
      }
      await removeWorktree(run.project_path, lane.worktree_path, lane.branch)
    }
    rollupRunStatus(run.id)
  }
}

/**
 * SwarmOrchestrator — runs N tasks as parallel, worktree-isolated Claude CLI
 * agents. Each lane gets its own git branch + worktree; a headless `claude -p`
 * process works the task there and writes RESULTS.md. A hard concurrency cap +
 * queue keeps PTY/process pressure bounded.
 *
 * Engine: node child_process spawning the Claude CLI (reusing getClaudePath +
 * the verified --append-system-prompt-file flag). We use child_process rather
 * than the interactive node-pty path so we get a clean main-side exit hook and
 * exit codes per lane, without entangling the interactive terminal machinery.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { BrowserWindow } from 'electron'
import { buildCliSpawn } from './cliSpawn'
import { getClaudePath } from './ClaudeRouter'
import { LogService } from './LogService'
import { killProcessTree, waitForExit } from './procKill'
import * as Worktree from './WorktreeService'

const MAX_CONCURRENT_LANES = 4
const LANE_MODEL = 'sonnet'
const LANE_MAX_TURNS = 30
/** Lanes must never push; merging is a human step in the Git panel. */
const DISALLOWED_TOOLS = 'Bash(git push:*)'

interface LiveLane {
  laneId: string
  runId: string
  projectPath: string
  worktreePath: string
  child: ChildProcess | null
  contextFile: string | null
}

const liveLanes = new Map<string, LiveLane>()

function emit(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, payload)
}

function laneBranch(runId: string, index: number): string {
  return `swarm/${runId.slice(0, 8)}/lane-${index + 1}`
}

function writeLaneContext(task: string): string {
  const file = path.join(os.tmpdir(), `daemon_swarm_${crypto.randomUUID()}.txt`)
  const content = [
    'You are a DAEMON swarm lane agent working in an isolated git worktree.',
    'Complete the assigned task end to end, then run the project gate loop if one exists.',
    'When finished, write a RESULTS.md at the worktree root summarizing: what changed,',
    'files touched, commands run, and anything you deferred. Do NOT push to any remote.',
    '',
    `TASK:\n${task}`,
  ].join('\n')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

export interface SwarmLaunchInput {
  sessionId: string | null
  projectId: string | null
  projectPath: string
  baseBranch: string | null
  tasks: string[]
}

/** Create a run + its lanes, then start draining the queue. Returns the run id. */
export async function launch(input: SwarmLaunchInput): Promise<string> {
  if (!input.tasks.length) throw new Error('At least one task is required.')
  if (input.tasks.length > 12) throw new Error('Too many tasks (max 12 lanes per run).')

  const run = Worktree.createRun({
    sessionId: input.sessionId,
    projectId: input.projectId,
    projectPath: input.projectPath,
    baseBranch: input.baseBranch,
  })

  input.tasks.forEach((task, i) => {
    const laneId = crypto.randomUUID()
    const worktreePath = Worktree.laneWorktreePath(input.projectPath, run.id, laneId)
    Worktree.createLane({ id: laneId, runId: run.id, task, worktreePath, branch: laneBranch(run.id, i) })
  })

  void drainQueue(run.id)
  return run.id
}

/**
 * Start as many pending lanes as the concurrency cap allows. Drains across
 * ALL running runs (preferRunId first) — draining only the finishing lane's
 * run would strand a second run's pending lanes forever once the first run
 * completed, since nothing else ever re-triggers them.
 */
async function drainQueue(preferRunId: string): Promise<void> {
  let slots = Math.max(0, MAX_CONCURRENT_LANES - liveLanes.size)
  if (slots === 0) return

  const runIds = Worktree.listRuns()
    .filter((r) => r.status === 'running')
    .map((r) => r.id)
    .sort((a, b) => (a === preferRunId ? -1 : b === preferRunId ? 1 : 0))

  for (const runId of runIds) {
    const lanes = Worktree.listLanes(runId).filter((l) => l.status === 'pending')
    for (const lane of lanes) {
      if (slots <= 0) return
      slots -= 1
      await startLane(runId, lane.id)
    }
  }
}

async function startLane(runId: string, laneId: string): Promise<void> {
  const lane = Worktree.getLane(laneId)
  const run = Worktree.getRun(runId)
  if (!lane || !run) return

  Worktree.setLaneStatus(laneId, 'spawning')
  emit('swarm:lane-update', { runId, laneId, status: 'spawning' })

  try {
    await Worktree.addWorktree(run.project_path, lane.worktree_path, lane.branch, run.base_branch)
  } catch (err) {
    LogService.error('Swarm', `Worktree add failed for lane ${laneId}`, err as Error)
    Worktree.setLaneStatus(laneId, 'failed')
    emit('swarm:lane-update', { runId, laneId, status: 'failed' })
    finishLane(runId, laneId)
    return
  }

  const contextFile = writeLaneContext(lane.task)
  const args = [
    '-p', lane.task,
    '--model', LANE_MODEL,
    '--append-system-prompt-file', contextFile,
    '--max-turns', String(LANE_MAX_TURNS), // non-interactive needs a turn budget to finish multi-step work
    '--dangerously-skip-permissions', // isolated worktree — documented automated-agent use
    '--disallowedTools', DISALLOWED_TOOLS,
    '--output-format', 'text',
  ]

  // Strip API-key env so the CLI uses subscription OAuth creds (an exhausted or
  // restricted ANTHROPIC_API_KEY otherwise makes `claude -p` exit 1 instantly).
  // Mirrors the agent-shell handling in electron/ipc/terminal.ts.
  const laneEnv: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color' }
  delete laneEnv.ANTHROPIC_API_KEY
  delete laneEnv.ANTHROPIC_AUTH_TOKEN

  // claude is a .cmd shim on Windows npm installs — Node 20.12+ throws spawn
  // EINVAL on those without a shell, which failed every lane instantly.
  const spec = buildCliSpawn(getClaudePath(), args)
  let child: ChildProcess
  try {
    child = spawn(spec.command, spec.args, {
      cwd: lane.worktree_path,
      env: laneEnv,
      shell: spec.shell,
      windowsHide: true,
      // Close stdin so `claude -p` doesn't block waiting for piped input
      // (it otherwise times out after 3s and exits 1); keep stdout/stderr piped.
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    LogService.error('Swarm', `Spawn failed for lane ${laneId}`, err as Error)
    cleanupContext(contextFile)
    Worktree.setLaneStatus(laneId, 'failed')
    emit('swarm:lane-update', { runId, laneId, status: 'failed' })
    finishLane(runId, laneId)
    return
  }

  liveLanes.set(laneId, { laneId, runId, projectPath: run.project_path, worktreePath: lane.worktree_path, child, contextFile })
  Worktree.setLaneStatus(laneId, 'running', { pid: child.pid ?? null })
  emit('swarm:lane-update', { runId, laneId, status: 'running', pid: child.pid ?? null })

  // Capture stderr + a tail of stdout so a non-zero exit is diagnosable.
  let stderr = ''
  let stdout = ''
  child.stderr?.on('data', (d) => { stderr = (stderr + String(d)).slice(-4000) })
  child.stdout?.on('data', (d) => { stdout = (stdout + String(d)).slice(-4000) })

  // 'error' fires instead of (or as well as) 'close' when the spawn itself
  // fails (shell-mode errors are async, never thrown) — settle exactly once.
  let settled = false
  const settleLane = (code: number | null) => {
    if (settled) return
    settled = true
    cleanupContext(contextFile)
    // Snapshot RESULTS.md to a stable cache outside the worktree so it survives
    // worktree teardown (cancel/dismiss). results_path points at the snapshot.
    const snapshot = snapshotResults(lane.worktree_path, runId, laneId)
    const status = code === 0 ? 'done' : 'failed'
    if (status === 'failed') {
      LogService.warn('Swarm', `Lane ${laneId} exited ${code}`, { stderr: stderr.trim().slice(-1000), stdout: stdout.trim().slice(-1000) })
    }
    Worktree.setLaneStatus(laneId, status, { exitCode: code, resultsPath: snapshot })
    emit('swarm:lane-update', { runId, laneId, status, exitCode: code })
    finishLane(runId, laneId)
  }

  child.on('error', (err) => {
    LogService.error('Swarm', `Lane ${laneId} process error`, err)
    settleLane(null)
  })
  // 'close' (not 'exit') so stdout/stderr are fully flushed before we log them.
  child.on('close', (code) => settleLane(code ?? null))
}

/** Common post-lane bookkeeping: drop from live map, roll up run, drain more, cleanup terminal worktrees. */
function finishLane(runId: string, laneId: string): void {
  liveLanes.delete(laneId)
  Worktree.rollupRunStatus(runId)
  emit('swarm:run-update', { runId, status: Worktree.getRun(runId)?.status })
  // Keep the worktree until results are read for done lanes; remove failed/cancelled eagerly.
  const lane = Worktree.getLane(laneId)
  if (lane && (lane.status === 'failed' || lane.status === 'cancelled')) {
    void Worktree.removeWorktree(Worktree.getRun(runId)!.project_path, lane.worktree_path, lane.branch)
  }
  void drainQueue(runId)
}

function cleanupContext(file: string | null): void {
  if (!file) return
  try { fs.unlinkSync(file) } catch { /* best-effort */ }
}

/** Cache dir for a run's collected RESULTS, outside any worktree. */
function resultsCacheDir(): string {
  return path.join(os.tmpdir(), 'daemon-swarm-results')
}

/** Copy a lane's RESULTS.md to the stable cache; returns the snapshot path or null. */
function snapshotResults(worktreePath: string, runId: string, laneId: string): string | null {
  const src = path.join(worktreePath, 'RESULTS.md')
  if (!fs.existsSync(src)) return null
  try {
    const dir = path.join(resultsCacheDir(), runId)
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, `${laneId}.md`)
    fs.copyFileSync(src, dest)
    return dest
  } catch {
    return src // fall back to the in-worktree path
  }
}

/** Read a lane's RESULTS.md (if it wrote one). */
export function collectLaneResults(laneId: string): string | null {
  const lane = Worktree.getLane(laneId)
  if (!lane?.results_path) return null
  try { return fs.readFileSync(lane.results_path, 'utf8') } catch { return null }
}

/**
 * Cancel/dismiss a whole run: kill any live lane processes and ALWAYS tear down
 * every worktree + branch (RESULTS are already snapshotted to the cache on exit,
 * so removal is safe even for finished lanes). Lanes still in flight become
 * 'cancelled'; finished lanes keep their done/failed status for accurate history.
 */
export async function cancelRun(runId: string): Promise<void> {
  const run = Worktree.getRun(runId)
  if (!run) return
  for (const lane of Worktree.listLanes(runId)) {
    const live = liveLanes.get(lane.id)
    if (live?.child) {
      // Tree-kill, then wait for the exit: on Windows a still-dying process
      // keeps cwd handles open and worktree removal would hit EBUSY.
      killProcessTree(live.child)
      await waitForExit(live.child, 5_000)
    }
    if (lane.status !== 'done' && lane.status !== 'failed') {
      Worktree.setLaneStatus(lane.id, 'cancelled')
    }
    await Worktree.removeWorktree(run.project_path, lane.worktree_path, lane.branch)
    liveLanes.delete(lane.id)
  }
  Worktree.setRunStatus(runId, 'cancelled')
  emit('swarm:run-update', { runId, status: 'cancelled' })
}

/** Kill every live lane (app shutdown). */
export function killAll(): void {
  for (const live of liveLanes.values()) {
    if (live.child) killProcessTree(live.child)
    cleanupContext(live.contextFile)
  }
  liveLanes.clear()
}

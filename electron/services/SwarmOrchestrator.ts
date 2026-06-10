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
import { getClaudePath } from './ClaudeRouter'
import { LogService } from './LogService'
import * as Worktree from './WorktreeService'

const MAX_CONCURRENT_LANES = 4
const LANE_MODEL = 'sonnet'
const LANE_MAX_TURNS = 30
/** Lanes must never push; merging is a human step in the Git panel. */
const DISALLOWED_TOOLS = 'Bash(git push:*)'

/** BrainBlast pre-flight: research a lane's task before it codes, then gate on CRITICAL risk. */
const PREFLIGHT_MAX_TURNS = 40
/** A pre-flight that hangs must not wedge the lane forever. */
const PREFLIGHT_TIMEOUT_MS = 5 * 60_000

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

function writeLaneContext(task: string, worktreePath: string | null): string {
  const file = path.join(os.tmpdir(), `daemon_swarm_${crypto.randomUUID()}.txt`)
  const lines = [
    'You are a DAEMON swarm lane agent working in an isolated git worktree.',
    'Complete the assigned task end to end, then run the project gate loop if one exists.',
    'When finished, write a RESULTS.md at the worktree root summarizing: what changed,',
    'files touched, commands run, and anything you deferred. Do NOT push to any remote.',
  ]
  // If a pre-flight ran, point the build agent at the research it produced.
  const report = worktreePath ? latestReportPath(worktreePath) : null
  if (report) {
    lines.push(
      '',
      'A BrainBlast pre-flight researched this task\'s external components. Before writing code',
      'that touches them, read the handoff report (verified facts + risk heatmap), then treat it',
      `as research to verify, not gospel:\n  ${path.relative(worktreePath!, report)}`,
    )
  }
  lines.push('', `TASK:\n${task}`)
  fs.writeFileSync(file, lines.join('\n'), 'utf8')
  return file
}

/** Find the newest report.json under a worktree's .agent-research/runs, or null. */
function latestReportPath(worktreePath: string): string | null {
  const runsDir = path.join(worktreePath, '.agent-research', 'runs')
  if (!fs.existsSync(runsDir)) return null
  const runs = fs.readdirSync(runsDir).sort().reverse()
  for (const run of runs) {
    const candidate = path.join(runsDir, run, 'report.json')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/** Env that forces the CLI onto subscription OAuth and signals BrainBlast --ci mode. */
function laneEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TERM: 'xterm-256color', ...extra }
  // Strip API-key env so the CLI uses OAuth (an exhausted/restricted key exits 1 instantly).
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

/** The DAEMON WebFetch fork of the BrainBlast skill, injected so headless lanes can run /brainblast. */
function brainblastSkillContent(): string | null {
  const skillPath = path.join(__dirname, '..', 'skills', 'brainblast', 'SKILL.md')
  try {
    return fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : null
  } catch {
    return null
  }
}

/**
 * Run a BrainBlast --ci pass for one lane, in its worktree, then read the report it produced and
 * compute the gate. A missing/unparseable report fails open (verdict 'caution', no block) so a
 * flaky research pass never silently swallows a lane — the build still runs, just unguarded.
 */
async function runPreflight(task: string, worktreePath: string): Promise<Worktree.LanePreflight> {
  const fallback: Worktree.LanePreflight = {
    verdict: 'caution', riskTotals: { critical: 0, high: 0, medium: 0, low: 0 }, blockedBy: [], reportPath: null,
  }

  const skill = brainblastSkillContent()
  const promptFile = path.join(os.tmpdir(), `daemon_preflight_${crypto.randomUUID()}.txt`)
  const sys = [
    'You are running a BrainBlast pre-flight for a DAEMON swarm lane in --ci (non-interactive) mode.',
    'Research the external components the task touches, then write .agent-research/runs/<ts>/report.json.',
    'Do not write code, do not modify the project — research and report only.',
    skill ? `\n<brainblast-skill>\n${skill}\n</brainblast-skill>` : '',
  ].join('\n')
  fs.writeFileSync(promptFile, sys, { encoding: 'utf8', mode: 0o600 })

  const args = [
    '-p', `/brainblast --ci\n\nTASK:\n${task}`,
    '--model', LANE_MODEL,
    '--append-system-prompt-file', promptFile,
    '--max-turns', String(PREFLIGHT_MAX_TURNS),
    '--dangerously-skip-permissions',
    '--disallowedTools', DISALLOWED_TOOLS,
    '--output-format', 'text',
  ]

  await new Promise<void>((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(getClaudePath(), args, {
        cwd: worktreePath,
        env: laneEnv({ BRAINBLAST_CI: '1' }),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (err) {
      LogService.warn('Swarm', 'Pre-flight spawn failed', { error: (err as Error).message })
      resolve()
      return
    }
    const killer = setTimeout(() => { try { child.kill() } catch { /* gone */ } }, PREFLIGHT_TIMEOUT_MS)
    child.on('exit', () => { clearTimeout(killer); resolve() })
    child.on('error', () => { clearTimeout(killer); resolve() })
  })

  try { fs.unlinkSync(promptFile) } catch { /* best-effort */ }

  const reportPath = latestReportPath(worktreePath)
  if (!reportPath) {
    LogService.warn('Swarm', 'Pre-flight produced no report.json — failing open')
    return fallback
  }
  try {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as {
      summary?: { verdict?: string }
      riskTotals?: { critical?: number; high?: number; medium?: number; low?: number }
      components?: { risks?: { severity?: string; title?: string }[] }[]
    }
    const rt = report.riskTotals ?? {}
    const riskTotals = {
      critical: rt.critical ?? 0, high: rt.high ?? 0, medium: rt.medium ?? 0, low: rt.low ?? 0,
    }
    const verdict = (['ready', 'caution', 'blocked'] as const).includes(report.summary?.verdict as never)
      ? (report.summary!.verdict as 'ready' | 'caution' | 'blocked')
      : 'caution'
    const blockedBy = (report.components ?? [])
      .flatMap((c) => c.risks ?? [])
      .filter((r) => r.severity === 'critical')
      .map((r) => r.title ?? 'Untitled critical risk')
    return { verdict, riskTotals, blockedBy, reportPath }
  } catch (err) {
    LogService.warn('Swarm', 'Pre-flight report.json unparseable — failing open', { error: (err as Error).message })
    return fallback
  }
}

export interface SwarmLaunchInput {
  sessionId: string | null
  projectId: string | null
  projectPath: string
  baseBranch: string | null
  tasks: string[]
  /** Opt-in: run a BrainBlast pre-flight per lane and gate the build on CRITICAL risk. Default off. */
  preflight?: boolean
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
    preflight: input.preflight,
  })

  input.tasks.forEach((task, i) => {
    const laneId = crypto.randomUUID()
    const worktreePath = Worktree.laneWorktreePath(input.projectPath, run.id, laneId)
    Worktree.createLane({ id: laneId, runId: run.id, task, worktreePath, branch: laneBranch(run.id, i) })
  })

  void drainQueue(run.id)
  return run.id
}

/** Start as many pending lanes as the concurrency cap allows. */
async function drainQueue(runId: string): Promise<void> {
  const running = liveLanes.size
  let slots = Math.max(0, MAX_CONCURRENT_LANES - running)
  if (slots === 0) return

  const lanes = Worktree.listLanes(runId).filter((l) => l.status === 'pending')
  for (const lane of lanes) {
    if (slots <= 0) break
    slots -= 1
    await startLane(runId, lane.id)
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

  // Opt-in BrainBlast pre-flight: research the task, then gate the build on a CRITICAL risk.
  if (run.preflight) {
    Worktree.setLaneStatus(laneId, 'researching')
    emit('swarm:lane-update', { runId, laneId, status: 'researching' })
    const preflight = await runPreflight(lane.task, lane.worktree_path)
    Worktree.setLanePreflight(laneId, preflight)
    if (preflight.blockedBy.length > 0 || preflight.verdict === 'blocked') {
      LogService.warn('Swarm', `Lane ${laneId} blocked by pre-flight`, { blockedBy: preflight.blockedBy })
      Worktree.setLaneStatus(laneId, 'blocked')
      emit('swarm:lane-update', { runId, laneId, status: 'blocked' })
      finishLane(runId, laneId)
      return
    }
  }

  const contextFile = writeLaneContext(lane.task, run.preflight ? lane.worktree_path : null)
  const args = [
    '-p', lane.task,
    '--model', LANE_MODEL,
    '--append-system-prompt-file', contextFile,
    '--max-turns', String(LANE_MAX_TURNS), // non-interactive needs a turn budget to finish multi-step work
    '--dangerously-skip-permissions', // isolated worktree — documented automated-agent use
    '--disallowedTools', DISALLOWED_TOOLS,
    '--output-format', 'text',
  ]

  let child: ChildProcess
  try {
    child = spawn(getClaudePath(), args, {
      cwd: lane.worktree_path,
      // OAuth-only env (see laneEnv) — an exhausted/restricted API key exits 1 instantly.
      env: laneEnv(),
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

  child.on('exit', (code) => {
    cleanupContext(contextFile)
    // Snapshot RESULTS.md to a stable cache outside the worktree so it survives
    // worktree teardown (cancel/dismiss). results_path points at the snapshot.
    const snapshot = snapshotResults(lane.worktree_path, runId, laneId)
    const status = code === 0 ? 'done' : 'failed'
    if (status === 'failed') {
      LogService.warn('Swarm', `Lane ${laneId} exited ${code}`, { stderr: stderr.trim().slice(-1000), stdout: stdout.trim().slice(-1000) })
    }
    Worktree.setLaneStatus(laneId, status, { exitCode: code ?? null, resultsPath: snapshot })
    emit('swarm:lane-update', { runId, laneId, status, exitCode: code ?? null })
    finishLane(runId, laneId)
  })
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
      try { live.child.kill() } catch { /* already gone */ }
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
    try { live.child?.kill() } catch { /* ignore */ }
    cleanupContext(live.contextFile)
  }
  liveLanes.clear()
}

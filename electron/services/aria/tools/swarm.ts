/**
 * Swarm tools: launch parallel worktree-isolated agents, check status, and
 * collect each lane's RESULTS.md. No auto-merge/auto-push — merging is a human
 * step in the Git panel.
 */
import * as SwarmOrchestrator from '../../SwarmOrchestrator'
import * as Worktree from '../../WorktreeService'
import { isPathSafe } from '../../../shared/pathValidation'
import type { AriaTool } from '../AriaTool'

export const swarmTools: AriaTool[] = [
  {
    name: 'swarm_launch',
    description: 'Run several tasks in parallel, each in its own git worktree + branch, driven by a Claude agent. Provide a tasks array (2–12 short task descriptions). Spawns processes — the user must approve. Lanes never push; merging is manual.',
    kind: 'run',
    risk: 'sensitive',
    input: {
      type: 'object',
      properties: {
        tasks: { type: 'array', items: { type: 'string' } },
        baseBranch: { type: 'string' },
      },
      required: ['tasks'],
    },
    async handler(input, ctx) {
      const projectPath = ctx.snapshot.activeProjectPath
      if (!projectPath || !isPathSafe(projectPath)) {
        return { ok: false, summary: 'Open a registered project before launching a swarm.' }
      }
      const tasks = Array.isArray(input.tasks) ? (input.tasks as string[]).map((t) => String(t).trim()).filter(Boolean) : []
      if (tasks.length === 0) return { ok: false, summary: 'At least one task is required.' }
      const runId = await SwarmOrchestrator.launch({
        sessionId: ctx.sessionId,
        projectId: ctx.snapshot.activeProjectId,
        projectPath,
        baseBranch: input.baseBranch ? String(input.baseBranch) : null,
        tasks,
      })
      return { ok: true, summary: `Launched swarm of ${tasks.length} lane(s).`, data: { runId, lanes: tasks.length } }
    },
  },
  {
    name: 'swarm_status',
    description: 'List recent swarm runs, or the lanes of a specific run when runId is given (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { runId: { type: 'string' } } },
    async handler(input) {
      const runId = input.runId ? String(input.runId) : null
      if (!runId) {
        const runs = Worktree.listRuns(20)
        return { ok: true, summary: `Found ${runs.length} run(s).`, data: runs.map((r) => ({ id: r.id, status: r.status })) }
      }
      const lanes = Worktree.listLanes(runId)
      return {
        ok: true,
        summary: `Run ${runId.slice(0, 8)} has ${lanes.length} lane(s).`,
        data: lanes.map((l) => ({ id: l.id, task: l.task, status: l.status, branch: l.branch, exitCode: l.exit_code })),
      }
    },
  },
  {
    name: 'swarm_collect',
    description: 'Return the RESULTS.md each lane of a run produced (read-only).',
    kind: 'read',
    risk: 'read',
    input: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'] },
    async handler(input) {
      const runId = String(input.runId ?? '')
      const lanes = Worktree.listLanes(runId)
      return {
        ok: true,
        summary: `Collected ${lanes.length} lane result(s).`,
        data: lanes.map((l) => ({ id: l.id, task: l.task, status: l.status, results: SwarmOrchestrator.collectLaneResults(l.id) })),
      }
    },
  },
]

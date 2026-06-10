import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { validateCwd } from '../shared/pathValidation'
import * as SwarmOrchestrator from '../services/SwarmOrchestrator'
import * as Worktree from '../services/WorktreeService'

export interface SwarmLaunchRequest {
  sessionId?: string | null
  projectId?: string | null
  projectPath: string
  baseBranch?: string | null
  tasks: string[]
  preflight?: boolean
}

export function registerSwarmHandlers() {
  ipcMain.handle('swarm:launch', ipcHandler(async (_event, req: SwarmLaunchRequest) => {
    if (!req?.projectPath) throw new Error('projectPath is required')
    validateCwd(req.projectPath)
    if (!Array.isArray(req.tasks) || req.tasks.length === 0) throw new Error('At least one task is required')
    const runId = await SwarmOrchestrator.launch({
      sessionId: req.sessionId ?? null,
      projectId: req.projectId ?? null,
      projectPath: req.projectPath,
      baseBranch: req.baseBranch ?? null,
      tasks: req.tasks.map((t) => String(t).trim()).filter(Boolean),
      preflight: req.preflight === true,
    })
    return { runId }
  }))

  ipcMain.handle('swarm:list', ipcHandler(async (_event, limit?: number) => {
    return Worktree.listRuns(limit ?? 30)
  }))

  ipcMain.handle('swarm:run-detail', ipcHandler(async (_event, runId: string) => {
    const run = Worktree.getRun(runId)
    if (!run) throw new Error('Run not found')
    const lanes = Worktree.listLanes(runId).map((lane) => ({
      ...lane,
      results: lane.results_path ? SwarmOrchestrator.collectLaneResults(lane.id) : null,
    }))
    return { run, lanes }
  }))

  ipcMain.handle('swarm:cancel', ipcHandler(async (_event, runId: string) => {
    await SwarmOrchestrator.cancelRun(runId)
  }))
}

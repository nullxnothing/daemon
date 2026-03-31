import { ipcMain, BrowserWindow } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Engine from '../services/EngineService'
import type { EngineAction } from '../shared/types'

export function registerEngineHandlers() {
  // Run an engine action (the main entry point)
  ipcMain.handle('engine:run', ipcHandler(async (_event, action: EngineAction) => {
    return Engine.runAction(action)
  }))

  // Get current cross-project context snapshot
  ipcMain.handle('engine:context', ipcHandler(async () => {
    return Engine.getContext()
  }))

  // Convenience: 1-click fix CLAUDE.md for a project
  ipcMain.handle('engine:fix-claude-md', ipcHandler(async (_event, projectId: string) => {
    return Engine.runAction({ type: 'fix-claude-md', projectId })
  }))

  // Convenience: 1-click generate CLAUDE.md for a project
  ipcMain.handle('engine:generate-claude-md', ipcHandler(async (_event, projectId: string) => {
    return Engine.runAction({ type: 'generate-claude-md', projectId })
  }))

  // Convenience: debug a project's setup
  ipcMain.handle('engine:debug-setup', ipcHandler(async (_event, projectId: string, question?: string) => {
    return Engine.runAction({
      type: 'debug-setup',
      projectId,
      payload: question ? { question } : undefined,
    })
  }))

  // Convenience: health check all projects
  ipcMain.handle('engine:health-check', ipcHandler(async () => {
    return Engine.runAction({ type: 'health-check' })
  }))

  // Convenience: explain an error
  ipcMain.handle('engine:explain-error', ipcHandler(async (_event, error: string, projectId?: string) => {
    return Engine.runAction({
      type: 'explain-error',
      projectId,
      payload: { error },
    })
  }))

  // Convenience: free-form ask with cross-project context
  ipcMain.handle('engine:ask', ipcHandler(async (_event, question: string, projectId?: string) => {
    return Engine.runAction({
      type: 'ask',
      projectId,
      payload: { question },
    })
  }))
}

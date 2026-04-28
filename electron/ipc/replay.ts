import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import {
  fetchTransactionTrace,
  fetchProgramRecentTraces,
  buildClaudeContext,
  createAgentHandoff,
  verifyReplayFix,
  getCurrentRpcLabel,
} from '../services/ReplayEngineService'
import { validateCwd } from '../shared/pathValidation'

export function registerReplayHandlers(): void {
  ipcMain.handle(
    'replay:fetch-trace',
    ipcHandler(async (_event, signature: string, force?: boolean) => {
      return fetchTransactionTrace(signature, { force: force === true })
    }),
  )

  ipcMain.handle(
    'replay:fetch-program',
    ipcHandler(async (_event, programId: string, limit?: number) => {
      return fetchProgramRecentTraces(programId, typeof limit === 'number' ? limit : 10)
    }),
  )

  ipcMain.handle(
    'replay:build-context',
    ipcHandler(async (_event, signature: string) => {
      const trace = await fetchTransactionTrace(signature)
      return buildClaudeContext(trace)
    }),
  )

  ipcMain.handle(
    'replay:create-handoff',
    ipcHandler(async (_event, projectPath: string, signature: string) => {
      validateCwd(projectPath)
      const trace = await fetchTransactionTrace(signature)
      return createAgentHandoff(projectPath, trace)
    }),
  )

  ipcMain.handle(
    'replay:verify-fix',
    ipcHandler(async (_event, projectPath: string, signature: string, command: string) => {
      validateCwd(projectPath)
      return verifyReplayFix(projectPath, signature, command)
    }),
  )

  ipcMain.handle(
    'replay:rpc-label',
    ipcHandler(async () => {
      return getCurrentRpcLabel()
    }),
  )
}

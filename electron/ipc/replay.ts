import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import {
  fetchTransactionTrace,
  fetchProgramRecentTraces,
  buildClaudeContext,
  getCurrentRpcLabel,
} from '../services/ReplayEngineService'

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
    'replay:rpc-label',
    ipcHandler(async () => {
      return getCurrentRpcLabel()
    }),
  )
}

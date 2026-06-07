import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Signalhouse from '../services/SignalhouseService'

export function registerSignalhouseHandlers() {
  ipcMain.handle('signalhouse:health', ipcHandler(async () => {
    return Signalhouse.getHealth()
  }))

  ipcMain.handle('signalhouse:status', ipcHandler(async () => {
    return Signalhouse.getStatus()
  }))

  ipcMain.handle('signalhouse:leaderboard', ipcHandler(async (_event, opts?: Signalhouse.LeaderboardOptions) => {
    return Signalhouse.getLeaderboard(opts)
  }))

  ipcMain.handle('signalhouse:strategy', ipcHandler(async (_event, id: string) => {
    return Signalhouse.getStrategy(id)
  }))

  ipcMain.handle('signalhouse:history', ipcHandler(async (_event, id: string) => {
    return Signalhouse.getStrategyHistory(id)
  }))

  ipcMain.handle('signalhouse:verdicts', ipcHandler(async (_event, limit?: number) => {
    return Signalhouse.getVerdicts(limit)
  }))

  ipcMain.handle('signalhouse:positions', ipcHandler(async (_event, limit?: number) => {
    return Signalhouse.getPositions(limit)
  }))
}

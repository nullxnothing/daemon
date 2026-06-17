import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Autopilot from '../services/AutopilotService'
import * as Scheduler from '../services/AutopilotScheduler'
import type { CreateMandateInput } from '../services/AutopilotService'

export function registerAutopilotHandlers() {
  ipcMain.handle('autopilot:state', ipcHandler(async () => {
    return Autopilot.getAutopilotState(Scheduler.isRunning())
  }))
  // Note: getAutopilotState is async (prices armed positions live).

  ipcMain.handle('autopilot:create', ipcHandler(async (_event, input: CreateMandateInput) => {
    return Autopilot.createMandate(input)
  }))

  ipcMain.handle('autopilot:arm', ipcHandler(async (_event, id: string) => {
    return Autopilot.armMandate(String(id))
  }))

  ipcMain.handle('autopilot:disarm', ipcHandler(async (_event, id: string) => {
    return Autopilot.disarmMandate(String(id))
  }))

  // Kill switch — disarm every live mandate at once.
  ipcMain.handle('autopilot:disarm-all', ipcHandler(async () => {
    return { disarmed: Autopilot.disarmAll() }
  }))

  ipcMain.handle('autopilot:delete', ipcHandler(async (_event, id: string) => {
    Autopilot.deleteMandate(String(id))
    return { ok: true }
  }))
}

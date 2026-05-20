import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as ShiplineService from '../services/ShiplineService'
import type { ShiplineCreateRunInput, ShiplineUpdateStepInput } from '../shared/types'

export function registerShiplineHandlers() {
  ipcMain.handle('shipline:create-timeline', ipcHandler(async (_event, input: ShiplineCreateRunInput) => {
    return ShiplineService.createTimelineRun(input)
  }))

  ipcMain.handle('shipline:list-timelines', ipcHandler(async (_event, projectId?: string | null, limit?: number) => {
    return ShiplineService.listTimelineRuns(projectId ?? null, limit)
  }))

  ipcMain.handle('shipline:get-timeline', ipcHandler(async (_event, id: string) => {
    return ShiplineService.getTimelineRun(id)
  }))

  ipcMain.handle('shipline:update-step', ipcHandler(async (_event, input: ShiplineUpdateStepInput) => {
    return ShiplineService.updateTimelineStep(input)
  }))
}

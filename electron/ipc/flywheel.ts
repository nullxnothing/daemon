import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Flywheel from '../services/FlywheelService'
import type { FlywheelConfigureInput } from '../shared/types'

export function registerFlywheelHandlers() {
  ipcMain.handle('flywheel:preview', ipcHandler(async (_event, input: FlywheelConfigureInput) => {
    return Flywheel.previewSplit(input)
  }))

  ipcMain.handle('flywheel:configure', ipcHandler(async (_event, input: FlywheelConfigureInput) => {
    return Flywheel.configureSplit(input)
  }))

  ipcMain.handle('flywheel:state', ipcHandler(async (_event, configId: string) => {
    return Flywheel.getFlywheelState(configId)
  }))

  ipcMain.handle('flywheel:claim', ipcHandler(async (_event, configId: string) => {
    return Flywheel.claimFees(configId)
  }))

  // Ad-hoc split of a specific SOL amount already sitting in the dev wallet (manual
  // recovery for fees claimed in an earlier session). amountSol is the gross to split.
  ipcMain.handle('flywheel:distribute', ipcHandler(async (_event, configId: string, amountSol: number) => {
    return Flywheel.distributeManual(configId, Math.round(amountSol * 1e9))
  }))

  ipcMain.handle('flywheel:buyback', ipcHandler(async (_event, configId: string, slippageBps?: number) => {
    return Flywheel.runBuyback(configId, slippageBps)
  }))

  ipcMain.handle('flywheel:run', ipcHandler(async (_event, configId: string) => {
    return Flywheel.runFlywheel(configId)
  }))

  ipcMain.handle('flywheel:run-all', ipcHandler(async () => {
    return Flywheel.runAllFlywheels()
  }))

  ipcMain.handle('flywheel:list', ipcHandler(async () => {
    return Flywheel.listConfigs()
  }))
}

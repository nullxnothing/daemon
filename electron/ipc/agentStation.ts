import { dialog, ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as AgentStation from '../services/AgentStationService'
import type { CreateAgentInput } from '../services/AgentStationService'

export function registerAgentStationHandlers() {
  ipcMain.handle('agent-station:list', ipcHandler(async () => {
    return AgentStation.listConfigs()
  }))

  ipcMain.handle('agent-station:get', ipcHandler(async (_event, id: string) => {
    const config = AgentStation.getConfig(id)
    if (!config) throw new Error('Agent config not found')
    return config
  }))

  ipcMain.handle('agent-station:create', ipcHandler(async (_event, input: CreateAgentInput) => {
    if (!input.name?.trim()) throw new Error('Name is required')
    return AgentStation.createConfig(input)
  }))

  ipcMain.handle('agent-station:delete', ipcHandler(async (_event, id: string) => {
    AgentStation.deleteAgentKey(id)
    AgentStation.deleteConfig(id)
  }))

  ipcMain.handle('agent-station:scaffold', ipcHandler(async (_event, configId: string, outputDir: string) => {
    return AgentStation.scaffoldProject(configId, outputDir)
  }))

  ipcMain.handle('agent-station:pick-output-dir', ipcHandler(async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  }))

  ipcMain.handle('agent-station:store-key', ipcHandler(async (_event, configId: string, privateKey: string) => {
    if (!configId || !privateKey) throw new Error('configId and privateKey are required')
    await AgentStation.storeAgentKey(configId, privateKey)
  }))

  ipcMain.handle('agent-station:has-key', ipcHandler(async (_event, configId: string) => {
    return AgentStation.hasAgentKey(configId)
  }))

  ipcMain.handle('agent-station:delete-key', ipcHandler(async (_event, configId: string) => {
    AgentStation.deleteAgentKey(configId)
  }))

  ipcMain.handle('agent-station:update-status', ipcHandler(async (_event, id: string, status: 'idle' | 'running' | 'stopped') => {
    AgentStation.updateStatus(id, status)
  }))
}

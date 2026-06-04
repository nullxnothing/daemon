import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Clawpump from '../services/ClawpumpService'

export function registerClawpumpHandlers() {
  ipcMain.handle('clawpump:is-configured', ipcHandler(async () => {
    return Clawpump.isConfigured()
  }))

  ipcMain.handle('clawpump:store-key', ipcHandler(async (_event, key: string) => {
    Clawpump.storeApiKey(key)
    return { ok: true }
  }))

  ipcMain.handle('clawpump:clear-key', ipcHandler(async () => {
    Clawpump.clearApiKey()
    return { ok: true }
  }))

  ipcMain.handle('clawpump:skills', ipcHandler(async () => {
    return Clawpump.listSkills()
  }))

  ipcMain.handle('clawpump:list', ipcHandler(async () => {
    return Clawpump.listAgents()
  }))

  ipcMain.handle('clawpump:get', ipcHandler(async (_event, agentId: string) => {
    return Clawpump.getAgent(agentId)
  }))

  ipcMain.handle('clawpump:messages', ipcHandler(async (_event, agentId: string, limit?: number) => {
    return Clawpump.getMessages(agentId, limit)
  }))

  ipcMain.handle('clawpump:create', ipcHandler(async (_event, input: Clawpump.CreateAgentInput) => {
    return Clawpump.createAgent(input)
  }))

  ipcMain.handle('clawpump:start', ipcHandler(async (_event, agentId: string) => {
    return Clawpump.startAgent(agentId)
  }))

  ipcMain.handle('clawpump:stop', ipcHandler(async (_event, agentId: string) => {
    return Clawpump.stopAgent(agentId)
  }))

  ipcMain.handle('clawpump:delete', ipcHandler(async (_event, agentId: string) => {
    return Clawpump.deleteAgent(agentId)
  }))

  ipcMain.handle('clawpump:chat', ipcHandler(async (_event, agentId: string, message: string) => {
    return Clawpump.chat(agentId, message)
  }))
}

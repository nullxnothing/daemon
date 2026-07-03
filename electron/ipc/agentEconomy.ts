import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as AgentEconomyService from '../services/AgentEconomyService'
import type {
  AgentEconomyExecutePaidCallInput,
  AgentEconomyListReceiptsInput,
  AgentEconomyPolicyCheckInput,
  AgentEconomyReadAgentIdentityInput,
  AgentEconomyRegisterDevnetAgentInput,
  AgentEconomySetPolicyInput,
  AgentEconomyUpsertProfileInput,
} from '../shared/types'

export function registerAgentEconomyHandlers() {
  ipcMain.handle('agent-economy:list-profiles', ipcHandler(async (_event, projectId?: string | null) => {
    return AgentEconomyService.listProfiles(projectId ?? null)
  }))

  ipcMain.handle('agent-economy:upsert-profile', ipcHandler(async (_event, input: AgentEconomyUpsertProfileInput) => {
    return AgentEconomyService.upsertProfile(input)
  }))

  ipcMain.handle('agent-economy:get-profile', ipcHandler(async (_event, profileId: string) => {
    return AgentEconomyService.getProfile(profileId)
  }))

  ipcMain.handle('agent-economy:set-policy', ipcHandler(async (_event, input: AgentEconomySetPolicyInput) => {
    return AgentEconomyService.setPolicy(input)
  }))

  ipcMain.handle('agent-economy:check-policy', ipcHandler(async (_event, input: AgentEconomyPolicyCheckInput) => {
    return AgentEconomyService.checkPolicy(input)
  }))

  ipcMain.handle('agent-economy:execute-paid-call', ipcHandler(async (_event, input: AgentEconomyExecutePaidCallInput) => {
    return AgentEconomyService.executePaidCall(input)
  }))

  ipcMain.handle('agent-economy:list-receipts', ipcHandler(async (_event, input?: AgentEconomyListReceiptsInput) => {
    return AgentEconomyService.listReceipts(input ?? {})
  }))

  ipcMain.handle('agent-economy:register-devnet-agent', ipcHandler(async (_event, input: AgentEconomyRegisterDevnetAgentInput) => {
    return AgentEconomyService.registerDevnetAgent(input)
  }))

  ipcMain.handle('agent-economy:read-agent-identity', ipcHandler(async (_event, input: AgentEconomyReadAgentIdentityInput) => {
    return AgentEconomyService.readAgentIdentity(input)
  }))
}

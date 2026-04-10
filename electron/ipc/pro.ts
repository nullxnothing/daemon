import { ipcMain } from 'electron'
import * as ProService from '../services/ProService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { ArenaSubmissionInput } from '../shared/types'

export function registerProHandlers() {
  ipcMain.handle('pro:status', ipcHandler(async () => {
    return ProService.getLocalSubscriptionState()
  }))

  ipcMain.handle('pro:refresh-status', ipcHandler(async (_event, walletAddress: string) => {
    if (!walletAddress || typeof walletAddress !== 'string') throw new Error('walletAddress required')
    return ProService.refreshStatusFromServer(walletAddress)
  }))

  ipcMain.handle('pro:fetch-price', ipcHandler(async () => {
    return ProService.fetchPrice()
  }))

  ipcMain.handle('pro:subscribe', ipcHandler(async (_event, walletId: string) => {
    if (!walletId || typeof walletId !== 'string') throw new Error('walletId required')
    return ProService.subscribe(walletId)
  }))

  ipcMain.handle('pro:claim-holder-access', ipcHandler(async (_event, walletId: string) => {
    if (!walletId || typeof walletId !== 'string') throw new Error('walletId required')
    return ProService.claimHolderAccess(walletId)
  }))

  ipcMain.handle('pro:sign-out', ipcHandler(async () => {
    ProService.signOut()
  }))

  ipcMain.handle('pro:arena-list', ipcHandler(async () => {
    return ProService.listArenaSubmissions()
  }))

  ipcMain.handle('pro:arena-submit', ipcHandler(async (_event, input: ArenaSubmissionInput) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid submission input')
    return ProService.submitToArena(input)
  }))

  ipcMain.handle('pro:arena-vote', ipcHandler(async (_event, submissionId: string) => {
    if (!submissionId || typeof submissionId !== 'string') throw new Error('submissionId required')
    await ProService.voteArenaSubmission(submissionId)
  }))

  ipcMain.handle('pro:skills-manifest', ipcHandler(async () => {
    return ProService.fetchProSkillsManifest()
  }))

  ipcMain.handle('pro:skills-sync', ipcHandler(async () => {
    return ProService.syncAllProSkills()
  }))

  ipcMain.handle('pro:skills-download', ipcHandler(async (_event, skillId: string) => {
    if (!skillId || typeof skillId !== 'string') throw new Error('skillId required')
    return ProService.downloadProSkill(skillId)
  }))

  ipcMain.handle('pro:quota', ipcHandler(async () => {
    return ProService.getPriorityApiQuota()
  }))

  ipcMain.handle('pro:mcp-push', ipcHandler(async () => {
    const count = await ProService.pushLocalClaudeConfig()
    return { count }
  }))

  ipcMain.handle('pro:mcp-pull', ipcHandler(async () => {
    const count = await ProService.pullMcpConfigToLocal()
    return { count }
  }))
}

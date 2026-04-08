import { ipcMain } from 'electron'
import * as ProService from '../services/ProService'
import { ipcHandler } from '../services/IpcHandlerFactory'
import type { ArenaSubmissionInput } from '../shared/types'

/**
 * IPC handlers for Daemon Pro.
 *
 * Every handler returns { ok, data } / { ok, error } via ipcHandler. The
 * renderer never talks to the Pro API directly — it goes through these
 * handlers, which keeps the JWT on the main-process side and means the
 * renderer can be sandboxed as usual.
 *
 * Error strategy: handlers throw; ipcHandler catches and converts to
 * { ok: false, error }. Callers in the renderer check .ok before using .data.
 */

export function registerProHandlers() {
  ipcMain.handle('pro:status', ipcHandler(async () => {
    return ProService.getLocalSubscriptionState()
  }))

  ipcMain.handle('pro:refresh-status', ipcHandler(async (_event, walletAddress: string) => {
    if (!walletAddress || typeof walletAddress !== 'string') {
      throw new Error('walletAddress required')
    }
    return await ProService.refreshStatusFromServer(walletAddress)
  }))

  ipcMain.handle('pro:fetch-price', ipcHandler(async () => {
    return await ProService.fetchPrice()
  }))

  ipcMain.handle('pro:subscribe', ipcHandler(async (_event, walletId: string) => {
    if (!walletId || typeof walletId !== 'string') {
      throw new Error('walletId required')
    }
    return await ProService.subscribe(walletId)
  }))

  ipcMain.handle('pro:claim-holder-access', ipcHandler(async (_event, walletId: string) => {
    if (!walletId || typeof walletId !== 'string') {
      throw new Error('walletId required')
    }
    return await ProService.claimHolderAccess(walletId)
  }))

  ipcMain.handle('pro:sign-out', ipcHandler(async () => {
    ProService.signOut()
  }))

  // --- MCP sync ---

  ipcMain.handle('pro:mcp-push', ipcHandler(async () => {
    const count = await ProService.pushLocalClaudeConfig()
    return { count }
  }))

  ipcMain.handle('pro:mcp-pull', ipcHandler(async () => {
    const count = await ProService.pullMcpConfigToLocal()
    return { count }
  }))

  // --- Arena ---

  ipcMain.handle('pro:arena-list', ipcHandler(async () => {
    return await ProService.listArenaSubmissions()
  }))

  ipcMain.handle('pro:arena-submit', ipcHandler(async (_event, input: ArenaSubmissionInput) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid submission input')
    return await ProService.submitToArena(input)
  }))

  ipcMain.handle('pro:arena-vote', ipcHandler(async (_event, submissionId: string) => {
    if (!submissionId || typeof submissionId !== 'string') throw new Error('submissionId required')
    await ProService.voteArenaSubmission(submissionId)
  }))

  // --- Pro skills ---

  ipcMain.handle('pro:skills-manifest', ipcHandler(async () => {
    return await ProService.fetchProSkillsManifest()
  }))

  ipcMain.handle('pro:skills-sync', ipcHandler(async () => {
    return await ProService.syncAllProSkills()
  }))

  ipcMain.handle('pro:skills-download', ipcHandler(async (_event, skillId: string) => {
    if (!skillId || typeof skillId !== 'string') throw new Error('skillId required')
    return await ProService.downloadProSkill(skillId)
  }))

  // --- Priority API quota ---

  ipcMain.handle('pro:quota', ipcHandler(async () => {
    return await ProService.getPriorityApiQuota()
  }))
}

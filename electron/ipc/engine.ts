import { ipcMain, BrowserWindow } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as Engine from '../services/EngineService'
import * as JuiceService from '../services/JuiceService'
import type { EngineAction } from '../shared/types'

async function runJuiceEngineAction(action: EngineAction) {
  const type = String((action as { type: string }).type)
  const payload = (action.payload ?? {}) as Record<string, unknown>

  switch (type) {
    case 'juice:has-key':
      return { ok: true, action: type, data: JuiceService.hasJuiceKey() }
    case 'juice:list-wallets':
      return { ok: true, action: type, data: await JuiceService.listWallets() }
    case 'juice:get-balances': {
      const walletId = String(payload.walletId ?? '')
      if (!walletId) return { ok: false, action: type, error: 'walletId is required' }
      return { ok: true, action: type, data: await JuiceService.getBalances(walletId) }
    }
    case 'juice:get-pnl': {
      const walletId = String(payload.walletId ?? '')
      if (!walletId) return { ok: false, action: type, error: 'walletId is required' }
      return { ok: true, action: type, data: await JuiceService.getPnl(walletId) }
    }
    case 'juice:get-mint-details': {
      const mint = String(payload.mint ?? '')
      if (!mint) return { ok: false, action: type, error: 'mint is required' }
      return { ok: true, action: type, data: await JuiceService.getMintDetails(mint) }
    }
    case 'juice:get-scouting-report':
      return { ok: true, action: type, data: await JuiceService.getScoutingReport() }
    default:
      return null
  }
}

export function registerEngineHandlers() {
  // Run an engine action (the main entry point)
  ipcMain.handle('engine:run', ipcHandler(async (_event, action: EngineAction) => {
    const juiceResult = await runJuiceEngineAction(action)
    if (juiceResult) return juiceResult
    return Engine.runAction(action)
  }))

  // Get current cross-project context snapshot
  ipcMain.handle('engine:context', ipcHandler(async () => {
    return Engine.getContext()
  }))

  // Convenience: 1-click fix CLAUDE.md for a project
  ipcMain.handle('engine:fix-claude-md', ipcHandler(async (_event, projectId: string) => {
    return Engine.runAction({ type: 'fix-claude-md', projectId })
  }))

  // Convenience: 1-click generate CLAUDE.md for a project
  ipcMain.handle('engine:generate-claude-md', ipcHandler(async (_event, projectId: string) => {
    return Engine.runAction({ type: 'generate-claude-md', projectId })
  }))

  // Convenience: debug a project's setup
  ipcMain.handle('engine:debug-setup', ipcHandler(async (_event, projectId: string, question?: string) => {
    return Engine.runAction({
      type: 'debug-setup',
      projectId,
      payload: question ? { question } : undefined,
    })
  }))

  // Convenience: health check all projects
  ipcMain.handle('engine:health-check', ipcHandler(async () => {
    return Engine.runAction({ type: 'health-check' })
  }))

  // Convenience: explain an error
  ipcMain.handle('engine:explain-error', ipcHandler(async (_event, error: string, projectId?: string) => {
    return Engine.runAction({
      type: 'explain-error',
      projectId,
      payload: { error },
    })
  }))

  // Convenience: free-form ask with cross-project context
  ipcMain.handle('engine:ask', ipcHandler(async (_event, question: string, projectId?: string) => {
    return Engine.runAction({
      type: 'ask',
      projectId,
      payload: { question },
    })
  }))
}

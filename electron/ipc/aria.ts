import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as AriaAgentService from '../services/AriaAgentService'
import * as DaemonAIService from '../services/DaemonAIService'
import type { AriaTransport } from '../services/AriaAgentService'
import type { AriaContextSnapshot, AriaUiEffect } from '../services/aria/AriaTool'
import type { AriaToolEvent, AriaPatchAction, DaemonAiModelLane } from '../shared/types'

// Pending round-trips keyed by id: approvals, patch decisions, and two-phase ui-effect data.
const pendingApprovals = new Map<string, (approved: boolean) => void>()
const pendingDecisions = new Map<string, (action: AriaPatchAction) => void>()
const pendingEffects = new Map<string, (data: unknown) => void>()

let effectSeq = 0

function makeTransport(sender: WebContents): AriaTransport {
  const emit = (event: AriaToolEvent) => {
    if (!sender.isDestroyed()) sender.send('aria:tool-event', event)
  }
  return {
    emit,
    requestApproval: (req) =>
      new Promise<boolean>((resolve) => {
        pendingApprovals.set(req.callId, resolve)
        emit({ kind: 'approval-request', callId: req.callId, name: req.name, risk: req.risk, summary: req.summary, input: req.input })
      }),
    requestPatchDecision: (proposal) =>
      new Promise<AriaPatchAction>((resolve) => {
        pendingDecisions.set(proposal.id, resolve)
        emit({ kind: 'patch-proposal', messageId: proposal.id, proposal })
      }),
    runUiEffect: (effect: AriaUiEffect, awaitData: boolean) =>
      new Promise<unknown>((resolve) => {
        const callId = `effect-${++effectSeq}`
        if (awaitData) {
          pendingEffects.set(callId, resolve)
          sender.send('aria:ui-effect', { callId, effect, awaitData })
        } else {
          sender.send('aria:ui-effect', { callId, effect, awaitData })
          resolve(undefined)
        }
      }),
  }
}

export function registerAriaHandlers() {
  ipcMain.handle('aria:send', ipcHandler(async (
    event,
    sessionId: string,
    message: string,
    snapshot: AriaContextSnapshot,
    modelLane?: DaemonAiModelLane,
  ) => {
    if (!message?.trim()) throw new Error('Message cannot be empty')
    const transport = makeTransport(event.sender)
    return await AriaAgentService.sendMessage(sessionId, message.trim(), snapshot, transport, modelLane)
  }))

  ipcMain.handle('aria:models', ipcHandler(async () => {
    return DaemonAIService.getModels()
  }))

  ipcMain.handle('aria:history', ipcHandler(async (_event, sessionId: string, limit?: number) => {
    return AriaAgentService.getHistory(sessionId, limit)
  }))

  ipcMain.handle('aria:clear', ipcHandler(async (_event, sessionId: string) => {
    AriaAgentService.clearSession(sessionId)
  }))

  ipcMain.handle('aria:sessions:list', ipcHandler(async (_event, projectId?: string | null) => {
    return AriaAgentService.listSessions(projectId ?? null)
  }))

  ipcMain.handle('aria:sessions:create', ipcHandler(async (_event, projectId?: string | null, title?: string | null) => {
    return AriaAgentService.createSession(projectId ?? null, title ?? null)
  }))

  ipcMain.handle('aria:sessions:rename', ipcHandler(async (_event, sessionId: string, title: string) => {
    AriaAgentService.renameSession(sessionId, title)
  }))

  ipcMain.handle('aria:sessions:archive', ipcHandler(async (_event, sessionId: string) => {
    AriaAgentService.archiveSession(sessionId)
  }))

  ipcMain.handle('aria:sessions:delete', ipcHandler(async (_event, sessionId: string) => {
    AriaAgentService.deleteSession(sessionId)
  }))

  // Renderer resolves a pending approval.
  ipcMain.on('aria:approve', (_event, callId: string, approved: boolean) => {
    const resolve = pendingApprovals.get(callId)
    if (resolve) {
      pendingApprovals.delete(callId)
      resolve(Boolean(approved))
    }
  })

  // Renderer resolves a pending patch decision (keep / run-tests / discard).
  ipcMain.on('aria:patch-decision', (_event, proposalId: string, action: AriaPatchAction) => {
    const resolve = pendingDecisions.get(proposalId)
    if (resolve) {
      pendingDecisions.delete(proposalId)
      resolve(action)
    }
  })

  // Renderer posts back data for a two-phase ui-effect (e.g. integration check).
  ipcMain.on('aria:tool-effect-result', (_event, callId: string, data: unknown) => {
    const resolve = pendingEffects.get(callId)
    if (resolve) {
      pendingEffects.delete(callId)
      resolve(data)
    }
  })
}

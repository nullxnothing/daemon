import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import { isTrustedSender } from '../security/ipcSender'
import * as AriaAgentService from '../services/AriaAgentService'
import * as DaemonAIService from '../services/DaemonAIService'
import type { AriaTransport, AriaEmitEvent } from '../services/AriaAgentService'
import type { AriaContextSnapshot, AriaUiEffect } from '../services/aria/AriaTool'
import type { AriaToolEvent, AriaPatchAction, DaemonAiModelLane } from '../shared/types'

// Pending round-trips keyed by id: approvals, patch decisions, and two-phase ui-effect data.
const pendingApprovals = new Map<string, (approved: boolean) => void>()
const pendingDecisions = new Map<string, (action: AriaPatchAction) => void>()
const pendingEffects = new Map<string, (data: unknown) => void>()

let effectSeq = 0

function makeTransport(sender: WebContents, sessionId: string): AriaTransport {
  // Stamp every streamed event with messageId === sessionId so the renderer's
  // session-isolation guard can route uniformly. tool-call / approval-request /
  // patch-proposal are emitted from deep call sites without an explicit
  // messageId, so we inject the session id here rather than trusting each site
  // (a missing tag would silently drop the event and hang the turn).
  const emit = (event: AriaEmitEvent) => {
    const tagged: AriaToolEvent =
      'messageId' in event && event.messageId
        ? (event as AriaToolEvent)
        : ({ ...event, messageId: sessionId } as AriaToolEvent)
    if (!sender.isDestroyed()) sender.send('aria:tool-event', tagged)
  }
  return {
    emit,
    requestApproval: (req) =>
      new Promise<boolean>((resolve) => {
        pendingApprovals.set(req.callId, resolve)
        emit({ kind: 'approval-request', messageId: sessionId, callId: req.callId, name: req.name, risk: req.risk, summary: req.summary, input: req.input, fee: req.fee })
      }),
    requestPatchDecision: (proposal) =>
      new Promise<AriaPatchAction>((resolve) => {
        pendingDecisions.set(proposal.id, resolve)
        emit({ kind: 'patch-proposal', messageId: sessionId, proposal })
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
    const transport = makeTransport(event.sender, sessionId)
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

  // Renderer resolves a pending approval. These raw channels resolve write/sensitive actions,
  // so — like bridge:approve and terminal's raw channels — they must reject an untrusted sender:
  // a spoofed frame here would convert directly into an approved mainnet action.
  ipcMain.on('aria:approve', (event, callId: string, approved: boolean) => {
    if (!isTrustedSender(event)) return
    const resolve = pendingApprovals.get(callId)
    if (resolve) {
      pendingApprovals.delete(callId)
      resolve(Boolean(approved))
    }
  })

  // Renderer resolves a pending patch decision (keep / run-tests / discard).
  ipcMain.on('aria:patch-decision', (event, proposalId: string, action: AriaPatchAction) => {
    if (!isTrustedSender(event)) return
    const resolve = pendingDecisions.get(proposalId)
    if (resolve) {
      pendingDecisions.delete(proposalId)
      resolve(action)
    }
  })

  // Renderer posts back data for a two-phase ui-effect (e.g. integration check).
  ipcMain.on('aria:tool-effect-result', (event, callId: string, data: unknown) => {
    if (!isTrustedSender(event)) return
    const resolve = pendingEffects.get(callId)
    if (resolve) {
      pendingEffects.delete(callId)
      resolve(data)
    }
  })
}

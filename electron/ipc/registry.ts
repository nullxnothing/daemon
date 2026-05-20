import { dialog, ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as SessionTracker from '../services/SessionTracker'
import * as SessionRegistryService from '../services/SessionRegistryService'
import * as AgentWorkService from '../services/AgentWorkService'
import { loadKeypair } from '../services/SolanaService'
import { getDb } from '../db/db'
import type { AgentWorkCreateInput, AgentWorkSubmitInput } from '../shared/types'

interface WalletRow {
  id: string
}

async function confirmRegistryAction(options: {
  title: string
  message: string
  detail: string
  confirmLabel: string
}): Promise<void> {
  if (process.env.DAEMON_SMOKE_TEST === '1') return

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', options.confirmLabel],
    defaultId: 0,
    cancelId: 0,
    title: options.title,
    message: options.message,
    detail: options.detail,
    noLink: true,
  })

  if (response !== 1) throw new Error(`${options.title} cancelled by user`)
}

function getDefaultWalletId(): string | null {
  try {
    const row = getDb().prepare('SELECT id FROM wallets WHERE is_default = 1 LIMIT 1').get() as WalletRow | undefined
    return row?.id ?? null
  } catch {
    return null
  }
}

export function registerRegistryHandlers() {
  ipcMain.handle('registry:list-sessions', ipcHandler(async (_event, limit?: number) => {
    return SessionTracker.listSessions({ limit: limit ?? 50 })
  }))

  ipcMain.handle('registry:rename-session', ipcHandler(async (_event, sessionId: string, customName: string) => {
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('Invalid session ID')
    if (typeof customName !== 'string') throw new Error('Invalid name')
    SessionTracker.renameSession(sessionId, customName)
    return null
  }))

  ipcMain.handle('registry:get-profile', ipcHandler(async () => {
    return SessionTracker.getProfileStats()
  }))

  ipcMain.handle('registry:list-agent-work', ipcHandler(async (_event, limit?: number) => {
    return AgentWorkService.listTasks(limit ?? 50)
  }))

  ipcMain.handle('registry:create-agent-work', ipcHandler(async (_event, input: AgentWorkCreateInput) => {
    return AgentWorkService.createTask(input)
  }))

  ipcMain.handle('registry:fund-agent-work', ipcHandler(async (_event, taskId: string) => {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task ID')
    await confirmRegistryAction({
      title: 'Fund Agent Work',
      message: 'Fund this agent work task on devnet?',
      detail: `Task ID: ${taskId}`,
      confirmLabel: 'Fund Task',
    })
    return AgentWorkService.fundTask(taskId)
  }))

  ipcMain.handle('registry:start-agent-work', ipcHandler(async (_event, taskId: string, sessionId?: string | null) => {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task ID')
    return AgentWorkService.startTask(taskId, sessionId ?? null)
  }))

  ipcMain.handle('registry:submit-agent-work', ipcHandler(async (_event, taskId: string, input?: AgentWorkSubmitInput) => {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task ID')
    return AgentWorkService.submitReceipt(taskId, input ?? {})
  }))

  ipcMain.handle('registry:approve-agent-work', ipcHandler(async (_event, taskId: string) => {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task ID')
    await confirmRegistryAction({
      title: 'Approve Agent Work',
      message: 'Approve this submitted work receipt?',
      detail: `Task ID: ${taskId}`,
      confirmLabel: 'Approve Work',
    })
    return AgentWorkService.approveTask(taskId)
  }))

  ipcMain.handle('registry:reject-agent-work', ipcHandler(async (_event, taskId: string) => {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task ID')
    await confirmRegistryAction({
      title: 'Reject Agent Work',
      message: 'Reject this submitted work receipt?',
      detail: `Task ID: ${taskId}`,
      confirmLabel: 'Reject Work',
    })
    return AgentWorkService.rejectTask(taskId)
  }))

  ipcMain.handle('registry:settle-agent-work', ipcHandler(async (_event, taskId: string, signature?: string | null) => {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task ID')
    await confirmRegistryAction({
      title: 'Settle Agent Work',
      message: 'Settle this task and finalize the receipt trail?',
      detail: `Task ID: ${taskId}`,
      confirmLabel: 'Settle Task',
    })
    return AgentWorkService.settleTask(taskId, signature ?? null)
  }))

  ipcMain.handle('registry:expire-agent-work', ipcHandler(async (_event, taskId: string) => {
    if (typeof taskId !== 'string' || !taskId) throw new Error('Invalid task ID')
    await confirmRegistryAction({
      title: 'Expire Agent Work',
      message: 'Expire this task and finalize the refund/expiry path?',
      detail: `Task ID: ${taskId}`,
      confirmLabel: 'Expire Task',
    })
    return AgentWorkService.expireTask(taskId)
  }))

  ipcMain.handle('registry:publish-session', ipcHandler(async (_event, sessionId: string) => {
    const sessions = SessionTracker.listSessions({ limit: 1000 })
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) throw new Error('Session not found')
    if (session.published_signature) throw new Error('Session already published')
    if (session.status !== 'completed') throw new Error('Can only publish completed sessions')

    await confirmRegistryAction({
      title: 'Publish Agent Session',
      message: 'Publish this completed agent session to the registry?',
      detail: `Session ID: ${sessionId}`,
      confirmLabel: 'Publish Session',
    })

    const walletId = getDefaultWalletId()
    if (!walletId) throw new Error('No default wallet configured. Set a default wallet in the Wallet panel.')

    const keypair = loadKeypair(walletId)

    try {
      const onChainId = SessionRegistryService.sessionIdToU64(session.id)
      const projectName = session.project_id ?? 'unknown'

      const modelIndex = resolveModelIndex(session.model)

      const startSig = await SessionRegistryService.publishStartSession({
        walletKeypair: keypair,
        sessionId: onChainId,
        projectName,
        agentCount: 1,
        modelsUsed: [modelIndex, 0, 0, 0],
      })

      const merkleRoot = SessionRegistryService.buildToolsMerkleRoot(session.tools_used)

      const endSig = await SessionRegistryService.publishEndSession({
        walletKeypair: keypair,
        sessionId: onChainId,
        toolsMerkleRoot: merkleRoot,
        linesGenerated: session.lines_generated,
      })

      SessionTracker.markPublished(session.id, endSig)

      return { startSignature: startSig, endSignature: endSig }
    } finally {
      keypair.secretKey.fill(0)
    }
  }))

  ipcMain.handle('registry:publish-all', ipcHandler(async () => {
    const walletId = getDefaultWalletId()
    if (!walletId) throw new Error('No default wallet configured.')

    const unpublished = SessionTracker.getUnpublishedSessions()
    if (unpublished.length === 0) return { published: 0, failed: 0 }

    await confirmRegistryAction({
      title: 'Publish All Sessions',
      message: `Publish ${unpublished.length} completed agent session(s) to the registry?`,
      detail: 'Each publish writes registry state using the default wallet.',
      confirmLabel: 'Publish All',
    })

    const keypair = loadKeypair(walletId)
    let published = 0
    let failed = 0

    try {
      for (const session of unpublished) {
        try {
          const onChainId = SessionRegistryService.sessionIdToU64(session.id)
          const projectName = session.project_id ?? 'unknown'
          const modelIndex = resolveModelIndex(session.model)

          await SessionRegistryService.publishStartSession({
            walletKeypair: keypair,
            sessionId: onChainId,
            projectName,
            agentCount: 1,
            modelsUsed: [modelIndex, 0, 0, 0],
          })

          const merkleRoot = SessionRegistryService.buildToolsMerkleRoot(session.tools_used)

          const endSig = await SessionRegistryService.publishEndSession({
            walletKeypair: keypair,
            sessionId: onChainId,
            toolsMerkleRoot: merkleRoot,
            linesGenerated: session.lines_generated,
          })

          SessionTracker.markPublished(session.id, endSig)
          published++
        } catch (err) {
          console.warn('[Registry] failed to publish session', session.id, (err as Error).message)
          failed++
        }
      }
    } finally {
      keypair.secretKey.fill(0)
    }

    return { published, failed }
  }))
}

function resolveModelIndex(model: string | null): number {
  if (!model) return 0
  const lower = model.toLowerCase()
  if (lower.includes('opus')) return 1
  if (lower.includes('sonnet')) return 2
  if (lower.includes('haiku')) return 3
  return 0
}

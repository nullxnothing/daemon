import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as SessionTracker from '../services/SessionTracker'
import * as SessionRegistryService from '../services/SessionRegistryService'
import { loadKeypair } from '../services/SolanaService'
import { getDb } from '../db/db'

interface WalletRow {
  id: string
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

  ipcMain.handle('registry:get-profile', ipcHandler(async () => {
    return SessionTracker.getProfileStats()
  }))

  ipcMain.handle('registry:publish-session', ipcHandler(async (_event, sessionId: string) => {
    const sessions = SessionTracker.listSessions({ limit: 1000 })
    const session = sessions.find((s) => s.id === sessionId)
    if (!session) throw new Error('Session not found')
    if (session.published_signature) throw new Error('Session already published')
    if (session.status !== 'completed') throw new Error('Can only publish completed sessions')

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

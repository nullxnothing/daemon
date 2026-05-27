import { clipboard, dialog, ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as ProofPool from '../services/ProofPoolService'
import { ValidationService } from '../services/ValidationService'
import type {
  CreateProofPoolInput,
  ConfigureProofPartnerCredentialsInput,
  CreateProofPartnerSessionInput,
  ImportProofVanityMintInput,
  ProofBackingActionInput,
  ProofClaimFeesInput,
  VerifyProofBackingInput,
} from '../shared/types'

export function registerProofPoolHandlers() {
  ipcMain.handle('proof:escrow-status', ipcHandler(async () => ProofPool.getEscrowStatusWithBalance()))

  ipcMain.handle('proof:configure-escrow', ipcHandler(async (_event, input?: { privateKeyBase58?: string | null; allowRotation?: boolean | null }) => {
    return ProofPool.configureEscrow(input)
  }))

  ipcMain.handle('proof:export-escrow', ipcHandler(async () => {
    if (!ValidationService.checkRateLimit('proof-export-escrow', 3, 5 * 60 * 1000)) {
      throw new Error('Too many export attempts. Please wait 5 minutes.')
    }
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Export Key'],
      defaultId: 0,
      cancelId: 0,
      title: 'Export Proof Escrow Key',
      message: 'This will expose the Proof platform escrow private key in plaintext.',
      detail: 'Only proceed if you are backing up or migrating custody.',
    })
    if (response === 0) throw new Error('Export cancelled by user')
    const key = ProofPool.exportEscrowPrivateKey()
    clipboard.writeText(key.privateKeyBase58)
    setTimeout(() => {
      if (clipboard.readText() === key.privateKeyBase58) clipboard.writeText('')
    }, 30_000)
    return { copied: true, address: key.address, expiresInMs: 30_000 }
  }))

  ipcMain.handle('proof:list-pools', ipcHandler(async () => ProofPool.listPools()))

  ipcMain.handle('proof:get-pool', ipcHandler(async (_event, poolId: string) => ProofPool.getPool(poolId)))

  ipcMain.handle('proof:create-pool', ipcHandler(async (_event, input: CreateProofPoolInput) => {
    return ProofPool.createPool(input)
  }))

  ipcMain.handle('proof:verify-backing', ipcHandler(async (_event, input: VerifyProofBackingInput) => {
    return await ProofPool.verifyBacking(input)
  }))

  ipcMain.handle('proof:launch-pool', ipcHandler(async (_event, poolId: string) => {
    return await ProofPool.launchPool(poolId)
  }))

  ipcMain.handle('proof:distribute-pool', ipcHandler(async (_event, poolId: string) => {
    return await ProofPool.distributePool(poolId)
  }))

  ipcMain.handle('proof:distribute-backing', ipcHandler(async (_event, input: ProofBackingActionInput) => {
    return await ProofPool.distributeBacking(input)
  }))

  ipcMain.handle('proof:refund-pool', ipcHandler(async (_event, poolId: string) => {
    return await ProofPool.refundPool(poolId, false)
  }))

  ipcMain.handle('proof:refund-backing', ipcHandler(async (_event, input: ProofBackingActionInput) => {
    return await ProofPool.refundBacking({ backingId: input.backingId })
  }))

  ipcMain.handle('proof:collect-fees', ipcHandler(async (_event, poolId: string) => {
    return await ProofPool.collectFees(poolId)
  }))

  ipcMain.handle('proof:claim-fees', ipcHandler(async (_event, input: ProofClaimFeesInput) => {
    return await ProofPool.claimFees(input)
  }))

  ipcMain.handle('proof:import-vanity-mint', ipcHandler(async (_event, input: ImportProofVanityMintInput) => {
    return ProofPool.importVanityMint(input)
  }))

  ipcMain.handle('proof:pick-image', ipcHandler(async () => ProofPool.pickImage()))

  ipcMain.handle('proof:partner-config-status', ipcHandler(async () => {
    return ProofPool.getPartnerCredentialStatus()
  }))

  ipcMain.handle('proof:configure-partner-credentials', ipcHandler(async (_event, input: ConfigureProofPartnerCredentialsInput) => {
    return ProofPool.configurePartnerCredentials(input)
  }))

  ipcMain.handle('proof:list-partner-sessions', ipcHandler(async () => ProofPool.listPartnerSessions()))

  ipcMain.handle('proof:create-partner-session', ipcHandler(async (_event, input: CreateProofPartnerSessionInput) => {
    return await ProofPool.createPartnerSession(input)
  }))

  ipcMain.handle('proof:get-partner-session', ipcHandler(async (_event, sessionId: string) => {
    return ProofPool.getPartnerSession(sessionId)
  }))

  ipcMain.handle('proof:poll-partner-session', ipcHandler(async (_event, sessionId: string) => {
    return await ProofPool.pollPartnerSession(sessionId)
  }))

  ipcMain.handle('proof:partner-prefill', ipcHandler(async (_event, sessionId: string) => {
    return await ProofPool.fetchPartnerPrefill(sessionId)
  }))
}

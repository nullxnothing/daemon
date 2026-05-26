import { ipcMain } from 'electron'
import { PublicKey } from '@solana/web3.js'
import { ipcHandler } from '../services/IpcHandlerFactory'

interface AgentOpsDerivedAccounts {
  agentIdentityPda?: string
  assetSignerPda?: string
}

const AGENT_IDENTITY_PROGRAM_ID = '1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p'
const MPL_CORE_PROGRAM_ID = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'

function isLikelySolanaAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim())
}

function textSeed(value: string) {
  return new TextEncoder().encode(value)
}

function deriveAccounts(assetAddress: string): AgentOpsDerivedAccounts {
  const trimmed = assetAddress.trim()
  if (!isLikelySolanaAddress(trimmed)) return {}

  const asset = new PublicKey(trimmed)
  const identityProgram = new PublicKey(AGENT_IDENTITY_PROGRAM_ID)
  const coreProgram = new PublicKey(MPL_CORE_PROGRAM_ID)
  const [agentIdentityPda] = PublicKey.findProgramAddressSync([textSeed('agent_identity'), asset.toBytes()], identityProgram)
  const [assetSignerPda] = PublicKey.findProgramAddressSync([textSeed('mpl-core-execute'), asset.toBytes()], coreProgram)

  return {
    agentIdentityPda: agentIdentityPda.toBase58(),
    assetSignerPda: assetSignerPda.toBase58(),
  }
}

export function registerAgentOpsHandlers() {
  ipcMain.handle('agentops:derive-accounts', ipcHandler(async (_event, assetAddress: string) => {
    return deriveAccounts(assetAddress)
  }))
}
